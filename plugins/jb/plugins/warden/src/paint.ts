import { TraceMask, Vector } from "@s2script/sdk";
import type { BeamHandle } from "@s2script/cs2";
import { Player } from "@s2script/cs2";
import { Colors, resolveColor } from "@edgegamers/jailbreak-shared";
import { cfg } from "./config";
import { playerRef, pub } from "./env";
import { drawLine } from "./draw";
import { getWarden } from "./warden";

/**
 * Warden paint (WardenPaintBehavior): while the warden holds +use (E) a trail is laid where they
 * aim. Pausing for more than ~2 s (128 ticks) starts a new stroke.
 *
 * The C# fed an info_target into a CS2Draw trail; here each stroke is a chain of short env_beams
 * that expire after `warden_paint_lifetime` seconds (and the oldest go first past
 * `warden_paint_max_segments`). The colour comes from the `OnPaintColor` Transform ("#rrggbb",
 * "rainbow" or "" = white), resolved per stroke; "rainbow" is re-sampled per segment.
 */

const IN_USE = 32;
const SPLIT_TIMEOUT_MS = 2000;
const MIN_SEGMENT = 6;

interface Segment {
  beam: BeamHandle;
  expiresAt: number;
}

const segments: Segment[] = [];
let holding = false;
let lastActiveMs = 0;
let lastPoint: Vector | null = null;
let strokeColor = "";

function paintColorFor(slot: number): string {
  const player = playerRef(slot);
  const h = pub();
  if (!player || !h) return "";
  const res = h.dispatch("OnPaintColor", { player, color: "" });
  return typeof res.payload.color === "string" ? res.payload.color : "";
}

function stopStroke(): void {
  holding = false;
  lastPoint = null;
}

function sweep(now: number): void {
  while (segments.length > 0 && (segments[0].expiresAt <= now || segments.length > cfg.paintMaxSegments)) {
    segments.shift()?.beam.remove();
  }
}

/** Called every game frame. */
export function paintFrame(): void {
  const now = Date.now();
  sweep(now);

  const slot = getWarden();
  const pawn = slot >= 0 ? Player.fromSlot(slot)?.pawn : null;
  if (!pawn || !pawn.isValid || (pawn.buttons & IN_USE) === 0) {
    stopStroke();
    return;
  }

  const hit = pawn.aimTrace({ mask: TraceMask.WorldOnly });
  if (!hit || !hit.didHit) return;
  const pos = new Vector(hit.endPos.x, hit.endPos.y, hit.endPos.z + 5);

  const paused = lastActiveMs > 0 && now - lastActiveMs > SPLIT_TIMEOUT_MS;
  if (!holding || paused || lastPoint === null) {
    // New stroke.
    strokeColor = paintColorFor(slot);
    lastPoint = pos;
  } else {
    const d = Math.hypot(pos.x - lastPoint.x, pos.y - lastPoint.y, pos.z - lastPoint.z);
    if (d >= MIN_SEGMENT) {
      const color = resolveColor(strokeColor, Colors.White, now);
      const beam = drawLine(lastPoint, pos, { color, width: 1.5 });
      if (beam) segments.push({ beam, expiresAt: now + cfg.paintLifetime * 1000 });
      lastPoint = pos;
    }
  }
  holding = true;
  lastActiveMs = now;
}

export function clearPaint(): void {
  stopStroke();
  for (const s of segments) s.beam.remove();
  segments.length = 0;
}
