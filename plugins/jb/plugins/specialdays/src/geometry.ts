/**
 * Small vector/geometry helpers (ConvexHullUtil, DistanceZone, ShuffleBag, MapUtil spawn picking).
 * Pure: plain `{x,y,z}` objects so it runs under `node --test`.
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export const vec = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
export const copy = (v: Vec3): Vec3 => ({ x: v.x, y: v.y, z: v.z });
export const add = (a: Vec3, b: Vec3): Vec3 => vec(a.x + b.x, a.y + b.y, a.z + b.z);
export const sub = (a: Vec3, b: Vec3): Vec3 => vec(a.x - b.x, a.y - b.y, a.z - b.z);
export const scale = (a: Vec3, k: number): Vec3 => vec(a.x * k, a.y * k, a.z * k);
export const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
export const length = (a: Vec3): number => Math.sqrt(dot(a, a));
export const dist2 = (a: Vec3, b: Vec3): number => dot(sub(a, b), sub(a, b));
export const dist = (a: Vec3, b: Vec3): number => Math.sqrt(dist2(a, b));
/** Squared distance ignoring height. */
export const hdist2 = (a: Vec3, b: Vec3): number => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

/** Unit vector, or the zero vector for a zero input (never NaN). */
export function normalize(a: Vec3): Vec3 {
  const len = length(a);
  return len === 0 ? vec(0, 0, 0) : scale(a, 1 / len);
}

/** Index of the point nearest `from`, or -1 for an empty list. */
export function nearestIndex(points: readonly Vec3[], from: Vec3): number {
  let best = -1;
  let bestD = Infinity;
  points.forEach((p, i) => {
    const d = dist2(p, from);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

const cross2 = (o: Vec3, a: Vec3, b: Vec3): number => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

/** 2D (x/y) convex hull, monotone chain. Fewer than 3 points are returned as-is. */
export function convexHull2D(points: readonly Vec3[]): Vec3[] {
  if (points.length < 3) return points.map(copy);
  const pts = points.map(copy).sort((a, b) => a.x - b.x || a.y - b.y);
  const lower: Vec3[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross2(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Vec3[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross2(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

/** Ray-casting point-in-polygon on x/y. */
export function insidePolygon2D(p: Vec3, poly: readonly Vec3[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Squared x/y distance from `p` to segment `a`–`b`. */
export function segmentDistance2D(p: Vec3, a: Vec3, b: Vec3): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = a.x + t * dx;
  const cy = a.y + t * dy;
  return (p.x - cx) ** 2 + (p.y - cy) ** 2;
}

/** ConvexHullUtil.GetMinDistanceSquared: 0 inside the hull, else squared distance to its border. */
export function hullDistanceSquared(p: Vec3, hull: readonly Vec3[]): number {
  if (hull.length === 0) return Infinity;
  if (hull.length === 1) return hdist2(p, hull[0]);
  if (hull.length >= 3 && insidePolygon2D(p, hull)) return 0;
  let min = Infinity;
  for (let i = 0; i < hull.length; i++) {
    min = Math.min(min, segmentDistance2D(p, hull[i], hull[(i + 1) % hull.length]));
  }
  return min;
}

/** Squared distance from `p` to an axis-aligned box (0 inside). */
export function boxDistanceSquared(p: Vec3, min: Vec3, max: Vec3): number {
  const dx = Math.max(min.x - p.x, 0, p.x - max.x);
  const dy = Math.max(min.y - p.y, 0, p.y - max.y);
  const dz = Math.max(min.z - p.z, 0, p.z - max.z);
  return dx * dx + dy * dy + dz * dz;
}

export function boxCenter(min: Vec3, max: Vec3): Vec3 {
  return vec((min.x + max.x) / 2, (min.y + max.y) / 2, (min.z + max.z) / 2);
}

/** DistanceZone.GetCenterPoint: the input point with the smallest summed squared distance to the rest. */
export function centralPoint(points: readonly Vec3[]): Vec3 | null {
  let best: Vec3 | null = null;
  let bestSum = Infinity;
  for (const o of points) {
    let sum = 0;
    for (const p of points) sum += dist2(p, o);
    if (sum < bestSum) {
      bestSum = sum;
      best = o;
    }
  }
  return best ? copy(best) : null;
}

/** In-place Fisher–Yates. */
export function shuffle<T>(items: T[], rng: () => number = Math.random): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

/** ShuffleBag: draws every item once in random order, then refills. */
export class ShuffleBag<T> {
  private bag: T[] = [];
  private readonly items: readonly T[];
  private readonly rng: () => number;

  constructor(items: readonly T[], rng: () => number = Math.random) {
    this.items = [...items];
    this.rng = rng;
  }

  get size(): number {
    return this.items.length;
  }

  /** The next item, or undefined if the bag was built empty. */
  next(): T | undefined {
    if (this.items.length === 0) return undefined;
    if (this.bag.length === 0) this.bag = [...this.items];
    const i = Math.floor(this.rng() * this.bag.length);
    return this.bag.splice(i, 1)[0];
  }
}

/**
 * MapUtil.GetRandomSpawns: progressively less "random-quality" sources until there are at least
 * `count` points. `tiers` are cumulative in order (e.g. spawn zones, then teleport destinations,
 * then team spawns). The result is shuffled.
 */
export function pickSpawns(count: number, tiers: readonly (readonly Vec3[])[], rng: () => number = Math.random): Vec3[] {
  let pool: Vec3[] = [];
  for (const tier of tiers) {
    pool = pool.concat(tier.map(copy));
    if (pool.length >= count) break;
  }
  return shuffle(pool, rng);
}
