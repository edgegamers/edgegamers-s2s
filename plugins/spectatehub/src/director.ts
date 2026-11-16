/**
 * The auto camera's choices, kept free of the engine so they can be tested.
 *
 * A spectator on auto gets a cut every few seconds: mostly to a living player (alternating
 * first-person and chase), and now and then to a fixed shot of the map when the server can drive
 * the custom camera.
 */

export type Vec3 = { x: number; y: number; z: number };
export type FixedShot = { origin: Vec3; angles: Vec3 };

/** CS2 observer modes we cut between. */
export const OBS_IN_EYE = 2;
export const OBS_CHASE = 3;

export type Shot =
  | { kind: "fixed"; index: number }
  | { kind: "follow"; target: number; mode: typeof OBS_IN_EYE | typeof OBS_CHASE };

/**
 * The next shot for one viewer. `targets` are the slots worth watching (living players), and
 * `fixedCount` the fixed shots available (0 when the custom camera is unavailable).
 */
export function nextShot(prev: Shot | null, targets: readonly number[], fixedCount: number, rand: () => number = Math.random): Shot | null {
  const fixed = (): Shot => {
    let index = Math.floor(rand() * fixedCount);
    if (prev?.kind === "fixed" && fixedCount > 1 && index === prev.index) index = (index + 1) % fixedCount;
    return { kind: "fixed", index };
  };
  if (targets.length === 0) return fixedCount > 0 ? fixed() : null;
  // A fixed shot breaks up every few player cuts, never twice in a row while someone is alive.
  if (fixedCount > 0 && prev?.kind === "follow" && rand() < 0.3) return fixed();
  let target = targets[Math.floor(rand() * targets.length)]!;
  if (prev?.kind === "follow" && targets.length > 1 && target === prev.target) {
    target = targets[(targets.indexOf(target) + 1) % targets.length]!;
  }
  const mode = prev?.kind === "follow" && prev.mode === OBS_IN_EYE ? OBS_CHASE : OBS_IN_EYE;
  return { kind: "follow", target, mode };
}

function mean(points: readonly Vec3[]): Vec3 {
  const n = points.length;
  let x = 0, y = 0, z = 0;
  for (const p of points) { x += p.x; y += p.y; z += p.z; }
  return { x: x / n, y: y / n, z: z / n };
}

/** Pitch and yaw (degrees) that look from `from` to `to`. */
export function lookAt(from: Vec3, to: Vec3): Vec3 {
  const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
  const yaw = (Math.atan2(dy, dx) * 180) / Math.PI;
  const pitch = (-Math.atan2(dz, Math.hypot(dx, dy)) * 180) / Math.PI;
  return { x: pitch, y: yaw, z: 0 };
}

/**
 * Fixed shots made from the spawn points when a map has none configured: one raised above each
 * team's spawn, pulled back from the map centre and looking across at it.
 */
export function shotsFromSpawns(groups: readonly (readonly Vec3[])[], height = 192, pullBack = 192): FixedShot[] {
  const centres = groups.filter((g) => g.length > 0).map(mean);
  if (centres.length === 0) return [];
  const middle = mean(centres);
  const shots: FixedShot[] = [];
  for (const c of centres) {
    const dx = c.x - middle.x, dy = c.y - middle.y;
    const len = Math.hypot(dx, dy);
    const origin = len > 1
      ? { x: c.x + (dx / len) * pullBack, y: c.y + (dy / len) * pullBack, z: c.z + height }
      : { x: c.x, y: c.y, z: c.z + height };
    const target = centres.length > 1 ? middle : { x: c.x + 400, y: c.y, z: c.z };
    shots.push({ origin, angles: lookAt(origin, target) });
  }
  return shots;
}

/** Parse `spectatehub_shots.json`: `{ "<map>": [{ "origin": [x,y,z], "angles": [p,y,r] }] }`. Bad entries are skipped. */
export function parseShotFile(text: string | null, map: string): FixedShot[] {
  if (!text) return [];
  let data: unknown;
  try { data = JSON.parse(text); } catch { return []; }
  const list = (data as Record<string, unknown> | null)?.[map];
  if (!Array.isArray(list)) return [];
  const triple = (v: unknown): Vec3 | null =>
    Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === "number" && Number.isFinite(n))
      ? { x: v[0], y: v[1], z: v[2] } : null;
  const out: FixedShot[] = [];
  for (const entry of list) {
    const origin = triple((entry as { origin?: unknown })?.origin);
    const angles = triple((entry as { angles?: unknown })?.angles);
    if (origin && angles) out.push({ origin, angles });
  }
  return out;
}
