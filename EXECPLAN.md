# RL hide-and-seek RL baseline with TensorFlow.js training and slider replay

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds. Maintain this document in accordance with `.agent/PLANS.md`.

## Purpose / Big Picture

Deliver a grid-based hide-and-seek reinforcement learning sandbox where training runs headlessly in Node.js using TensorFlow.js for speed, saves JSON snapshots of generations, and a browser canvas plus generation slider can replay how strategies evolve. After implementation, a user can run a fast-training script, obtain a JSON replay file keyed by a map seed, and scrub through generations in the browser to watch hiders and seekers move among seeded obstacles.

## Progress

- [x] (2025-11-17 12:00Z) Captured requirements and drafted the ExecPlan for the hide-and-seek RL baseline.
- [x] (2025-11-17 12:45Z) Added seeded grid simulation core with agent traits, observations, and step logic.
- [x] (2025-11-17 13:20Z) Implemented Node TFJS trainer scaffolding (CPU backend), replay serialization, and CLI harness.
- [x] (2025-11-17 13:40Z) Implemented browser viewer (canvas renderer, slider controls, replay loader) and hooked HTML.
- [ ] Verify end-to-end: train sample data, load it in the browser, and confirm slider scrubs generations correctly (completed: sample replay generated at dist/replays/sample-replay.json; remaining: browser playback verification).

## Surprises & Discoveries

- Observation: `@tensorflow/tfjs-node` install failed on Node 24 due to missing prebuilt binaries and toolchain requirement for source build.  
  Evidence: npm error `response status 404 Not Found` for CPU-windows-4.22.0.zip and node-gyp Visual Studio lookup failure during `npm install`.
- Observation: Running training with pure `@tensorflow/tfjs` shows a notice recommending tfjs-node for speed, which we intentionally skipped due to install failure.  
  Evidence: Node training logs print the tfjs-node suggestion banner during `npm run train`.

## Decision Log

- Decision: Training runs in Node.js with TensorFlow.js using a grid world; visualization happens post-training only.  
  Rationale: Node-based tfjs-node offers faster tensor ops, while the browser only needs recorded trajectories; user requested fast training.  
  Date/Author: 2025-11-17 / assistant
- Decision: Maps are grid-based with seeded obstacle generation and configurable counts of hiders/seekers and traits (speed, vision, stamina).  
  Rationale: Seeds allow reproducible evolution; traits make the system extensible and SOLID-friendly.  
  Date/Author: 2025-11-17 / assistant
- Decision: Replay storage is JSON with per-generation samples; UI uses a single scrub slider to move across generations.  
  Rationale: JSON keeps storage simple and portable; slider meets the stated visualization need.  
  Date/Author: 2025-11-17 / assistant
- Decision: Use pure `@tensorflow/tfjs` CPU backend in Node (no tfjs-node) until binaries for current Node are available.  
  Rationale: tfjs-node prebuilt binaries were unavailable for Node 24, blocking install; pure tfjs remains portable and sufficient for small grids.  
  Date/Author: 2025-11-17 / assistant

## Outcomes & Retrospective

Pending. Summarize training speed, replay fidelity, and UX once the first end-to-end run is complete.

## Context and Orientation

Current repo is a minimal TypeScript project targeting the browser with `index.html`, empty `main.ts`, and `tsconfig.json` outputting to `dist/`. There is no bundler. The new work will add a `src/` tree reused by both the Node trainer and the browser viewer. Node-side code will rely on `@tensorflow/tfjs` (CPU backend for now) for training; the browser viewer will only consume generated JSON and render on a canvas with a generation slider. SOLID-friendly abstractions will separate simulation (map/agents/state), policies (action selection), training (experience replay and optimization), and presentation (rendering and controls).

## Plan of Work

First, establish project structure and dependencies: introduce a `src/` hierarchy with clear modules for simulation, training, and viewing; adjust `tsconfig.json` to compile shared code and produce a browser-friendly `dist/main.js` (loaded as a module). Add dependencies `@tensorflow/tfjs` plus `ts-node` for running the trainer without bundling (tfjs-node skipped until installable). Keep package scripts minimal but runnable.

Next, implement the simulation core. Create grid representations (`src/simulation/GridMap.ts`) that build width/height maps from a seed-driven obstacle generator. Define `AgentType` (Hider/Seeker), an `AgentTraits` structure (speed cells per tick, vision radius cells, optional stamina/energy), and `AgentState` with position and role. Build an `Observation` object that limits visible cells to the agent’s vision radius, encoding obstacles, teammates, opponents, and relative positions. Provide a `SimulationStep` service that advances all agents each tick, validates moves against walls, and tracks visibility for scoring. Keep logic deterministic via injectible RNG seeded per episode.

Then, create training artifacts. Implement separate policy networks for hiders and seekers using TensorFlow.js: small convolutional or dense models that accept flattened local observations and output Q-values over discrete actions (stay, up, down, left, right). Build replay buffers per role with sampling for mini-batch training. Implement epsilon-greedy action selection with annealing over generations. Construct a `Trainer` module (`src/training/Trainer.ts`) that loops over episodes, collects experiences, optimizes both role networks, and records per-generation metrics (average reward, capture rate). Capture representative episodes each N generations into a `ReplayDataset` structure (config, seed, traits, generations[], each with metrics and at least one sampled trajectory containing map layout and step-by-step positions and visibility flags). Persist the replay as JSON to `dist/replays/<timestamp>-seed<seed>.json`.

After training, wire the browser viewer. Update `index.html` to load `dist/main.js` as a module. Implement `src/viewer/ReplayLoader.ts` to fetch a replay JSON (defaulting to the latest or a selected file). Implement `src/viewer/Renderer.ts` to draw the grid, obstacles, and agents on a canvas with simple colors per role and visibility shading. Implement `src/viewer/Controls.ts` to provide a slider bound to generations; moving it reloads the chosen generation sample and triggers playback of its steps on the canvas. Add lightweight status text (current generation, metrics). Ensure the viewer gracefully handles missing data and can swap replay files without reload.

Finally, tie everything together. Provide a CLI entrypoint `src/training/runTraining.ts` (invoked via `npm run train` or `npx ts-node`) that accepts config parameters (map size, counts, traits, seed, generations, snapshot interval, output file). Provide a build step to emit browser assets (`npx tsc`) and place replay JSONs under `dist/replays/`. Validate end-to-end by running a short training session, opening `index.html` via a static server, and scrubbing the slider to view episode evolution. Document expected performance knobs and how to regenerate data.

## Concrete Steps

From repository root, install tooling and TensorFlow.js:
    npm install @tensorflow/tfjs
    npm install --save-dev ts-node

Adjust TypeScript config and scripts, then build browser assets:
    npx tsc

Run a fast training session to produce a sample replay (example, tweak params as needed):
npx ts-node src/training/runTraining.ts --seed 1234 --mapWidth 15 --mapHeight 15 --hiders 3 --seekers 2 --generations 200 --snapshotInterval 20 --output dist/replays/sample-seed1234.json

Serve the static files and open the viewer (any static server works; example using npx):
npx http-server .

Use the generation slider in the browser to scrub through recorded generations; expect the canvas to animate the sample trajectory for the selected generation and show updated metrics.

## Validation and Acceptance

Acceptance requires that a user can run the training command to completion with tfjs-node (no rendering during training), see JSON replay output in `dist/replays/`, and then open the browser viewer where the canvas animates agents for the selected generation. Moving the slider must switch to the chosen generation’s sample and reflect its metrics. Configurable parameters (hider/seeker counts, traits, map size, seed) must change both training behavior and replay contents without code changes. Training must run quickly for small configs (e.g., a few hundred generations on a small grid) and not render while training.

## Idempotence and Recovery

Training runs are idempotent per seed and config: rerunning with the same seed overwrites or regenerates identical obstacle maps and trajectories. Replay generation writes to a new filename; if a run fails mid-way, rerun the trainer and delete the partial file. Viewer side is stateless; reloading the page reinitializes state and rereads the selected JSON.

## Artifacts and Notes

Preserve at least one small replay JSON under `dist/replays/` for quick validation. Capture brief training logs (average reward and capture rates) in the trainer output to aid regression checks. Keep command transcripts short and focused on proofs that training ran and replays loaded.

## Interfaces and Dependencies

Dependencies: `@tensorflow/tfjs` (CPU backend) for model training/inference in Node; `ts-node` for running TypeScript trainers; no additional browser libraries beyond the DOM and canvas APIs.

Key interfaces to implement:
src/simulation/GridMap.ts: class GridMap { readonly width: number; readonly height: number; cells: CellType[][]; static fromSeed(seed: string, width: number, height: number, obstacleDensity: number): GridMap; isWalkable(x: number, y: number): boolean; }
src/simulation/types.ts: export enum AgentType { Hider, Seeker } export interface AgentTraits { speed: number; vision: number; stamina?: number; } export interface AgentState { id: string; type: AgentType; traits: AgentTraits; position: { x: number; y: number }; alive: boolean; energy?: number; }
src/simulation/Observation.ts: interface Observation { localGrid: number[]; visibleAgents: { id: string; type: AgentType; dx: number; dy: number }[]; self: AgentState; }
src/simulation/Environment.ts: class Environment { step(actions: Map<string, Action>): StepResult; reset(seed: string): EpisodeInitialState; computeObservation(agentId: string): Observation; }
src/training/PolicyNetwork.ts: class PolicyNetwork { constructor(role: AgentType, actionCount: number); predict(obsBatch: tf.Tensor): tf.Tensor; train(batch: ExperienceBatch, params: TrainingParams): Promise<void>; }
src/training/Trainer.ts: class Trainer { run(config: TrainerConfig): Promise<ReplayDataset>; }
src/training/types.ts: define TrainerConfig (counts, traits, map size, seed, generations, snapshot interval, replay output path), ReplayDataset (config, seed, generations[], episodes[] with per-step agent positions and visibility flags).
src/viewer/Renderer.ts: class Renderer { constructor(canvas: HTMLCanvasElement); drawFrame(frame: FrameSnapshot, meta: FrameMeta): void; }
src/viewer/Controls.ts: class Controls { constructor(slider: HTMLInputElement, onChange: (generationIndex: number) => void); attach(): void; }
src/viewer/ReplayLoader.ts: class ReplayLoader { load(url: string): Promise<ReplayDataset>; }

Change note: Initial version of the ExecPlan created on 2025-11-17 to guide the hide-and-seek RL baseline implementation.
