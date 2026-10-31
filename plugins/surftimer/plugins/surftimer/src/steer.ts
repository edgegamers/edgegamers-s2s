// Replay bot steering (pure: typed arrays only, unit-tested in node).
//
// ckSurf / BotMimic style: the bot moves under the engine's own physics with a velocity that takes it
// from where it actually is to the next recorded position in one tick, so small errors (friction,
// gravity, a player in the way) correct themselves on the following tick. Only real divergence, or a
// map teleport baked into the recording, costs a hard position snap.
import { FRAME_WORDS, F_X, F_Y, F_Z } from "@edgegamers/surftimer-shared";

/** Off by more than this (units) → snap to the recorded position. */
export const SNAP_UNITS = 32;
/** A recorded one-tick step faster than this (u/s) is a map teleport, not movement. */
export const TELEPORT_SPEED = 4000;

/**
 * Velocity (into `out`) that carries the bot from (x, y, z) to frame `k` in one tick of `interval`
 * seconds. Returns true when the bot should instead be snapped to frame `k`.
 */
export function steer(f: Float32Array, k: number, interval: number, x: number, y: number, z: number, out: number[]): boolean {
  const W = FRAME_WORDS;
  const b = k * W;
  const tx = f[b + F_X], ty = f[b + F_Y], tz = f[b + F_Z];
  const dx = tx - x, dy = ty - y, dz = tz - z;
  if (dx * dx + dy * dy + dz * dz > SNAP_UNITS * SNAP_UNITS) return true;
  if (k > 0) {
    const p = b - W;
    const sx = tx - f[p + F_X], sy = ty - f[p + F_Y], sz = tz - f[p + F_Z];
    const max = TELEPORT_SPEED * interval;
    if (sx * sx + sy * sy + sz * sz > max * max) return true;
  }
  const inv = 1 / interval;
  out[0] = dx * inv; out[1] = dy * inv; out[2] = dz * inv;
  return false;
}
