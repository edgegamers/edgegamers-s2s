/**
 * Where a map's armory (CT spawn) is, for the `jb.armory` event: the zones tagged `armory` when
 * `@s2script/zones` has them, else the CT spawn points' x/y convex hull widened by `radius`, within a
 * height band around the spawns (so a floor above or below does not count). Pure, for `node --test`.
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface ArmoryArea {
  contains(p: Vec3): boolean;
}

/** Below the lowest spawn / above the highest that still counts as in the armory. */
const BELOW = 64;
const ABOVE = 160;

/** The `armory` zones as an area; null without any. */
export function armoryFromZones(zones: readonly { min: Vec3; max: Vec3 }[]): ArmoryArea | null {
  if (zones.length === 0) return null;
  const boxes = zones.map((z) => ({
    min: { x: Math.min(z.min.x, z.max.x), y: Math.min(z.min.y, z.max.y), z: Math.min(z.min.z, z.max.z) },
    max: { x: Math.max(z.min.x, z.max.x), y: Math.max(z.min.y, z.max.y), z: Math.max(z.min.z, z.max.z) },
  }));
  return {
    contains: (p) =>
      boxes.some((b) => p.x >= b.min.x && p.x <= b.max.x && p.y >= b.min.y && p.y <= b.max.y && p.z >= b.min.z && p.z <= b.max.z),
  };
}

/** The CT spawns' hull widened by `radius` (units); null without spawns. */
export function armoryFromSpawns(spawns: readonly Vec3[], radius: number): ArmoryArea | null {
  if (spawns.length === 0) return null;
  const hull = convexHull2D(spawns);
  const r2 = Math.max(0, radius) ** 2;
  const minZ = Math.min(...spawns.map((s) => s.z)) - BELOW;
  const maxZ = Math.max(...spawns.map((s) => s.z)) + ABOVE;
  return { contains: (p) => p.z >= minZ && p.z <= maxZ && hullDistanceSquared(p, hull) <= r2 };
}

const cross2 = (o: Vec3, a: Vec3, b: Vec3): number => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

/** 2D (x/y) convex hull, monotone chain. Fewer than 3 points are returned as they are. */
export function convexHull2D(points: readonly Vec3[]): Vec3[] {
  if (points.length < 3) return [...points];
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const lower: Vec3[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross2(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Vec3[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]!;
    while (upper.length >= 2 && cross2(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

function insidePolygon2D(p: Vec3, poly: readonly Vec3[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function segmentDistance2D(p: Vec3, a: Vec3, b: Vec3): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return (p.x - (a.x + t * dx)) ** 2 + (p.y - (a.y + t * dy)) ** 2;
}

/** 0 inside the hull, else the squared x/y distance to its border. */
export function hullDistanceSquared(p: Vec3, hull: readonly Vec3[]): number {
  if (hull.length === 0) return Infinity;
  if (hull.length >= 3 && insidePolygon2D(p, hull)) return 0;
  if (hull.length === 1) return (p.x - hull[0]!.x) ** 2 + (p.y - hull[0]!.y) ** 2;
  let min = Infinity;
  for (let i = 0; i < hull.length; i++) min = Math.min(min, segmentDistance2D(p, hull[i]!, hull[(i + 1) % hull.length]!));
  return min;
}
