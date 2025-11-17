import { AgentTraits, AgentType, Observation } from "../simulation/types.js";

export interface TrainerConfig {
  seed: string;
  mapWidth: number;
  mapHeight: number;
  obstacleDensity: number;
  hiders: number;
  seekers: number;
  hiderTraits: AgentTraits;
  seekerTraits: AgentTraits;
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
    alive: boolean;
  }[];
  captures: string[];
}

export interface GenerationSample {
  generation: number;
  map: {
    width: number;
    height: number;
    cells: number[][];
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
  // Use the local grid as the primary numerical input.
  return obs.localGrid;
}
