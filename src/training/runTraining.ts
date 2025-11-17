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
  mapWidth: Number(cli.mapWidth ?? 15),
  mapHeight: Number(cli.mapHeight ?? 15),
  obstacleDensity: Number(cli.obstacleDensity ?? 0.1),
  hiders: Number(cli.hiders ?? 3),
  seekers: Number(cli.seekers ?? 2),
  hiderTraits: {
    speed: Number((cli as any).hiderSpeed ?? 1),
    vision: Number((cli as any).hiderVision ?? 3),
  },
  seekerTraits: {
    speed: Number((cli as any).seekerSpeed ?? 1),
    vision: Number((cli as any).seekerVision ?? 4),
  },
  generations: Number(cli.generations ?? 200),
  maxSteps: Number(cli.maxSteps ?? 60),
  snapshotInterval: Number(cli.snapshotInterval ?? 20),
  output: (cli.output as string) || "dist/replays/sample-replay.json",
  epsilonStart: Number(cli.epsilonStart ?? 0.9),
  epsilonEnd: Number(cli.epsilonEnd ?? 0.1),
  epsilonDecay: Number(cli.epsilonDecay ?? 0.995),
  gamma: Number(cli.gamma ?? 0.95),
  batchSize: Number(cli.batchSize ?? 32),
  learningRate: Number(cli.learningRate ?? 0.001),
  replayCapacity: Number(cli.replayCapacity ?? 2000),
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
