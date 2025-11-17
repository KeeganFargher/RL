import { GenerationSample, ReplayFrame, ReplayDataset } from "../training/types.js";
import { AgentType } from "../simulation/types.js";

export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly canvas: HTMLCanvasElement;
  private hiderVision = 0;
  private seekerVision = 0;

  constructor(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context not available");
    this.ctx = ctx;
    this.canvas = canvas;
  }

  setConfig(dataset: ReplayDataset) {
    this.hiderVision = dataset.config.hiderTraits?.vision ?? 0;
    this.seekerVision = dataset.config.seekerTraits?.vision ?? 0;
  }

  drawFrame(frame: ReplayFrame, generation: GenerationSample, nextFrame?: ReplayFrame, t = 0) {
    const { map } = generation;
    const cellSize = Math.min(this.canvas.width / map.width, this.canvas.height / map.height);
    this.ctx.fillStyle = "#0c0c0c";
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Draw grid
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const val = map.cells[y][x];
        if (val === 1) {
          this.ctx.fillStyle = "#333";
          this.ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
        } else {
          this.ctx.fillStyle = "#1a1a1a";
          this.ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
        }
      }
    }

    // Draw agents
    for (const agent of frame.agents) {
      const interp = this.interpolateAgent(agent, nextFrame, t);
      const cx = interp.x * cellSize + cellSize / 2;
      const cy = interp.y * cellSize + cellSize / 2;

      // Vision ring
      const vision = agent.type === AgentType.Hider ? this.hiderVision : this.seekerVision;
      if (vision > 0) {
        this.ctx.beginPath();
        this.ctx.strokeStyle =
          agent.type === AgentType.Hider ? "rgba(77,163,255,0.15)" : "rgba(255,107,107,0.15)";
        this.ctx.lineWidth = 2;
        this.ctx.arc(cx, cy, vision * cellSize, 0, Math.PI * 2);
        this.ctx.stroke();
      }

      this.ctx.beginPath();
      const fillColor =
        agent.type === AgentType.Hider
          ? agent.alive
            ? "#4da3ff"
            : "#24476b"
          : agent.alive
          ? "#ff6b6b"
          : "#5e2f2f";
      this.ctx.fillStyle = fillColor;
      this.ctx.strokeStyle = "#e0e0e0";
      this.ctx.lineWidth = 1;
      this.ctx.arc(cx, cy, cellSize * 0.35, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.stroke();
      this.ctx.closePath();

      // Label
      this.ctx.fillStyle = "#0a0a0a";
      this.ctx.font = `${Math.max(10, Math.floor(cellSize * 0.4))}px sans-serif`;
      this.ctx.textAlign = "center";
      this.ctx.textBaseline = "middle";
      this.ctx.fillText(agent.type === AgentType.Hider ? "H" : "S", cx, cy);
    }

    // Legend
    this.ctx.fillStyle = "rgba(0,0,0,0.6)";
    this.ctx.fillRect(8, 8, 140, 50);
    this.ctx.fillStyle = "#4da3ff";
    this.ctx.fillRect(12, 14, 12, 12);
    this.ctx.fillStyle = "#eee";
    this.ctx.fillText("Hider", 30, 20);
    this.ctx.fillStyle = "#ff6b6b";
    this.ctx.fillRect(12, 34, 12, 12);
    this.ctx.fillStyle = "#eee";
    this.ctx.fillText("Seeker", 30, 40);
  }

  private interpolateAgent(agent: ReplayFrame["agents"][number], nextFrame: ReplayFrame | undefined, t: number) {
    if (!nextFrame) return { x: agent.x, y: agent.y };
    const target = nextFrame.agents.find((a) => a.id === agent.id) ?? agent;
    const clamped = Math.max(0, Math.min(1, t));
    return {
      x: agent.x + (target.x - agent.x) * clamped,
      y: agent.y + (target.y - agent.y) * clamped,
    };
  }
}
