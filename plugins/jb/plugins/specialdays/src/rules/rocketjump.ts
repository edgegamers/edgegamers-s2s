/** Rocket-jump launch math (RocketJumpDay.doJump). Pure. */
import type { Vec3 } from "../geometry.ts";
import { add, dot, normalize, scale, sub, vec } from "../geometry.ts";

export interface RocketJumpParams {
  /** Max distance from the blast to the player's eyes that still launches. */
  maxDistance: number;
  /** Below this distance the vertical boost is damped (full-force close jump). */
  closeJumpDistance: number;
  forceMain: number;
  forceUp: number;
  forceForward: number;
  forceBackward: number;
  /** Multiplier when the player was on the ground. */
  runForceMain: number;
}

/**
 * The velocity to set on a player whose rocket hit `impact` while their eyes were at `eye`,
 * moving at `velocity`. Null when out of range.
 */
export function rocketJumpVelocity(
  p: RocketJumpParams,
  impact: Vec3,
  eye: Vec3,
  velocity: Vec3,
  onGround: boolean,
): Vec3 | null {
  const distance = Math.sqrt(dot(sub(eye, impact), sub(eye, impact)));
  if (distance >= p.maxDistance) return null;

  const direction = normalize(sub(eye, impact));
  const moveDir = normalize(vec(velocity.x, velocity.y, 0));
  // The C# normalised a zero vector (NaN), so a standing player always took the backward scale.
  const moving = moveDir.x !== 0 || moveDir.y !== 0;
  const k = moving && dot(direction, moveDir) >= 0 ? p.forceForward : p.forceBackward;

  let total = scale(add(velocity, scale(direction, p.forceMain)), k);
  total = vec(total.x, total.y, 0);
  if (onGround) total = scale(total, p.runForceMain);

  const forceUp = p.forceUp * (p.maxDistance - distance);
  const z = distance > p.closeJumpDistance ? total.z + forceUp : total.z + forceUp / 1.37;
  return vec(total.x, total.y, z);
}
