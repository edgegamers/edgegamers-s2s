// ArcadeScripts for s2script. Derived from ArcadeScripts-CSS by Supergosciuツ (GPL-3.0).
// See LICENSE and NOTICE. Helpers standing in for the CounterStrikeSharp entity API.
import { createEntity, Vector } from '@s2script/sdk';
import type { EntityKeyValueMap, EntityRef, QAngle } from '@s2script/sdk';
import { CenterHtml, Player, sceneNodeOf, wrapEntity } from '@s2script/cs2';
import type { Pawn } from '@s2script/cs2';

export type Vec = { x: number; y: number; z: number };

export const vec = (x: number, y: number, z: number): Vec => ({ x, y, z });
export const add = (a: Vec, b: Vec): Vec => vec(a.x + b.x, a.y + b.y, a.z + b.z);
export const sub = (a: Vec, b: Vec): Vec => vec(a.x - b.x, a.y - b.y, a.z - b.z);
export const length = (v: Vec): number => Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
export const lengthSqr = (v: Vec): number => v.x * v.x + v.y * v.y + v.z * v.z;
export const length2DSqr = (v: Vec): number => v.x * v.x + v.y * v.y;
export const distance = (a: Vec, b: Vec): number => length(sub(a, b));
export const triple = (v: Vec): number[] => [v.x, v.y, v.z];

/** Upstream `VectorExtensions.Scale`: rescale to `scalar` units long (a zero vector stays zero). */
export function scale(v: Vec, scalar: number): Vec {
  const len = length(v);
  return len === 0 ? vec(v.x, v.y, v.z) : vec(v.x * scalar / len, v.y * scalar / len, v.z * scalar / len);
}

/** Upstream `QAngle.GetForwardVector`. */
export function forward(angles: Vec): Vec {
  const pitch = angles.x * (Math.PI / 180);
  const yaw = angles.y * (Math.PI / 180);
  const cp = Math.cos(pitch);
  return vec(cp * Math.cos(yaw), cp * Math.sin(yaw), -Math.sin(pitch));
}

/** CounterStrikeSharp prints vectors to two decimals; upstream compares positions that way. */
export const samePosition = (a: Vec | null, b: Vec | null): boolean =>
  !!a && !!b && a.x.toFixed(2) === b.x.toFixed(2) && a.y.toFixed(2) === b.y.toFixed(2) && a.z.toFixed(2) === b.z.toFixed(2);

/** True when `p` lies in the box. Upstream uses inclusive bounds except for an exclusive top. */
export function inBox(p: Vec, min: Vec, max: Vec, withZ = true): boolean {
  return p.x >= min.x && p.x <= max.x && p.y >= min.y && p.y <= max.y && (!withZ || (p.z >= min.z && p.z < max.z));
}

/** Upstream `Random.RandomInt`: inclusive at both ends. */
export const randomInt = (min: number, max: number): number => min + Math.floor(Math.random() * (max - min + 1));
export const randomFloat = (min: number, max: number): number => Math.random() * (max - min) + min;

/** Float formatting as upstream sends it to inputs: invariant decimal point, no exponent for game ranges. */
export const num = (n: number): string => String(Math.round(n * 1e6) / 1e6);

export const keyOf = (ref: EntityRef): string => `${ref.index}:${ref.id}`;
export const same = (a: EntityRef | null | undefined, b: EntityRef | null | undefined): boolean =>
  !!a && !!b && a.index === b.index && a.id === b.id;
export const valid = (ref: EntityRef | null | undefined): ref is EntityRef => !!ref && ref.isValid();

/** `AddEntityIOEvent`: fire an input through the game's own I/O queue. */
export function fire(
  ref: EntityRef | null | undefined,
  input: string,
  opts: { value?: string; delay?: number; activator?: EntityRef | null; caller?: EntityRef | null } = {},
): void {
  if (!valid(ref)) return;
  ref.acceptInput(input, opts.value, opts.activator ?? undefined, opts.caller ?? undefined, opts.delay ?? 0);
}

export function teleport(ref: EntityRef | null | undefined, origin: Vec | null, angles?: Vec | null, velocity?: Vec | null): void {
  if (!valid(ref)) return;
  ref.teleport(origin ? triple(origin) : null, angles ? triple(angles) : null, velocity ? triple(velocity) : null);
}

export const originOf = (ref: EntityRef | null | undefined): Vector | null => (valid(ref) ? ref.origin : null);
export const rotationOf = (ref: EntityRef | null | undefined): QAngle | null => (valid(ref) ? sceneNodeOf(ref)?.absRotation ?? null : null);
export const ownerOf = (ref: EntityRef | null | undefined): EntityRef | null =>
  valid(ref) ? wrapEntity('CBaseEntity', ref).ownerEntity : null;
export const velocityOf = (ref: EntityRef | null | undefined): Vector | null =>
  valid(ref) ? wrapEntity('CBaseEntity', ref).absVelocity : null;
export const healthOf = (ref: EntityRef | null | undefined): number => (valid(ref) ? wrapEntity('CBaseEntity', ref).health ?? 0 : 0);

/** Point the `target` keyvalue (a trigger_teleport destination) at another entity's name. */
export function setTarget(ref: EntityRef | null | undefined, target: string | null | undefined): void {
  if (valid(ref) && target) fire(ref, 'KeyValue', { value: `target ${target}` });
}

/** Pack an RGBA colour the way `Color` is stored in the schema (`m_clrRender`, `m_Color`). */
export const rgba = (r: number, g: number, b: number, a = 255): number =>
  ((r & 255) | ((g & 255) << 8) | ((b & 255) << 16) | ((a & 255) << 24)) >>> 0;
export const Colors = {
  White: rgba(255, 255, 255), Red: rgba(255, 0, 0), Green: rgba(0, 128, 0), Blue: rgba(0, 0, 255),
} as const;

export function setRender(ref: EntityRef | null | undefined, color: number): void {
  if (valid(ref)) wrapEntity('CBaseModelEntity', ref).render = color;
}

/** The player pawn behind an activator, when it is one. */
export function pawnOf(ref: EntityRef | null | undefined): Pawn | null {
  if (!valid(ref)) return null;
  for (const player of Player.all()) {
    const pawn = player.pawn;
    if (pawn && same(pawn.ref, ref)) return pawn;
  }
  return null;
}

export const slotOf = (pawn: Pawn | null | undefined): number | null => pawn?.controller?.slot ?? null;
export const pawnAlive = (pawn: Pawn | null | undefined): pawn is Pawn => !!pawn && pawn.isValid && pawn.lifeState === 0;
export const pawnValid = (pawn: Pawn | null | undefined): pawn is Pawn => !!pawn && pawn.isValid;

/** Every connected player that has a pawn (CounterStrikeSharp `Utilities.GetPlayers()`). */
export function players(): { player: Player; pawn: Pawn }[] {
  const out: { player: Player; pawn: Pawn }[] = [];
  for (const player of Player.all()) {
    const pawn = player.pawn;
    if (pawn?.isValid) out.push({ player, pawn });
  }
  return out;
}

/** Upstream `TextDisplayHelper.SetMessage`: centre HTML shown while the player is alive. */
export function setMessage(slot: number | null | undefined, html: string, seconds: number): void {
  if (slot == null || slot < 0) return;
  if (!pawnAlive(Player.fromSlot(slot)?.pawn)) return;
  CenterHtml.to(slot, html, seconds);
}

/**
 * Upstream sprite spawning: a func_breakable taken out of staging, spawned with keyvalues, then given
 * its model. Origin and colour are also written after spawn so the result does not depend on how the
 * keyvalue parser treats vector strings.
 */
export function spawnSprite(targetname: string, model: string, origin: Vec, angles: Vec, color: number): EntityRef | null {
  const sprite = createEntity('func_breakable');
  if (!sprite) return null;
  const kv: EntityKeyValueMap = {
    targetname,
    origin: `${num(origin.x)} ${num(origin.y)} ${num(origin.z)}`,
    angles: `${num(angles.x)} ${num(angles.y)} ${num(angles.z)}`,
    health: 0,
    rendercolor: `${color & 255} ${(color >>> 8) & 255} ${(color >>> 16) & 255}`,
  };
  sprite.clearIdentityFlags(1 << 2);
  if (!sprite.spawn(kv)) return null;
  sprite.setModel(model);
  teleport(sprite, origin, angles);
  setRender(sprite, color);
  return sprite;
}

export const newVector = (v: Vec): Vector => new Vector(v.x, v.y, v.z);
