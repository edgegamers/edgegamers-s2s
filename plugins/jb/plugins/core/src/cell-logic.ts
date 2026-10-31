/**
 * Pure cell-door logic (no SDK imports, unit-tested): which func_button opens the cells, and
 * whether a position is "in the cells". Ported from MapUtil.OpenCells and DistanceZone /
 * ConvexHullUtil.
 */

export interface Point {
  x: number;
  y: number;
  z: number;
}

/** How strict the button-name heuristic is, strictest first (MapUtil.Sensitivity). */
export const Sensitivity = {
  NameCellDoor: 0,
  NameCell: 1,
  TargetCellDoor: 2,
  TargetCell: 3,
  AnyWithTarget: 4,
  Any: 5,
} as const;
export type SensitivityLevel = (typeof Sensitivity)[keyof typeof Sensitivity];

export const SENSITIVITY_NAMES = [
  "name contains cell+door",
  "name contains cell",
  "target contains cell+door",
  "target contains cell",
  "any button with a target",
  "any button",
] as const;

export interface ButtonCandidate {
  /** Entity index (or any id the caller maps back to the entity). */
  id: number;
  /** targetname ("" if none). */
  name: string;
  /** The entity it targets ("" if none). */
  target: string;
  origin: Point | null;
}

const has = (s: string, part: string): boolean => s.toLowerCase().includes(part);

/** Does this button pass the heuristic at `level`? */
export function matchesSensitivity(name: string, target: string, level: SensitivityLevel): boolean {
  switch (level) {
    case Sensitivity.NameCellDoor:
      return has(name, "cell") && has(name, "door");
    case Sensitivity.NameCell:
      return has(name, "cell");
    case Sensitivity.TargetCellDoor:
      return has(target, "cell") && has(target, "door");
    case Sensitivity.TargetCell:
      return has(target, "cell");
    case Sensitivity.AnyWithTarget:
      return target !== "";
    case Sensitivity.Any:
      return true;
  }
  return false;
}

export function distanceSquared(a: Point, b: Point): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return dx * dx + dy * dy + dz * dz;
}

/**
 * MapUtil.OpenCells: starting at `start`, find the buttons matching the heuristic, loosening it
 * until something matches. One match wins outright; several → the one nearest `source`.
 * Returns the chosen button and the level it matched at, or null if no button matched at all.
 */
export function pickCellButton(
  buttons: ButtonCandidate[],
  source: Point | null,
  start: SensitivityLevel = Sensitivity.NameCellDoor,
): { button: ButtonCandidate; level: SensitivityLevel } | null {
  for (let level = start; level <= Sensitivity.Any; level++) {
    const lvl = level as SensitivityLevel;
    const matches = buttons.filter((b) => matchesSensitivity(b.name, b.target, lvl));
    if (matches.length === 0) continue;
    if (matches.length === 1 || source === null) return { button: matches[0], level: lvl };
    const ranked = matches
      .map((b) => ({ b, d: b.origin ? distanceSquared(b.origin, source) : Number.POSITIVE_INFINITY }))
      .sort((p, q) => p.d - q.d);
    return { button: ranked[0].b, level: lvl };
  }
  return null;
}

/** Without a zone, an auto-detected button only counts as "the cells" at TARGET_CELL or stricter. */
export function isConfidentLevel(level: SensitivityLevel): boolean {
  return level <= Sensitivity.TargetCell;
}

// ---- "Is this prisoner still in the cells?" ------------------------------------------------

/** DistanceZone.WIDTH_CELL: 200 units, compared squared. */
export const CELL_TOLERANCE_SQ = 200 * 200;

function cross(o: Point, a: Point, b: Point): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

/** 2D (x/y) convex hull, Andrew's monotone chain — ConvexHullUtil.ComputeConvexHull. */
export function convexHull(points: Point[]): Point[] {
  if (points.length < 3) return [...points];
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const lower: Point[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Point[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

/** Ray-cast point-in-polygon on x/y. */
export function insidePolygon(p: Point, poly: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Squared x/y distance from `p` to segment `v`–`w`. */
export function segmentDistanceSquared(p: Point, v: Point, w: Point): number {
  const l2 = (v.x - w.x) ** 2 + (v.y - w.y) ** 2;
  if (l2 === 0) return (p.x - v.x) ** 2 + (p.y - v.y) ** 2;
  const t = Math.max(0, Math.min(1, ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2));
  const x = v.x + t * (w.x - v.x);
  const y = v.y + t * (w.y - v.y);
  return (p.x - x) ** 2 + (p.y - y) ** 2;
}

/**
 * The fallback "cells" area when no `cell` zone exists: inside the hull of the T spawns, or within
 * 200 units of its edge (DistanceZone(tSpawns, WIDTH_CELL)).
 */
export function nearSpawnHull(p: Point, spawns: Point[], toleranceSq = CELL_TOLERANCE_SQ): boolean {
  if (spawns.length === 0) return false;
  const hull = convexHull(spawns);
  if (hull.length >= 3 && insidePolygon(p, hull)) return true;
  let best = Number.POSITIVE_INFINITY;
  if (hull.length === 1) best = (p.x - hull[0].x) ** 2 + (p.y - hull[0].y) ** 2;
  for (let i = 0; i < hull.length && hull.length > 1; i++) {
    best = Math.min(best, segmentDistanceSquared(p, hull[i], hull[(i + 1) % hull.length]));
  }
  return best < toleranceSq;
}

/** Axis-aligned box containment (zones are min/max boxes). */
export function insideBox(p: Point, min: Point, max: Point): boolean {
  const lo = (a: number, b: number): number => Math.min(a, b);
  const hi = (a: number, b: number): number => Math.max(a, b);
  return (
    p.x >= lo(min.x, max.x) && p.x <= hi(min.x, max.x) &&
    p.y >= lo(min.y, max.y) && p.y <= hi(min.y, max.y) &&
    p.z >= lo(min.z, max.z) && p.z <= hi(min.z, max.z)
  );
}

export function boxCenter(min: Point, max: Point): Point {
  return { x: (min.x + max.x) / 2, y: (min.y + max.y) / 2, z: (min.z + max.z) / 2 };
}
