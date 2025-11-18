#!/usr/bin/env node
import { Trainer } from "./Trainer.js";
import { TrainerConfig } from "./types.js";

function parseArgs(): Partial<TrainerConfig> {
  const args = process.argv.slice(2);
  const result: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--")) {
      const key = args[i].slice(2);
      const value = args[i + 1];
      if (value && !value.startsWith("--")) {
        result[key] = value;
        i++;
      } else {
        result[key] = "true";
      }
    }
  }
  return result as Partial<TrainerConfig>;
}

const cli = parseArgs();

const config: TrainerConfig = {
  seed: (cli.seed as string) || "1234",
  arenaWidth: Number(cli.arenaWidth ?? 25),
  arenaHeight: Number(cli.arenaHeight ?? 25),
  obstacleDensity: Number(cli.obstacleDensity ?? 0.1),
  hiders: Number(cli.hiders ?? 3),
  seekers: Number(cli.seekers ?? 2),
  hiderTraits: {
    speed: Number((cli as any).hiderSpeed ?? 2.5),
    visionRange: Number((cli as any).hiderVisionRange ?? 8),
    fovDegrees: Number((cli as any).hiderFov ?? 100),
    turnRate: Number((cli as any).hiderTurnRate ?? Math.PI * 1.5),
  },
  seekerTraits: {
    speed: Number((cli as any).seekerSpeed ?? 3),
    visionRange: Number((cli as any).seekerVisionRange ?? 10),
    fovDegrees: Number((cli as any).seekerFov ?? 90),
    turnRate: Number((cli as any).seekerTurnRate ?? Math.PI * 1.5),
  },
  generations: Number(cli.generations ?? 1000),
  maxSteps: Number(cli.maxSteps ?? 150),
  snapshotInterval: Number(cli.snapshotInterval ?? 20),
  output: (cli.output as string) || "dist/replays/sample-free-movement.json",
  epsilonStart: Number(cli.epsilonStart ?? 0.9),
  epsilonEnd: Number(cli.epsilonEnd ?? 0.1),
  epsilonDecay: Number(cli.epsilonDecay ?? 0.997),
  gamma: Number(cli.gamma ?? 0.95),
  batchSize: Number(cli.batchSize ?? 64),
  learningRate: Number(cli.learningRate ?? 0.005),
  replayCapacity: Number(cli.replayCapacity ?? 20000),
  tickDuration: Number(cli.tickDuration ?? 0.1),
  captureHoldSeconds: Number(cli.captureHoldSeconds ?? 2),
  placementCount: Number(cli.placementCount ?? 2),
  placementCooldownSeconds: Number(cli.placementCooldownSeconds ?? 3),
  visionRayCount: Number(cli.visionRayCount ?? 15),
  targetUpdateInterval: Number(cli.targetUpdateInterval ?? 10),
  targetUpdateTau: Number(cli.targetUpdateTau ?? 0.05),
  trainWarmupSteps: Number(cli.trainWarmupSteps ?? 400),
};

async function main() {
  console.log("Starting training with config:", config);
  const trainer = new Trainer(config);
  const replay = await trainer.run();
  const outputPath = trainer.saveReplay(replay);
  console.log(`Training complete. Replay saved to ${outputPath}`);
}

main().catch((err) => {
  console.error("Training failed", err);
  process.exit(1);
});
