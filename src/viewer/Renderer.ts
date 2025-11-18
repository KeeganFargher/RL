import { GenerationSample, ReplayFrame, ReplayDataset } from "../training/types.js";
import { AgentType } from "../simulation/types.js";
import { Obstacle } from "../simulation/geometry.js";

export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly canvas: HTMLCanvasElement;
  private hiderVision = 0;
  private seekerVision = 0;
  private hiderFov = 0;
  private seekerFov = 0;

  constructor(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context not available");
    this.ctx = ctx;
    this.canvas = canvas;
  }

  setConfig(dataset: ReplayDataset) {
    this.hiderVision = dataset.config.hiderTraits?.visionRange ?? 0;
    this.seekerVision = dataset.config.seekerTraits?.visionRange ?? 0;
    this.hiderFov = dataset.config.hiderTraits?.fovDegrees ?? 0;
    this.seekerFov = dataset.config.seekerTraits?.fovDegrees ?? 0;
  }

  drawFrame(frame: ReplayFrame, generation: GenerationSample, nextFrame?: ReplayFrame, t = 0) {
    const { arena } = generation;
    const scale = Math.min(this.canvas.width / arena.width, this.canvas.height / arena.height);
    this.ctx.fillStyle = "#0c0c0c";
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Obstacles
    this.drawObstacles(arena.staticObstacles, scale, "#333");
    const placed = this.collectPlacedObstacles(generation, frame.step);
    this.drawObstacles(placed, scale, "#555a00");

    // Agents
    for (const agent of frame.agents) {
      const interp = this.interpolateAgent(agent, nextFrame, t);
      const cx = interp.x * scale;
      const cy = interp.y * scale;
      const vision = agent.type === AgentType.Hider ? this.hiderVision : this.seekerVision;
      const fov = agent.type === AgentType.Hider ? this.hiderFov : this.seekerFov;
      this.drawCone(cx, cy, interp.heading, fov, vision * scale, agent.type);
      this.drawAgent(cx, cy, interp.heading, agent);
    }

    this.drawLegend();
  }

  private drawAgent(x: number, y: number, heading: number, agent: ReplayFrame["agents"][number]) {
    const size = 6;
    const tri = [
      { x: x + Math.cos(heading) * size, y: y + Math.sin(heading) * size },
      { x: x + Math.cos(heading + Math.PI * 0.75) * size, y: y + Math.sin(heading + Math.PI * 0.75) * size },
      { x: x + Math.cos(heading - Math.PI * 0.75) * size, y: y + Math.sin(heading - Math.PI * 0.75) * size },
    ];
    this.ctx.beginPath();
    this.ctx.moveTo(tri[0].x, tri[0].y);
    this.ctx.lineTo(tri[1].x, tri[1].y);
    this.ctx.lineTo(tri[2].x, tri[2].y);
    this.ctx.closePath();
    this.ctx.fillStyle =
      agent.type === AgentType.Hider ? (agent.alive ? "#4da3ff" : "#24476b") : agent.alive ? "#ff6b6b" : "#5e2f2f";
    this.ctx.strokeStyle = "#111";
    this.ctx.lineWidth = 1;
    this.ctx.fill();
    this.ctx.stroke();
  }

  private drawCone(x: number, y: number, heading: number, fovDeg: number, radius: number, type: AgentType) {
    if (radius <= 0 || fovDeg <= 0) return;
    const fov = (fovDeg * Math.PI) / 180;
    const start = heading - fov / 2;
    const end = heading + fov / 2;
    this.ctx.beginPath();
    this.ctx.moveTo(x, y);
    this.ctx.arc(x, y, radius, start, end);
    this.ctx.closePath();
    this.ctx.fillStyle = type === AgentType.Hider ? "rgba(77,163,255,0.12)" : "rgba(255,107,107,0.12)";
    this.ctx.fill();
  }

  private drawObstacles(obstacles: Obstacle[], scale: number, color: string) {
    this.ctx.fillStyle = color;
    for (const obs of obstacles) {
      const w = (obs.max.x - obs.min.x) * scale;
      const h = (obs.max.y - obs.min.y) * scale;
      this.ctx.fillRect(obs.min.x * scale, obs.min.y * scale, w, h);
    }
  }

  private drawLegend() {
    this.ctx.fillStyle = "rgba(0,0,0,0.6)";
    this.ctx.fillRect(8, 8, 170, 60);
    this.ctx.fillStyle = "#4da3ff";
    this.ctx.fillRect(12, 14, 12, 12);
    this.ctx.fillStyle = "#eee";
    this.ctx.fillText("Hider", 30, 24);
    this.ctx.fillStyle = "#ff6b6b";
    this.ctx.fillRect(12, 34, 12, 12);
    this.ctx.fillStyle = "#eee";
    this.ctx.fillText("Seeker", 30, 44);
    this.ctx.fillStyle = "#555a00";
    this.ctx.fillRect(12, 52, 12, 12);
    this.ctx.fillStyle = "#eee";
    this.ctx.fillText("Placed obstacle", 30, 60);
  }

  private interpolateAgent(agent: ReplayFrame["agents"][number], nextFrame: ReplayFrame | undefined, t: number) {
    if (!nextFrame) return { x: agent.x, y: agent.y, heading: agent.heading };
    const target = nextFrame.agents.find((a) => a.id === agent.id) ?? agent;
    const clamped = Math.max(0, Math.min(1, t));
    const heading = agent.heading + (target.heading - agent.heading) * clamped;
    return {
      x: agent.x + (target.x - agent.x) * clamped,
      y: agent.y + (target.y - agent.y) * clamped,
      heading,
    };
  }

  private collectPlacedObstacles(generation: GenerationSample, step: number): Obstacle[] {
    const obstacles: Obstacle[] = [];
    for (const frame of generation.episode) {
      if (frame.step <= step) {
        obstacles.push(...(frame.placedObstacles ?? []));
      }
    }
    return obstacles;
  }
}
