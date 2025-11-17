export enum AgentType {
  Hider = "HIDER",
  Seeker = "SEEKER",
}

export type Action =
  | "stay"
  | "up"
  | "down"
  | "left"
  | "right"
  | "up-left"
  | "up-right"
  | "down-left"
  | "down-right";

export interface AgentTraits {
  speed: number; // cells per tick
  vision: number; // radius in cells
  stamina?: number; // optional future use
}

export interface AgentState {
  id: string;
  type: AgentType;
  traits: AgentTraits;
  position: { x: number; y: number };
  alive: boolean;
  energy?: number;
}

export enum CellType {
  Empty = 0,
  Wall = 1,
}

export interface Observation {
  localGrid: number[]; // flattened (vision*2+1)^2 values encoding walls/agents
  visibleAgents: {
    id: string;
    type: AgentType;
    dx: number;
    dy: number;
  }[];
  self: AgentState;
  mapSize: { width: number; height: number };
}

export interface StepResult {
  rewards: Map<string, number>;
  done: boolean;
  observations: Map<string, Observation>;
  capturesThisStep: string[];
}

export interface EnvironmentConfig {
  width: number;
  height: number;
  obstacleDensity: number;
  hiderCount: number;
  seekerCount: number;
  hiderTraits: AgentTraits;
  seekerTraits: AgentTraits;
  maxSteps: number;
}
