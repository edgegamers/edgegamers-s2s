import { createEntity, Vector } from "@s2script/sdk";
import type { EntityRef } from "@s2script/sdk";
import type { BeamHandle } from "@s2script/cs2";
import { Beam, Player } from "@s2script/cs2";
import type { Rgb } from "@edgegamers/jailbreak-shared";
import type { Point2 } from "./shapes";

/**
 * Drawing helpers (the parts of Jailbreak.Draw / Mod.Draw the warden needs): beam lines, closed
 * beam loops (marker shapes) and the point_worldtext "hat" floating above a player's head.
 * Every created entity is game-world-owned, so callers keep the returned handles and remove them.
 */

export interface DrawOpts {
  color: Rgb;
  alpha?: number;
  width?: number;
}

/** One beam from `a` to `b` (C# BeamLine). */
export function drawLine(a: Vector, b: Vector, o: DrawOpts): BeamHandle | null {
  return Beam.draw(a, b, { color: [o.color.r, o.color.g, o.color.b, o.alpha ?? 255], width: o.width ?? 1 });
}

/** A closed loop of beams through `points` (x/y offsets) at height `center.z` (C# BeamedShape). */
export function drawLoop(center: Vector, points: readonly Point2[], o: DrawOpts): BeamHandle[] {
  const out: BeamHandle[] = [];
  for (let i = 0; i < points.length; i++) {
    const [ax, ay] = points[i];
    const [bx, by] = points[(i + 1) % points.length];
    const beam = drawLine(
      new Vector(center.x + ax, center.y + ay, center.z),
      new Vector(center.x + bx, center.y + by, center.z),
      o,
    );
    if (beam) out.push(beam);
  }
  return out;
}

export function removeBeams(beams: BeamHandle[]): void {
  for (const b of beams) b.remove();
  beams.length = 0;
}

/** Keyvalue-configured point_worldtext (C# TextSpawner.CreateText + TextSetting defaults). */
export function createText(
  message: string,
  color: Rgb,
  origin: Vector,
  angles: [number, number, number],
): EntityRef | null {
  const ent = createEntity("point_worldtext", {
    message,
    enabled: true,
    fullbright: true,
    font_size: 50,
    font_name: "Arial",
    world_units_per_pixel: 0.4,
    depth_render_offset: 0.0,
    justify_horizontal: 1, // centre
    justify_vertical: 1, // centre
    reorient_mode: 0, // none
    color: `${color.r} ${color.g} ${color.b} 255`,
  });
  if (!ent) return null;
  ent.teleport([origin.x, origin.y, origin.z], angles, null);
  return ent;
}

/**
 * The icon above a player's head: two crossed point_worldtext panels (so it reads from every side)
 * 72 units above the pawn origin, parented to the pawn so they follow it (C# CreateTextHat).
 */
export function createTextHat(slot: number, message: string, color: Rgb): EntityRef[] {
  const pawn = Player.fromSlot(slot)?.pawn;
  if (!pawn || !pawn.isValid) return [];
  const origin = pawn.origin;
  const rot = pawn.angles;
  if (!origin || !rot) return [];
  const out: EntityRef[] = [];
  for (const yRot of [270, 180]) {
    const angles: [number, number, number] = [rot.x, rot.y + yRot, rot.z + 90];
    const yaw = (angles[1] * Math.PI) / 180;
    // The panel's pivot is off to one side; pull it back 10 units along its forward to centre it.
    const pos = new Vector(origin.x - Math.cos(yaw) * 10, origin.y - Math.sin(yaw) * 10, origin.z + 72);
    const text = createText(message, color, pos, angles);
    if (!text) continue;
    text.acceptInput("SetParent", "!activator", pawn.ref, pawn.ref);
    out.push(text);
  }
  return out;
}

export function removeEntities(ents: EntityRef[]): void {
  for (const e of ents) if (e.isValid()) e.remove();
  ents.length = 0;
}
