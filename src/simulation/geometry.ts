export interface Vec2 {
  x: number;
  y: number;
}

export interface Pose {
  position: Vec2;
  heading: number; // radians, 0 points to +x axis
}

export interface Obstacle {
  id: string;
  min: Vec2; // inclusive lower-left
  max: Vec2; // inclusive upper-right
}

export interface RayHit {
  hit: boolean;
  distance: number;
  obstacleId?: string;
  point?: Vec2;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function scale(v: Vec2, s: number): Vec2 {
  return { x: v.x * s, y: v.y * s };
}

export function length(v: Vec2): number {
  return Math.sqrt(v.x * v.x + v.y * v.y);
}

export function normalizeAngle(angle: number): number {
  const twoPi = Math.PI * 2;
  let a = angle % twoPi;
  if (a < 0) a += twoPi;
  return a;
}

function raySegmentIntersection(
  origin: Vec2,
  dir: Vec2,
  segA: Vec2,
  segB: Vec2,
): { hit: boolean; t: number } {
  const v1 = { x: origin.x - segA.x, y: origin.y - segA.y };
  const v2 = { x: segB.x - segA.x, y: segB.y - segA.y };
  const cross = dir.x * v2.y - dir.y * v2.x;
  if (Math.abs(cross) < 1e-6) return { hit: false, t: Infinity }; // Parallel
  const t = (v2.x * v1.y - v2.y * v1.x) / cross;
  const u = (dir.x * v1.y - dir.y * v1.x) / cross;
  if (t >= 0 && u >= 0 && u <= 1) {
    return { hit: true, t };
  }
  return { hit: false, t: Infinity };
}

export function castRay(origin: Vec2, heading: number, maxRange: number, obstacles: Obstacle[]): RayHit {
  const dir = { x: Math.cos(heading), y: Math.sin(heading) };
  let best: RayHit = { hit: false, distance: maxRange };

  for (const obs of obstacles) {
    const corners: Vec2[] = [
      { x: obs.min.x, y: obs.min.y },
      { x: obs.max.x, y: obs.min.y },
      { x: obs.max.x, y: obs.max.y },
      { x: obs.min.x, y: obs.max.y },
    ];
    const edges: Array<[Vec2, Vec2]> = [
      [corners[0], corners[1]],
      [corners[1], corners[2]],
      [corners[2], corners[3]],
      [corners[3], corners[0]],
    ];

    for (const [a, b] of edges) {
      const hit = raySegmentIntersection(origin, dir, a, b);
      const dist = hit.t;
      if (hit.hit && dist < best.distance && dist <= maxRange) {
        best = {
          hit: true,
          distance: dist,
          obstacleId: obs.id,
          point: add(origin, scale(dir, dist)),
        };
      }
    }
  }

  return best;
}

export function pointInObstacle(p: Vec2, obstacle: Obstacle): boolean {
  return p.x >= obstacle.min.x && p.x <= obstacle.max.x && p.y >= obstacle.min.y && p.y <= obstacle.max.y;
}

export function collides(p: Vec2, obstacles: Obstacle[]): boolean {
  return obstacles.some((o) => pointInObstacle(p, o));
}

export function clampToArena(p: Vec2, width: number, height: number): Vec2 {
  return { x: clamp(p.x, 0, width), y: clamp(p.y, 0, height) };
}
