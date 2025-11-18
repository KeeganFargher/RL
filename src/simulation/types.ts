import { Obstacle, Pose, Vec2 } from "./geometry.js";

export enum AgentType {
  Hider = "HIDER",
  Seeker = "SEEKER",
}

export enum Action {
  Idle = 0,
  MoveForward = 1,
  MoveBackward = 2,
  StrafeLeft = 3,
  StrafeRight = 4,
  TurnLeft = 5,
  TurnRight = 6,
  PlaceObstacle = 7,
}

export interface AgentTraits {
  speed: number; // units per second
  visionRange: number; // max vision distance
  fovDegrees: number; // vision cone angle
  turnRate?: number; // radians per second
}

export interface AgentState {
  id: string;
  type: AgentType;
  pose: Pose;
  velocity: Vec2;
  speed: number;
  visionRange: number;
  fovDegrees: number;
  alive: boolean;
  placementsRemaining: number;
  placementCooldown: number;
  lastAction?: Action;
}

export interface Observation {
  rayDistances: number[]; // normalized distances (0-1) along evenly spaced rays inside the cone
  visibleAgents: {
    id: string;
    type: AgentType;
    relAngle: number; // radians relative to heading
    relDistance: number; // absolute distance
    visibilityFraction: number; // portion of required hold satisfied (0-1)
  }[];
  self: {
    id: string;
    type: AgentType;
    heading: number;
    speed: number;
    placementsRemaining: number;
    placementCooldown: number;
    position: Vec2;
    visionRange: number;
    fovDegrees: number;
  };
  mapSize: { width: number; height: number };
}

export interface StepResult {
  rewards: Map<string, number>;
  done: boolean;
  observations: Map<string, Observation>;
  capturesThisStep: string[];
  placedObstacles: Obstacle[];
}

export interface EnvironmentConfig {
  arenaWidth: number;
  arenaHeight: number;
  obstacleDensity: number;
  hiderCount: number;
  seekerCount: number;
  hiderTraits: AgentTraits;
  seekerTraits: AgentTraits;
  maxSteps: number;
  tickDuration: number;
  captureHoldSeconds: number;
  placementCount: number;
  placementCooldownSeconds: number;
  visionRayCount: number;
  staticObstacles?: Obstacle[];
}
