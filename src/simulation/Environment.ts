import { castRay, clampToArena, Obstacle, Pose, Vec2, add, collides, normalizeAngle, scale } from "./geometry.js";
import { Action, AgentState, AgentTraits, AgentType, EnvironmentConfig, Observation, StepResult } from "./types.js";
import { createRng, Rng } from "../utils/random.js";

interface CaptureKey {
  seeker: string;
  hider: string;
}

function captureKey(seeker: string, hider: string): string {
  return `${seeker}:${hider}`;
}

export class Environment {
  private rng: Rng = () => Math.random();
  private readonly config: EnvironmentConfig;
  private agents: AgentState[] = [];
  private staticObstacles: Obstacle[] = [];
  private placedObstacles: Obstacle[] = [];
  private stepCount = 0;
  private captureTimers = new Map<string, number>();
  private readonly captureHoldSteps: number;

  constructor(config: EnvironmentConfig) {
    this.config = config;
    this.captureHoldSteps = Math.max(1, Math.ceil(config.captureHoldSeconds / config.tickDuration));
    this.staticObstacles = config.staticObstacles ?? [];
  }

  reset(seed: string) {
    this.rng = createRng(seed);
    this.stepCount = 0;
    this.agents = [];
    this.captureTimers.clear();
    this.placedObstacles = [];
    this.staticObstacles = this.config.staticObstacles ?? this.generateStaticObstacles();

    for (let i = 0; i < this.config.hiderCount; i++) {
      this.agents.push(this.spawnAgent(`H${i}`, AgentType.Hider, this.config.hiderTraits));
    }
    for (let i = 0; i < this.config.seekerCount; i++) {
      this.agents.push(this.spawnAgent(`S${i}`, AgentType.Seeker, this.config.seekerTraits));
    }
  }

  private generateStaticObstacles(): Obstacle[] {
    const obs: Obstacle[] = [];
    const count = Math.max(0, Math.floor(this.config.obstacleDensity * 10));
    for (let i = 0; i < count; i++) {
      const w = 1 + this.rng() * 3;
      const h = 1 + this.rng() * 3;
      const x = this.rng() * (this.config.arenaWidth - w);
      const y = this.rng() * (this.config.arenaHeight - h);
      obs.push({
        id: `O${i}`,
        min: { x, y },
        max: { x: x + w, y: y + h },
      });
    }
    return obs;
  }

  private spawnAgent(id: string, type: AgentType, traits: AgentTraits): AgentState {
    let pose: Pose;
    let attempts = 0;
    const maxAttempts = 100;
    do {
      const x = this.rng() * this.config.arenaWidth;
      const y = this.rng() * this.config.arenaHeight;
      const heading = this.rng() * Math.PI * 2;
      pose = { position: { x, y }, heading };
      attempts++;
    } while (this.positionBlocked(pose.position) && attempts < maxAttempts);

    return {
      id,
      type,
      pose,
      velocity: { x: 0, y: 0 },
      speed: traits.speed,
      visionRange: traits.visionRange,
      fovDegrees: traits.fovDegrees,
      alive: true,
      placementsRemaining: type === AgentType.Hider ? this.config.placementCount : 0,
      placementCooldown: 0,
    };
  }

  private positionBlocked(pos: Vec2): boolean {
    const all = [...this.staticObstacles, ...this.placedObstacles];
    return collides(pos, all);
  }

  getAgentStates(): AgentState[] {
    return this.agents.map((a) => ({
      ...a,
      pose: { position: { ...a.pose.position }, heading: a.pose.heading },
      velocity: { ...a.velocity },
    }));
  }

  getArenaSnapshot() {
    return {
      width: this.config.arenaWidth,
      height: this.config.arenaHeight,
      staticObstacles: this.staticObstacles,
    };
  }

  computeObservation(agentId: string): Observation {
    const agent = this.requireAgent(agentId);
    const obstacles = [...this.staticObstacles, ...this.placedObstacles];
    const fovRad = (agent.fovDegrees * Math.PI) / 180;
    const rayCount = Math.max(1, this.config.visionRayCount);
    const rayDistances: number[] = [];
    const visibleAgents: Observation["visibleAgents"] = [];

    for (let i = 0; i < rayCount; i++) {
      const t = rayCount === 1 ? 0.5 : i / (rayCount - 1);
      const angle = agent.pose.heading - fovRad / 2 + fovRad * t;
      const hit = castRay(agent.pose.position, angle, agent.visionRange, obstacles);
      const distNorm = Math.min(1, hit.distance / agent.visionRange);
      rayDistances.push(distNorm);
    }

    for (const other of this.agents) {
      if (!other.alive || other.id === agent.id) continue;
      const dx = other.pose.position.x - agent.pose.position.x;
      const dy = other.pose.position.y - agent.pose.position.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > agent.visionRange) continue;
      const absoluteAngle = Math.atan2(dy, dx);
      const relAngle = normalizeAngle(absoluteAngle - agent.pose.heading);
      const relAngleSigned = relAngle > Math.PI ? relAngle - Math.PI * 2 : relAngle;
      if (Math.abs(relAngleSigned) > fovRad / 2) continue;

      const occlusion = castRay(agent.pose.position, absoluteAngle, dist, obstacles);
      const blocked = occlusion.hit && occlusion.distance + 1e-3 < dist;
      if (blocked) continue;

      const key = captureKey(
        agent.type === AgentType.Seeker ? agent.id : other.id,
        agent.type === AgentType.Seeker ? other.id : agent.id,
      );
      const visFrac = this.captureTimers.has(key)
        ? Math.min(1, (this.captureTimers.get(key) ?? 0) / this.captureHoldSteps)
        : 0;
      visibleAgents.push({
        id: other.id,
        type: other.type,
        relAngle: relAngleSigned,
        relDistance: dist,
        visibilityFraction: visFrac,
      });
    }

    return {
      rayDistances,
      visibleAgents,
      self: {
        id: agent.id,
        type: agent.type,
        heading: agent.pose.heading,
        speed: agent.speed,
        placementsRemaining: agent.placementsRemaining,
        placementCooldown: agent.placementCooldown,
        position: { ...agent.pose.position },
        visionRange: agent.visionRange,
        fovDegrees: agent.fovDegrees,
      },
      mapSize: { width: this.config.arenaWidth, height: this.config.arenaHeight },
    };
  }

  step(actions: Map<string, Action>): StepResult {
    const rewards = new Map<string, number>();
    const capturesThisStep: string[] = [];
    const placedThisStep: Obstacle[] = [];

    for (const agent of this.agents) {
      rewards.set(agent.id, 0);
      if (!agent.alive) continue;
      const action = actions.get(agent.id) ?? Action.Idle;
      this.applyAction(agent, action, placedThisStep);
    }

    // Capture resolution based on sustained visibility
    const seekers = this.agents.filter((a) => a.alive && a.type === AgentType.Seeker);
    const hiders = this.agents.filter((a) => a.alive && a.type === AgentType.Hider);
    for (const seeker of seekers) {
      for (const hider of hiders) {
        const visible = this.isVisible(seeker, hider);
        const key = captureKey(seeker.id, hider.id);
        const prev = this.captureTimers.get(key) ?? 0;
        const next = visible ? prev + 1 : 0;
        this.captureTimers.set(key, next);
        if (visible && next >= this.captureHoldSteps && hider.alive) {
          hider.alive = false;
          capturesThisStep.push(hider.id);
          rewards.set(seeker.id, (rewards.get(seeker.id) ?? 0) + 5);
          rewards.set(hider.id, (rewards.get(hider.id) ?? 0) - 5);
        }
      }
    }

    this.stepCount += 1;
    const done = this.stepCount >= this.config.maxSteps || this.remainingHiders() === 0;
    if (done) {
      for (const agent of this.agents) {
        if (!agent.alive) continue;
        const bonus = agent.type === AgentType.Hider ? 1 : 0;
        rewards.set(agent.id, (rewards.get(agent.id) ?? 0) + bonus);
      }
    }

    for (let i = 0; i < this.agents.length; i++) {
      const a = this.agents[i];
      for (let j = i + 1; j < this.agents.length; j++) {
        const b = this.agents[j];
        const dist = Math.sqrt(
          Math.pow(a.pose.position.x - b.pose.position.x, 2) + Math.pow(a.pose.position.y - b.pose.position.y, 2),
        );
        if (dist < 0.2) {
          const offset = { x: (a.pose.position.x - b.pose.position.x) * 0.05, y: (a.pose.position.y - b.pose.position.y) * 0.05 };
          a.pose.position = clampToArena(add(a.pose.position, offset), this.config.arenaWidth, this.config.arenaHeight);
          b.pose.position = clampToArena(add(b.pose.position, scale(offset, -1)), this.config.arenaWidth, this.config.arenaHeight);
        }
      }
    }

    const observations = new Map<string, Observation>();
    for (const agent of this.agents) {
      if (!agent.alive) continue;
      observations.set(agent.id, this.computeObservation(agent.id));
    }

    // Gentle shaping: seekers get signal for keeping hiders in view and closing distance; hiders gain for staying unseen.
    for (const [agentId, obs] of observations) {
      const baseReward = rewards.get(agentId) ?? 0;
      const visibleCount = obs.visibleAgents.length;
      const visibilityScore = obs.visibleAgents.reduce((acc, v) => {
        const closeness = Math.max(0, 1 - v.relDistance / Math.max(1e-3, obs.self.visionRange));
        return acc + closeness;
      }, 0);
      if (obs.self.type === AgentType.Seeker) {
        const bonus = visibleCount > 0 ? 0.05 * visibleCount + 0.02 * visibilityScore : -0.005;
        rewards.set(agentId, baseReward + bonus);
      } else {
        const hideBonus = visibleCount === 0 ? 0.05 : -0.02 * visibleCount;
        rewards.set(agentId, baseReward + hideBonus);
      }
    }

    return { rewards, done, observations, capturesThisStep, placedObstacles: placedThisStep };
  }

  private applyAction(agent: AgentState, action: Action, placedThisStep: Obstacle[]) {
    const dt = this.config.tickDuration;
    const turnRate = agent.type === AgentType.Seeker ? (agent.speed / Math.max(1e-3, agent.speed)) * Math.PI : Math.PI;
    const traitTurnRate =
      agent.type === AgentType.Hider ? this.config.hiderTraits.turnRate : this.config.seekerTraits.turnRate;
    const headingDelta =
      action === Action.TurnLeft ? -dt * (traitTurnRate ?? turnRate) : action === Action.TurnRight ? dt * (traitTurnRate ?? turnRate) : 0;
    agent.pose.heading = normalizeAngle(agent.pose.heading + headingDelta);
    agent.lastAction = action;

    if (agent.placementCooldown > 0) {
      agent.placementCooldown = Math.max(0, agent.placementCooldown - dt);
    }

    if (action === Action.PlaceObstacle && agent.type === AgentType.Hider) {
      this.placeObstacle(agent, placedThisStep);
      return;
    }

    const moveVec = this.movementVector(agent, action, dt);
    const nextPos = clampToArena(add(agent.pose.position, moveVec), this.config.arenaWidth, this.config.arenaHeight);
    if (!this.positionBlocked(nextPos)) {
      agent.pose.position = nextPos;
      agent.velocity = scale(moveVec, 1 / dt);
    } else {
      agent.velocity = { x: 0, y: 0 };
    }
  }

  private movementVector(agent: AgentState, action: Action, dt: number): Vec2 {
    const speed = agent.speed * dt;
    const heading = agent.pose.heading;
    switch (action) {
      case Action.MoveForward:
        return { x: Math.cos(heading) * speed, y: Math.sin(heading) * speed };
      case Action.MoveBackward:
        return { x: -Math.cos(heading) * speed, y: -Math.sin(heading) * speed };
      case Action.StrafeLeft:
        return { x: -Math.sin(heading) * speed, y: Math.cos(heading) * speed };
      case Action.StrafeRight:
        return { x: Math.sin(heading) * speed, y: -Math.cos(heading) * speed };
      default:
        return { x: 0, y: 0 };
    }
  }

  private placeObstacle(agent: AgentState, placedThisStep: Obstacle[]) {
    if (agent.placementsRemaining <= 0 || agent.placementCooldown > 0) return;
    const length = 1.5;
    const width = 0.5;
    const forward = { x: Math.cos(agent.pose.heading), y: Math.sin(agent.pose.heading) };
    const center = add(agent.pose.position, scale(forward, 1));
    const halfW = width / 2;
    const min = { x: center.x - halfW, y: center.y - halfW };
    const max = { x: center.x + length, y: center.y + halfW };
    const obstacle: Obstacle = {
      id: `P${this.placedObstacles.length + 1}`,
      min,
      max,
    };
    this.placedObstacles.push(obstacle);
    placedThisStep.push(obstacle);
    agent.placementsRemaining -= 1;
    agent.placementCooldown = this.config.placementCooldownSeconds;
  }

  private isVisible(seeker: AgentState, hider: AgentState): boolean {
    const dx = hider.pose.position.x - seeker.pose.position.x;
    const dy = hider.pose.position.y - seeker.pose.position.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > seeker.visionRange) return false;
    const fovRad = (seeker.fovDegrees * Math.PI) / 180;
    const relAngle = normalizeAngle(Math.atan2(dy, dx) - seeker.pose.heading);
    const relAngleSigned = relAngle > Math.PI ? relAngle - Math.PI * 2 : relAngle;
    if (Math.abs(relAngleSigned) > fovRad / 2) return false;
    const obstacles = [...this.staticObstacles, ...this.placedObstacles];
    const los = castRay(seeker.pose.position, Math.atan2(dy, dx), dist, obstacles);
    return !(los.hit && los.distance + 1e-3 < dist);
  }

  private remainingHiders() {
    return this.agents.filter((a) => a.alive && a.type === AgentType.Hider).length;
  }

  private requireAgent(id: string): AgentState {
    const agent = this.agents.find((a) => a.id === id);
    if (!agent) throw new Error(`Agent ${id} not found`);
    return agent;
  }
}
