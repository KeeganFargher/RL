import { GridMap } from "./GridMap.js";
import {
  Action,
  AgentState,
  AgentTraits,
  AgentType,
  CellType,
  EnvironmentConfig,
  Observation,
  StepResult,
} from "./types.js";
import { createRng, Rng } from "../utils/random.js";

const ACTION_DELTAS: Record<Action, { dx: number; dy: number }> = {
  stay: { dx: 0, dy: 0 },
  up: { dx: 0, dy: -1 },
  down: { dx: 0, dy: 1 },
  left: { dx: -1, dy: 0 },
  right: { dx: 1, dy: 0 },
  "up-left": { dx: -1, dy: -1 },
  "up-right": { dx: 1, dy: -1 },
  "down-left": { dx: -1, dy: 1 },
  "down-right": { dx: 1, dy: 1 },
};

export class Environment {
  private rng: Rng = () => Math.random();
  private map: GridMap;
  private agents: AgentState[] = [];
  private stepCount = 0;
  private captureCount = 0;
  private readonly config: EnvironmentConfig;

  constructor(config: EnvironmentConfig) {
    this.config = config;
    this.map = GridMap.fromSeed("bootstrap", config.width, config.height, config.obstacleDensity);
  }

  reset(seed: string) {
    this.rng = createRng(seed);
    this.map = GridMap.fromSeed(seed, this.config.width, this.config.height, this.config.obstacleDensity);
    this.agents = [];
    this.stepCount = 0;
    this.captureCount = 0;

    for (let i = 0; i < this.config.hiderCount; i++) {
      this.agents.push(
        this.spawnAgent(`H${i}`, AgentType.Hider, this.config.hiderTraits),
      );
    }
    for (let i = 0; i < this.config.seekerCount; i++) {
      this.agents.push(
        this.spawnAgent(`S${i}`, AgentType.Seeker, this.config.seekerTraits),
      );
    }
  }

  getAgentStates(): AgentState[] {
    return this.agents.map((a) => ({ ...a, position: { ...a.position } }));
  }

  getMapSnapshot() {
    return {
      width: this.map.width,
      height: this.map.height,
      cells: this.map.cells.map((row) => [...row]),
    };
  }

  computeObservation(agentId: string): Observation {
    const agent = this.requireAgent(agentId);
    const vision = agent.traits.vision;
    const localGrid: number[] = [];
    const visibleAgents: Observation["visibleAgents"] = [];

    for (let dy = -vision; dy <= vision; dy++) {
      for (let dx = -vision; dx <= vision; dx++) {
        const x = agent.position.x + dx;
        const y = agent.position.y + dy;
        if (x < 0 || y < 0 || x >= this.map.width || y >= this.map.height) {
          localGrid.push(-1);
          continue;
        }

        const cell = this.map.cells[y][x];
        if (cell === CellType.Wall) {
          localGrid.push(-1);
          continue;
        }

        const occupant = this.findAgentAt(x, y);
        if (occupant) {
          const isOpponent = occupant.type !== agent.type;
          localGrid.push(isOpponent ? 1 : 0.5);
          if (Math.abs(dx) <= vision && Math.abs(dy) <= vision) {
            visibleAgents.push({
              id: occupant.id,
              type: occupant.type,
              dx,
              dy,
            });
          }
        } else {
          localGrid.push(0);
        }
      }
    }

    return {
      localGrid,
      visibleAgents,
      self: { ...agent, position: { ...agent.position } },
      mapSize: { width: this.map.width, height: this.map.height },
    };
  }

  step(actions: Map<string, Action>): StepResult {
    const rewards = new Map<string, number>();
    const capturesThisStep: string[] = [];

    const prevPositions = new Map<string, { x: number; y: number }>();
    const prevDistances = new Map<string, number>();
    for (const agent of this.agents) {
      if (!agent.alive) continue;
      prevPositions.set(agent.id, { ...agent.position });
      prevDistances.set(agent.id, this.nearestOpponentDistance(agent));
    }

    for (const agent of this.agents) {
      rewards.set(agent.id, 0);
      if (!agent.alive) continue;

      const action = actions.get(agent.id) ?? "stay";
      this.moveAgent(agent, action);
    }

    // Capture resolution: seekers on same tile as hiders
    for (const seeker of this.agents.filter((a) => a.alive && a.type === AgentType.Seeker)) {
      for (const hider of this.agents.filter((a) => a.alive && a.type === AgentType.Hider)) {
        const sameTile = seeker.position.x === hider.position.x && seeker.position.y === hider.position.y;
        const manhattan = Math.abs(seeker.position.x - hider.position.x) + Math.abs(seeker.position.y - hider.position.y);
        const seekerPrev = prevPositions.get(seeker.id)!;
        const hiderPrev = prevPositions.get(hider.id)!;
        const swapped =
          seeker.position.x === hiderPrev.x &&
          seeker.position.y === hiderPrev.y &&
          hider.position.x === seekerPrev.x &&
          hider.position.y === seekerPrev.y;

        if (sameTile || swapped || manhattan <= 1) {
          hider.alive = false;
          capturesThisStep.push(hider.id);
          rewards.set(seeker.id, rewards.get(seeker.id)! + 5);
          rewards.set(hider.id, (rewards.get(hider.id) ?? 0) - 5);
        }
      }
    }
    this.captureCount += capturesThisStep.length;

    // Distance shaping: seekers rewarded for closing distance; hiders rewarded for increasing it.
    for (const agent of this.agents) {
      if (!agent.alive) continue;
      const prev = prevDistances.get(agent.id);
      const curr = this.nearestOpponentDistance(agent);
      if (prev !== undefined && isFinite(prev) && isFinite(curr)) {
        const delta = curr - prev;
        const factor = 0.1;
        if (agent.type === AgentType.Hider) {
          rewards.set(agent.id, (rewards.get(agent.id) ?? 0) + delta * factor);
        } else {
          rewards.set(agent.id, (rewards.get(agent.id) ?? 0) - delta * factor);
        }
      }
    }

    this.stepCount += 1;
    const done = this.stepCount >= this.config.maxSteps || this.remainingHiders() === 0;

    if (done) {
      const hidersAlive = this.agents.filter((a) => a.type === AgentType.Hider && a.alive);
      const seekers = this.agents.filter((a) => a.type === AgentType.Seeker);

      if (this.captureCount === 0) {
        // No captures: penalize seekers, small survival bonus for hiders.
        seekers.forEach((s) => rewards.set(s.id, (rewards.get(s.id) ?? 0) - 2));
        hidersAlive.forEach((h) => rewards.set(h.id, (rewards.get(h.id) ?? 0) + 1));
      } else {
        // Captures occurred: no extra survival bonus, seekers avoid penalty.
        // Optional small bonus for remaining hiders if still alive after captures.
        hidersAlive.forEach((h) => rewards.set(h.id, (rewards.get(h.id) ?? 0) + 0.5));
      }
    }

    const observations = new Map<string, Observation>();
    for (const agent of this.agents) {
      observations.set(agent.id, this.computeObservation(agent.id));
    }

    return { rewards, done, observations, capturesThisStep };
  }

  private moveAgent(agent: AgentState, action: Action) {
    const delta = ACTION_DELTAS[action];
    let remaining = Math.max(1, Math.floor(agent.traits.speed));
    while (remaining > 0) {
      const targetX = agent.position.x + delta.dx;
      const targetY = agent.position.y + delta.dy;
      if (this.map.isWalkable(targetX, targetY) && !this.findBlockingAgent(targetX, targetY, agent)) {
        agent.position.x = targetX;
        agent.position.y = targetY;
      }
      remaining -= 1;
      if (action === "stay") break;
    }
  }

  private spawnAgent(id: string, type: AgentType, traits: AgentTraits): AgentState {
    let attempts = 0;
    while (attempts < 5000) {
      const x = Math.floor(this.rng() * this.config.width);
      const y = Math.floor(this.rng() * this.config.height);
      if (!this.map.isWalkable(x, y)) {
        attempts++;
        continue;
      }
      if (this.findAgentAt(x, y)) {
        attempts++;
        continue;
      }
      return { id, type, traits, position: { x, y }, alive: true };
    }
    throw new Error("Failed to place agent after many attempts");
  }

  private findAgentAt(x: number, y: number): AgentState | undefined {
    return this.agents.find((a) => a.alive && a.position.x === x && a.position.y === y);
  }

  private findBlockingAgent(x: number, y: number, mover: AgentState): AgentState | undefined {
    return this.agents.find(
      (a) => a.id !== mover.id && a.alive && a.position.x === x && a.position.y === y,
    );
  }

  private requireAgent(agentId: string): AgentState {
    const agent = this.agents.find((a) => a.id === agentId);
    if (!agent) throw new Error(`Agent ${agentId} not found`);
    return agent;
  }

  private remainingHiders(): number {
    return this.agents.filter((a) => a.type === AgentType.Hider && a.alive).length;
  }

  private nearestOpponentDistance(agent: AgentState): number {
    let best = Number.POSITIVE_INFINITY;
    for (const other of this.agents) {
      if (!other.alive || other.type === agent.type) continue;
      const d = Math.abs(other.position.x - agent.position.x) + Math.abs(other.position.y - agent.position.y);
      if (d < best) best = d;
    }
    return best;
  }
}
