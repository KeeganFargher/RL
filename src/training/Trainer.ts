import * as fs from "fs";
import * as path from "path";
import { Environment } from "../simulation/Environment.js";
import { Action, AgentType, EnvironmentConfig } from "../simulation/types.js";
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
  Action.Idle,
  Action.MoveForward,
  Action.MoveBackward,
  Action.StrafeLeft,
  Action.StrafeRight,
  Action.TurnLeft,
  Action.TurnRight,
  Action.PlaceObstacle,
];

export class Trainer {
  private readonly config: TrainerConfig;

  constructor(config: TrainerConfig) {
    this.config = config;
  }

  async run(): Promise<ReplayDataset> {
    const envConfig: EnvironmentConfig = {
      arenaWidth: this.config.arenaWidth,
      arenaHeight: this.config.arenaHeight,
      obstacleDensity: this.config.obstacleDensity,
      hiderCount: this.config.hiders,
      seekerCount: this.config.seekers,
      hiderTraits: this.config.hiderTraits,
      seekerTraits: this.config.seekerTraits,
      maxSteps: this.config.maxSteps,
      tickDuration: this.config.tickDuration,
      captureHoldSeconds: this.config.captureHoldSeconds,
      placementCount: this.config.placementCount,
      placementCooldownSeconds: this.config.placementCooldownSeconds,
      visionRayCount: this.config.visionRayCount,
    };

    const env = new Environment(envConfig);

    const obsSize = this.config.visionRayCount + 24;
    const hiderNet = new PolicyNetwork(obsSize, ACTIONS.length, this.config.learningRate);
    const seekerNet = new PolicyNetwork(obsSize, ACTIONS.length, this.config.learningRate);
    const hiderBuffer = new ReplayBuffer(this.config.replayCapacity);
    const seekerBuffer = new ReplayBuffer(this.config.replayCapacity);
    const warmupSteps = this.config.trainWarmupSteps ?? Math.max(100, this.config.batchSize * 5);
    const targetUpdateInterval = this.config.targetUpdateInterval ?? 10;
    const targetUpdateTau = this.config.targetUpdateTau ?? 0.05;

    let epsilon = this.config.epsilonStart;
    let trainSteps = 0;

    const dataset: ReplayDataset = {
      seed: this.config.seed,
      config: {
        seed: this.config.seed,
        arenaWidth: this.config.arenaWidth,
        arenaHeight: this.config.arenaHeight,
        obstacleDensity: this.config.obstacleDensity,
        hiders: this.config.hiders,
        seekers: this.config.seekers,
        hiderTraits: this.config.hiderTraits,
        seekerTraits: this.config.seekerTraits,
        generations: this.config.generations,
        maxSteps: this.config.maxSteps,
        snapshotInterval: this.config.snapshotInterval,
        tickDuration: this.config.tickDuration,
        captureHoldSeconds: this.config.captureHoldSeconds,
        placementCount: this.config.placementCount,
        placementCooldownSeconds: this.config.placementCooldownSeconds,
        visionRayCount: this.config.visionRayCount,
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
            agent.type === AgentType.Hider ? hiderNet.act(vec, epsilon) : seekerNet.act(vec, epsilon);
          actions.set(agent.id, ACTIONS[actionIndex] ?? Action.Idle);
        }

        const result = env.step(actions);

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
          const done = result.done || !obsNext.self;
          const exp = {
            observation: before.vec,
            action: ACTIONS.indexOf(actions.get(agentId) ?? Action.Idle),
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

        const canTrain = hiderBuffer.size() >= warmupSteps && seekerBuffer.size() >= warmupSteps;
        if (canTrain) {
          await hiderNet.trainBatch(hiderBuffer.sample(this.config.batchSize), this.config.gamma);
          await seekerNet.trainBatch(seekerBuffer.sample(this.config.batchSize), this.config.gamma);
          trainSteps += 1;
          if (trainSteps % targetUpdateInterval === 0) {
            hiderNet.updateTarget(targetUpdateTau);
            seekerNet.updateTarget(targetUpdateTau);
          }
        }

        if (captureSample) {
          sampleFrames.push({
            step,
            agents: env.getAgentStates().map((a) => ({
              id: a.id,
              type: a.type,
              x: a.pose.position.x,
              y: a.pose.position.y,
              heading: a.pose.heading,
              alive: a.alive,
              placementsRemaining: a.placementsRemaining,
            })),
            captures: [...result.capturesThisStep],
            placedObstacles: result.placedObstacles,
          });
        }

        if (result.done) break;
      }

      if (captureSample) {
        dataset.generations.push({
          generation: gen,
          arena: env.getArenaSnapshot(),
          metrics: {
            averageRewardHiders: metrics.rewardHiders / Math.max(1, this.config.hiders),
            averageRewardSeekers: metrics.rewardSeekers / Math.max(1, this.config.seekers),
            captures: metrics.captures,
          },
          episode: sampleFrames,
        });
      }

      const avgH = metrics.rewardHiders / Math.max(1, this.config.hiders);
      const avgS = metrics.rewardSeekers / Math.max(1, this.config.seekers);
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
