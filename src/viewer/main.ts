import { Controls } from "./Controls.js";
import { Renderer } from "./Renderer.js";
import { ReplayLoader } from "./ReplayLoader.js";
import { GenerationSample, ReplayDataset } from "../training/types.js";

const statusEl = document.getElementById("statusText")!;
const sliderEl = document.getElementById("generationSlider") as HTMLInputElement;
const sliderLabel = document.getElementById("generationValue")!;
const fileInput = document.getElementById("replayFile") as HTMLInputElement;
const canvas = document.getElementById("gameCanvas") as HTMLCanvasElement;

const loader = new ReplayLoader();
const renderer = new Renderer(canvas);
const controls = new Controls(sliderEl, sliderLabel, (idx) => {
  if (currentReplay) {
    setGeneration(idx);
  }
});

let currentReplay: ReplayDataset | null = null;
let playbackHandle: number | null = null;

controls.attach();

fileInput?.addEventListener("change", async () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  try {
    statusEl.textContent = " | Loading custom replay...";
    const dataset = await loader.loadFromFile(file);
    setReplay(dataset);
  } catch (err) {
    console.error(err);
    statusEl.textContent = " | Failed to load replay file";
  }
});

async function bootstrap() {
  try {
    statusEl.textContent = " | Loading replay dist/replays/sample-replay.json";
    const dataset = await loader.load("./dist/replays/sample-replay.json");
    setReplay(dataset);
  } catch (err) {
    console.warn("Failed to load default replay. Load your own file.", err);
    statusEl.textContent = " | No default replay found. Load a file.";
  }
}

function setReplay(dataset: ReplayDataset) {
  currentReplay = dataset;
  renderer.setConfig(dataset);
  controls.setMax(Math.max(0, dataset.generations.length - 1));
  controls.setValue(0);
  setGeneration(0);
}

function setGeneration(idx: number) {
  if (!currentReplay) return;
  const generation = currentReplay.generations[idx];
  if (!generation) return;

  statusEl.textContent = ` | Generation ${generation.generation} | H reward ${generation.metrics.averageRewardHiders.toFixed(
    2,
  )} | S reward ${generation.metrics.averageRewardSeekers.toFixed(2)} | Captures ${generation.metrics.captures}`;
  playEpisode(generation);
}

function playEpisode(generation: GenerationSample) {
  if (playbackHandle !== null) {
    window.cancelAnimationFrame(playbackHandle);
    playbackHandle = null;
  }
  if (generation.episode.length === 0) {
    renderer.drawFrame(
      {
        step: 0,
        agents: [],
        captures: [],
      },
      generation,
    );
    return;
  }

  let idx = 0;
  let lastTime = performance.now();
  const frameDuration = 250; // ms per frame

  const loop = (now: number) => {
    const elapsed = now - lastTime;
    const t = Math.min(1, elapsed / frameDuration);
    const current = generation.episode[idx];
    const next = generation.episode[(idx + 1) % generation.episode.length];
    renderer.drawFrame(current, generation, next, t);
    if (elapsed >= frameDuration) {
      lastTime = now;
      idx = (idx + 1) % generation.episode.length;
    }
    playbackHandle = window.requestAnimationFrame(loop);
  };

  const current = generation.episode[idx];
  const next = generation.episode[(idx + 1) % generation.episode.length];
  renderer.drawFrame(current, generation, next, 0);
  playbackHandle = window.requestAnimationFrame(loop);
}

bootstrap();
