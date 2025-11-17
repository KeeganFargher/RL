import * as fs from "fs";
import * as path from "path";
import { Environment } from "../simulation/Environment.js";
import {
  Action,
  AgentType,
  EnvironmentConfig,
} from "../simulation/types.js";
import { PolicyNetwork } from "./PolicyNetwork.js";
import { ReplayBuffer } from "./ReplayBuffer.js";
import {
  flattenObservation,
  GenerationSample,
  ReplayDataset,
  TrainerConfig,
  TrainingMetrics,
} from "./types.js";

const ACTIONS: Action[] = [
  "stay",
  "up",
  "down",
  "left",
  "right",
  "up-left",
  "up-right",
  "down-left",
  "down-right",
];

export class Trainer {
  private readonly config: TrainerConfig;

  constructor(config: TrainerConfig) {
    this.config = config;
  }

  async run(): Promise<ReplayDataset> {
    const envConfig: EnvironmentConfig = {
      width: this.config.mapWidth,
      height: this.config.mapHeight,
      obstacleDensity: this.config.obstacleDensity,
      hiderCount: this.config.hiders,
      seekerCount: this.config.seekers,
      hiderTraits: this.config.hiderTraits,
      seekerTraits: this.config.seekerTraits,
      maxSteps: this.config.maxSteps,
    };

    const env = new Environment(envConfig);

    const featureExtra = 6; // extra normalized features appended in flattenObservation
    const hiderObsSize = Math.pow(this.config.hiderTraits.vision * 2 + 1, 2) + featureExtra;
    const seekerObsSize = Math.pow(this.config.seekerTraits.vision * 2 + 1, 2) + featureExtra;
    const hiderNet = new PolicyNetwork(hiderObsSize, ACTIONS.length, this.config.learningRate);
    const seekerNet = new PolicyNetwork(seekerObsSize, ACTIONS.length, this.config.learningRate);
    const hiderBuffer = new ReplayBuffer(this.config.replayCapacity);
    const seekerBuffer = new ReplayBuffer(this.config.replayCapacity);

    let epsilon = this.config.epsilonStart;

    const dataset: ReplayDataset = {
      seed: this.config.seed,
      config: {
        seed: this.config.seed,
        mapWidth: this.config.mapWidth,
        mapHeight: this.config.mapHeight,
        obstacleDensity: this.config.obstacleDensity,
        hiders: this.config.hiders,
        seekers: this.config.seekers,
        hiderTraits: this.config.hiderTraits,
        seekerTraits: this.config.seekerTraits,
        generations: this.config.generations,
        maxSteps: this.config.maxSteps,
        snapshotInterval: this.config.snapshotInterval,
      },
      snapshotInterval: this.config.snapshotInterval,
      generations: [],
    };

    for (let gen = 0; gen < this.config.generations; gen++) {
      const seed = `${this.config.seed}-${gen}`;
      env.reset(seed);

      const metrics: TrainingMetrics = { rewardHiders: 0, rewardSeekers: 0, captures: 0 };
      const sampleFrames: GenerationSample["episode"] = [];
      const captureSample = gen % this.config.snapshotInterval === 0;

      for (let step = 0; step < this.config.maxSteps; step++) {
        const actions = new Map<string, Action>();
        const observationsBefore = new Map<string, { type: AgentType; vec: number[] }>();

        for (const agent of env.getAgentStates()) {
          if (!agent.alive) continue;
          const obs = env.computeObservation(agent.id);
          const vec = flattenObservation(obs);
          observationsBefore.set(agent.id, { type: agent.type, vec });
          const actionIndex =
            agent.type === AgentType.Hider
              ? hiderNet.act(vec, epsilon)
              : seekerNet.act(vec, epsilon);
          actions.set(agent.id, ACTIONS[actionIndex]);
        }

        const result = env.step(actions);

        // Collect metrics and experiences
        for (const agent of env.getAgentStates()) {
          const reward = result.rewards.get(agent.id) ?? 0;
          if (agent.type === AgentType.Hider) {
            metrics.rewardHiders += reward;
          } else {
            metrics.rewardSeekers += reward;
          }
        }
        metrics.captures += result.capturesThisStep.length;

        for (const [agentId, before] of observationsBefore) {
          const obsNext = result.observations.get(agentId);
          if (!obsNext) continue;
          const nextVec = flattenObservation(obsNext);
          const reward = result.rewards.get(agentId) ?? 0;
          const done = result.done || !obsNext.self.alive;
          const exp = {
            observation: before.vec,
            action: ACTIONS.indexOf(actions.get(agentId) ?? "stay"),
            reward,
            nextObservation: nextVec,
            done,
          };
          if (before.type === AgentType.Hider) {
            hiderBuffer.add(exp);
          } else {
            seekerBuffer.add(exp);
          }
        }

        await hiderNet.trainBatch(hiderBuffer.sample(this.config.batchSize), this.config.gamma);
        await seekerNet.trainBatch(seekerBuffer.sample(this.config.batchSize), this.config.gamma);

        if (captureSample) {
          sampleFrames.push({
            step,
            agents: env.getAgentStates().map((a) => ({
              id: a.id,
              type: a.type,
              x: a.position.x,
              y: a.position.y,
              alive: a.alive,
            })),
            captures: [...result.capturesThisStep],
          });
        }

        if (result.done) break;
      }

      if (captureSample) {
        dataset.generations.push({
          generation: gen,
          map: env.getMapSnapshot(),
          metrics: {
            averageRewardHiders: metrics.rewardHiders / this.config.hiders,
            averageRewardSeekers: metrics.rewardSeekers / this.config.seekers,
            captures: metrics.captures,
          },
          episode: sampleFrames,
        });
      }

      const avgH = metrics.rewardHiders / this.config.hiders;
      const avgS = metrics.rewardSeekers / this.config.seekers;
      console.log(
        `[gen ${gen + 1}/${this.config.generations}] eps=${epsilon.toFixed(2)} hReward=${avgH.toFixed(
          3,
        )} sReward=${avgS.toFixed(3)} captures=${metrics.captures} bufferH=${hiderBuffer.size()} bufferS=${seekerBuffer.size()}`,
      );

      epsilon = Math.max(this.config.epsilonEnd, epsilon * this.config.epsilonDecay);
    }

    return dataset;
  }

  saveReplay(dataset: ReplayDataset) {
    const outputPath = this.config.output || `dist/replays/replay-${Date.now()}.json`;
    const resolved = path.isAbsolute(outputPath) ? outputPath : path.resolve(process.cwd(), outputPath);
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    fs.writeFileSync(resolved, JSON.stringify(dataset, null, 2), "utf-8");
    return resolved;
  }
}
