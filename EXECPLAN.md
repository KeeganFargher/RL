# RL hide-and-seek free-movement with facing cones and obstacle drops

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds. Maintain this document in accordance with `.agent/PLANS.md`.

## Purpose / Big Picture

Pivot the hide-and-seek sandbox from a grid to a continuous top-down arena where agents move freely with facing directions. Seekers only capture a hider after keeping that hider inside their vision cone for at least two seconds of simulated time with an unobstructed line of sight. Obstacles block sight; hiders gain a configurable per-match ability to drop new obstacles in front of them. Both roles now have explicit orientation, and the browser viewer must render orientations and vision cones while replaying recorded generations.

## Progress

- [x] (2025-11-17 12:00Z) Captured initial grid-based requirements and drafted the first ExecPlan.
- [x] (2025-11-17 13:40Z) Built the grid baseline (simulation, trainer scaffolding, viewer) and produced a sample replay JSON.
- [x] (2025-11-17 22:30Z) Captured the free-movement, facing-cone, timed capture, and hider obstacle-drop requirements and rewrote the ExecPlan.
- [x] (2025-11-17 22:55Z) Implemented continuous arena simulation with cones, timed capture logic, obstacle placement, updated training schema, and refreshed viewer rendering; build passes. Pending: regenerate replay and validate viewer playback.
- [x] (2025-11-18 08:30Z) Improve training quality so captures actually occur: add reward shaping for seeing/hiding, normalize observation features, add DQN target updates and warmup, and fix seeker turn-rate handling.

## Surprises & Discoveries

- Observation: `@tensorflow/tfjs-node` install failed on Node 24 due to missing prebuilt binaries and toolchain requirement for source build.  
  Evidence: npm error `response status 404 Not Found` for CPU-windows-4.22.0.zip and node-gyp Visual Studio lookup failure during `npm install`.
- Observation: Running training with pure `@tensorflow/tfjs` shows a notice recommending tfjs-node for speed, which we intentionally skipped due to install failure.  
  Evidence: Node training logs print the tfjs-node suggestion banner during `npm run train`.

## Decision Log

- Decision: Replace the grid world with a continuous rectangular arena that uses floating-point positions, velocities, and headings for all agents, keeping a fixed tick duration (default 0.1s) to reason about time-based rules.  
  Rationale: The requested behavior requires free movement and explicit facing; a fixed step duration turns the two-second capture rule into a concrete step count (`captureHoldSteps = ceil(2s / tickDuration)`).
  Date/Author: 2025-11-17 / assistant
- Decision: Vision is modeled as a cone per agent (configurable range and field-of-view angle) using ray casting for occlusion by static or placed obstacles; seekers accumulate time-on-target for each visible hider and only capture after the hold duration elapses without occlusion.  
  Rationale: Cones and ray-based line-of-sight allow directional sensing and obstacle blocking as requested.
  Date/Author: 2025-11-17 / assistant
- Decision: Hiders receive a per-match limited ability to drop short rectangular obstacles projected from their current heading, with a short placement cooldown, and new obstacles instantly affect movement and visibility.  
  Rationale: The user wants hiders to place cover tactically; bounding placement keeps the state manageable for training and rendering.
  Date/Author: 2025-11-17 / assistant
- Decision: Keep training and inference on pure `@tensorflow/tfjs` (CPU backend) until tfjs-node binaries are available for the current Node version.  
  Rationale: tfjs-node failed to install on Node 24; pure tfjs remains portable and adequate for small arenas.
  Date/Author: 2025-11-17 / assistant
- Decision: Add gentle reward shaping (seekers rewarded for sustained visibility and closing distance; hiders rewarded for staying unseen), normalize all observation features to small ranges, and introduce a target network with delayed updates plus a replay warmup before training.  
  Rationale: The previous sparse rewards and self-chasing Q-targets prevented learning; these changes give more frequent signal and stabilize value estimates without hand-crafting tactics.  
  Date/Author: 2025-11-18 / assistant

## Outcomes & Retrospective

Pending. Summarize training speed, replay fidelity, and UX once the continuous, vision-cone rules are validated end-to-end.

## Context and Orientation

The current codebase implements a grid-based environment, trainer, and viewer. This plan pivots to a continuous arena with orientation-aware sensing and obstacle placement. The refactor must reshape simulation state, observations, action spaces, replay serialization, and rendering while preserving the existing Node/browser split: Node handles training and replay generation; the browser only replays saved JSON with canvas visuals and slider controls.

## Plan of Work

Establish the continuous world model. Introduce geometry utilities for positions, headings (radians), velocities, and axis-aligned rectangular obstacles. Define a fixed tick duration (default 0.1s) and derive `captureHoldSteps` from the required two-second focus time. Replace `GridMap` usage with an arena description and obstacle list (seeded static obstacles plus placed obstacles tracked per episode). Update movement to resolve collisions against rectangles and clamp positions inside the arena.

Redesign observations, actions, and rewards around facing and cones. Define a discrete action set including rotation (left/right), forward/backward motion, strafing, and `placeObstacle` for hiders (no-op for seekers). Model vision via evenly spaced rays inside the cone; produce observation features such as normalized hit distances per ray, a bounded list of visible agents with relative angle/distance and time-visible fractions, and self-state (heading, speed, remaining placements). Rewards should encourage seekers to sustain visibility on hiders, bonus on confirmed captures, and penalize loss of visual contact; hiders should gain for breaking line of sight and survive to episode end. Implement per-seeker timers that reset when a hider leaves the cone or is occluded; capture triggers when the timer exceeds `captureHoldSteps`.

Refactor training and replay generation. Adapt policy networks to the new observation vector (rays and agent features) and updated action space. Keep replay buffers but adjust experience structure to store headings and placement counts. Emit replay JSON that records arena bounds, static and placed obstacles, per-step agent poses, headings, action taken, and capture-timer progress so the viewer can reconstruct cones and capture events. Maintain seed-driven determinism for obstacle generation and RNG use.

Update the browser viewer. Extend rendering to draw agent headings (triangular marker) and vision cones (filled/outlined sector) clipped against obstacles using the saved replay. Render static and placed obstacles distinctly. Show per-seeker capture-progress HUD (e.g., timer bars) so the two-second focus rule is visible during playback. Keep the generation slider and file loader behavior, ensuring new replay fields are consumed safely.

Validate and document. Run a short training session with the new rules, generate a replay, and confirm in the viewer that seekers must hold gaze for two seconds to capture, obstacles block sight, and hider-placed obstacles appear and affect visibility. Document configurable parameters (cone angles, vision range, tick duration, placement count/cooldown) and how to tune them.

## Concrete Steps

Install tooling (unchanged):  
    npm install @tensorflow/tfjs  
    npm install --save-dev ts-node

Refactor the simulation to continuous geometry: replace grid cell logic with arena/obstacle structures, heading-aware movement, ray-cast visibility, and capture timers derived from `captureHoldSeconds / tickDuration`. Add a hider-only `placeObstacle` action that spawns a short rectangle in front of the agent when uses remain and cooldown allows.

Update training artifacts: redefine `Action` enums, observations (ray distances, visible agents, self state), and rewards; adjust policy network input shapes and output dimensions; update replay buffers and Trainer to record headings, cone parameters, and placement uses. Re-run training to produce a new sample replay (e.g., `npx ts-node src/training/runTraining.ts --seed 42 --tickDuration 0.1 --captureHoldSeconds 2 --hiderPlacements 2 --arenaWidth 25 --arenaHeight 25 --generations 200 --snapshotInterval 20 --output dist/replays/sample-free-movement.json`).

Refresh the viewer: update loader to parse new replay fields, renderer to draw headings, cones, and placed obstacles, and controls to scrub generations as before. Verify the sample replay in the browser shows cone-based vision and timed captures.

## Validation and Acceptance

Acceptance requires demonstrating that a seeker only captures a hider after the hider stays inside the seeker's cone for the configured hold duration without any obstacle between them. Moving a hider behind a wall or newly placed obstacle must immediately break visibility and reset the capture timer. The viewer must show agent headings and cones that match replay data, and hider-placed obstacles must render where they were dropped. Training must run headlessly in Node with tfjs, generate replays containing headings/cones/obstacles, and the generation slider must still scrub through samples.

## Idempotence and Recovery

Arena generation remains seed-driven; rerunning with the same seed and config yields identical static obstacles and deterministic placement opportunities. Placement counts reset each episode; invalid placement attempts are ignored and do not desync state. If ray-cast or capture logic misbehaves, rerun training after patching; replays are immutable snapshots and new runs write new filenames with timestamps or seeds.

## Artifacts and Notes

Preserve at least one replay demonstrating the new rules under `dist/replays/` for regression checks. Capture brief logs showing capture timer thresholds and obstacle placement usage during training to aid debugging. Keep command transcripts concise and focused on proof of the two-second hold and obstacle occlusion behaviors.

## Interfaces and Dependencies

Dependencies remain `@tensorflow/tfjs` (CPU backend) and `ts-node` for running trainers; no additional browser libraries are required beyond canvas APIs.

Key interfaces to implement or revise:  
src/simulation/geometry.ts: export types `Vec2 { x: number; y: number }`, `Pose { position: Vec2; heading: number }`, `Obstacle { id: string; min: Vec2; max: Vec2 }`, ray casting helpers `castRay(origin: Vec2, heading: number, maxRange: number, obstacles: Obstacle[]): RayHit`.  
src/simulation/types.ts: `export enum Action { Idle, MoveForward, MoveBackward, StrafeLeft, StrafeRight, TurnLeft, TurnRight, PlaceObstacle }`; `export interface AgentState { id: string; type: AgentType; pose: Pose; velocity: Vec2; speed: number; visionRange: number; fovDegrees: number; placementsRemaining?: number; placementCooldown?: number; }`; environment config includes `tickDuration`, `captureHoldSeconds`, `placementCount`, `placementCooldownSeconds`, arena bounds, static obstacles.  
src/simulation/Environment.ts: methods `reset(seed: string)`, `step(actions: Map<string, Action>): StepResult`, `computeObservation(agentId: string): Observation` using cone ray casts, capture timers per seeker/hider pair, and obstacle placement resolution that injects new `Obstacle` instances.  
src/training/types.ts: update `Observation` to hold `rayDistances: number[]`, `visibleAgents: { id: string; type: AgentType; relAngle: number; relDistance: number; visibilityFraction: number }[]`, plus self-state; update `Experience` to record headings and placement usage.  
src/viewer/Renderer.ts: draw agents with headings (triangle indicator), vision cones (sector/arc), obstacles (static vs placed style), and optional capture-progress HUD; ensure it consumes new replay schema.  
src/viewer/ReplayLoader.ts: validate and parse the extended replay schema (arena bounds, obstacles, headings, placements, cone parameters).

Change note: Initial version of the ExecPlan created on 2025-11-17 to guide the grid-based hide-and-seek RL baseline implementation. Updated on 2025-11-17 to pivot to a continuous, facing-cone design with timed captures and hider obstacle placement per user request. Updated on 2025-11-18 to document training-quality fixes (reward shaping, normalization, target network) to make captures learnable.

