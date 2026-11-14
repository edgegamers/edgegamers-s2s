/**
 * Which point lies on a line of sight — the selection rule behind "the body you are looking at".
 * Import-free so it can be tested directly.
 */

export interface Point {
  x: number;
  y: number;
  z: number;
}

/**
 * Index of the candidate nearest the ray from `eye` along unit `forward`, counting only candidates
 * ahead of the eye, within `reach` along the ray and `radius` of it. Between candidates equally close
 * to the line, the nearer one wins. -1 when none qualifies.
 */
export function pickAlongRay(eye: Point, forward: Point, reach: number, radius: number, candidates: readonly Point[]): number {
  const radiusSq = radius * radius;
  let best = -1;
  let bestPerp = radiusSq;
  let bestAlong = Infinity;
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i]!;
    const x = c.x - eye.x, y = c.y - eye.y, z = c.z - eye.z;
    const along = x * forward.x + y * forward.y + z * forward.z;
    if (along < 0 || along > reach) continue;
    const perp = x * x + y * y + z * z - along * along;
    if (perp > radiusSq) continue;
    if (perp < bestPerp || (perp === bestPerp && along < bestAlong)) {
      best = i;
      bestPerp = perp;
      bestAlong = along;
    }
  }
  return best;
}
