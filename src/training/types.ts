import { AgentType, Observation } from "../simulation/types.js";
import { Obstacle } from "../simulation/geometry.js";

export interface TrainerConfig {
  seed: string;
  arenaWidth: number;
  arenaHeight: number;
  obstacleDensity: number;
  hiders: number;
  seekers: number;
  hiderTraits: {
    speed: number;
    visionRange: number;
    fovDegrees: number;
    turnRate?: number;
  };
  seekerTraits: {
    speed: number;
    visionRange: number;
    fovDegrees: number;
    turnRate?: number;
  };
  generations: number;
  maxSteps: number;
  snapshotInterval: number;
  output: string;
  epsilonStart: number;
  epsilonEnd: number;
  epsilonDecay: number;
  gamma: number;
  batchSize: number;
  learningRate: number;
  replayCapacity: number;
  tickDuration: number;
  captureHoldSeconds: number;
  placementCount: number;
  placementCooldownSeconds: number;
  visionRayCount: number;
  targetUpdateInterval?: number;
  targetUpdateTau?: number;
  trainWarmupSteps?: number;
}

export interface Experience {
  observation: number[];
  action: number;
  reward: number;
  nextObservation: number[];
  done: boolean;
}

export interface ReplayFrame {
  step: number;
  agents: {
    id: string;
    type: AgentType;
    x: number;
    y: number;
    heading: number;
    alive: boolean;
    placementsRemaining: number;
  }[];
  captures: string[];
  placedObstacles: Obstacle[];
}

export interface GenerationSample {
  generation: number;
  arena: {
    width: number;
    height: number;
    staticObstacles: Obstacle[];
  };
  metrics: {
    averageRewardHiders: number;
    averageRewardSeekers: number;
    captures: number;
  };
  episode: ReplayFrame[];
}

export interface ReplayDataset {
  seed: string;
  config: Omit<
    TrainerConfig,
    | "output"
    | "epsilonStart"
    | "epsilonEnd"
    | "epsilonDecay"
    | "gamma"
    | "batchSize"
    | "learningRate"
    | "replayCapacity"
  >;
  snapshotInterval: number;
  generations: GenerationSample[];
}

export interface TrainingMetrics {
  rewardHiders: number;
  rewardSeekers: number;
  captures: number;
}

export function flattenObservation(obs: Observation): number[] {
  const rays = obs.rayDistances;
  const visible = obs.visibleAgents.slice(0, 4);
  const visibleFeatures: number[] = [];
  for (let i = 0; i < 4; i++) {
    const v = visible[i];
    if (v) {
      visibleFeatures.push(
        v.relAngle / Math.PI,
        Math.min(1, v.relDistance / Math.max(1e-3, obs.self.visionRange)),
        v.visibilityFraction,
        v.type === AgentType.Hider ? 0 : 1,
      );
    } else {
      visibleFeatures.push(0, 0, 0, 0);
    }
  }
  const maxDim = Math.max(obs.mapSize.width, obs.mapSize.height, 1);
  const headingWrapped =
    ((obs.self.heading + Math.PI) % (Math.PI * 2) + (Math.PI * 2)) % (Math.PI * 2) - Math.PI;
  const headingNorm = headingWrapped / Math.PI;
  const speedNorm = obs.self.speed / 5;
  const placementNorm = (obs.self.placementsRemaining ?? 0) / 5;
  const placementCooldownNorm = (obs.self.placementCooldown ?? 0) / 5;
  const visionRangeNorm = obs.self.visionRange / maxDim;
  const extras = [
    headingNorm,
    speedNorm,
    placementNorm,
    placementCooldownNorm,
    visionRangeNorm,
    obs.self.fovDegrees / 180,
    obs.mapSize.width / maxDim,
    obs.mapSize.height / maxDim,
  ];
  return [...rays, ...visibleFeatures, ...extras];
}
