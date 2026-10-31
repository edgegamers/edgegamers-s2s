import {plainPhraseFor as labelFor,phraseFor} from '@edgegamers/jailbreak-shared';
import { Chat, Clients, Cookies, HookResult, Menu, MenuStyle, Vector } from "@s2script/sdk";
import type { Cookie, HookResultValue } from "@s2script/sdk";
import type { BeamHandle } from "@s2script/cs2";
import { cfg } from "./config";
import { hasFlagLetters } from "./env";
import { drawLine, drawLoop, removeBeams } from "./draw";
import { msgFor } from "./messages";
import { inMarker, markerPing, type MarkerPlacement, type Point3 } from "./rules";
import {
  MARKER_COLORS,
  MARKER_SHAPES,
  parseMarkerColor,
  parseShape,
  shapeName,
  shapeOutline,
  type MarkerShape,
  type Rgb,
} from "./shapes";
import { getWarden, isWarden } from "./warden";

/**
 * The warden marker (WardenMarkerBehavior + WardenMarkerSettings + MarkerCommandBehavior). The
 * warden pings (middle mouse) to drop a ring; pinging again within the resize window stretches it
 * to that distance. `!count` counts prisoners inside it. Supporters can pick a shape and colour,
 * saved as client cookies.
 *
 * The C# drew each shape as a CS2Draw particle effect; here the outline is a loop of env_beams
 * (see shapes.ts / draw.ts) plus a short vertical beam above the centre.
 */

let placement: MarkerPlacement | null = null;
const beams: BeamHandle[] = [];
let typeCookie: Cookie | null = null;
let colorCookie: Cookie | null = null;

export function initMarkers(): void {
  typeCookie = Cookies.register("jb_marker_type", { description: "Warden marker shape", default: "Circle" });
  colorCookie = Cookies.register("jb_marker_color", { description: "Warden marker colour", default: "White" });
}

function settingsFor(slot: number): { shape: MarkerShape; color: Rgb } {
  const c = Clients.fromSlot(slot);
  if (!c || !typeCookie || !colorCookie) return { shape: "circle", color: { r: 255, g: 255, b: 255 } };
  return { shape: parseShape(Cookies.get(c, typeCookie)), color: parseMarkerColor(Cookies.get(c, colorCookie)).rgb };
}

function redraw(): void {
  removeBeams(beams);
  if (!placement) return;
  const { shape, color } = settingsFor(getWarden());
  const { center, radius } = placement;
  const c = new Vector(center.x, center.y, center.z);
  beams.push(...drawLoop(c, shapeOutline(shape, radius, cfg.markerSegments), { color, width: 1.5 }));
  const pillar = drawLine(
    new Vector(center.x, center.y, center.z + 105),
    new Vector(center.x, center.y, center.z + 130),
    { color, width: 1.5 },
  );
  if (pillar) beams.push(pillar);
}

/** The warden pinged at (x, y, z) — `player_ping`. */
export function markerOnPing(slot: number, x: number, y: number, z: number): void {
  if (!isWarden(slot)) return;
  const res = markerPing(placement, { x, y, z: z + 4 }, Date.now(), {
    minRadius: cfg.markerMinRadius,
    maxRadius: cfg.markerMaxRadius,
    resizeMs: cfg.markerResizeMs,
  });
  if (res.action === "ignore") return;
  placement = res.marker;
  redraw();
  if (res.action === "place") Chat.toSlot(slot, msgFor(slot).markerPlaced);
}

/** Only the warden may ping (C# player_ping command listener). */
export function filterPing(slot: number): HookResultValue {
  return isWarden(slot) ? HookResult.Continue : HookResult.Handled;
}

export function getMarker(): MarkerPlacement | null {
  return placement;
}

export function isInMarker(pos: Point3): boolean {
  return placement !== null && inMarker(placement.center, placement.radius, pos);
}

export function clearMarker(): void {
  placement = null;
  removeBeams(beams);
}

// ── customisation menus (!markertype / !markercolor) ───────────────────────

/** Returns an error message, or null when the menu was opened. */
export function openMarkerTypeMenu(slot: number): string | null {
  if (!hasFlagLetters(slot, cfg.markerFlag)) return msgFor(slot).noPermission(cfg.markerFlag);
  const menu = new Menu(labelFor(slot,"JB_WARDEN_LABEL_MARKER_TYPE"));
  menu.style = MenuStyle.Center;
  for (const s of MARKER_SHAPES) menu.addItem(s.key,labelFor(slot,s.name));
  menu.onSelect((e) => {
    const c = Clients.fromSlot(e.slot);
    if (!c || !typeCookie) return;
    const name = shapeName(parseShape(e.info));
    if (!Cookies.set(c, typeCookie, name)) {
      Chat.toSlot(e.slot, msgFor(e.slot).markerSaveFailed);
      return;
    }
    Chat.toSlot(e.slot, msgFor(e.slot).markerTypeChanged(name));
    if (isWarden(e.slot)) redraw();
  });
  menu.display(slot, 30);
  return null;
}

export function openMarkerColorMenu(slot: number): string | null {
  if (!hasFlagLetters(slot, cfg.markerFlag)) return msgFor(slot).noPermission(cfg.markerFlag);
  const menu = new Menu(labelFor(slot,"JB_WARDEN_LABEL_MARKER_COLOR"));
  menu.style = MenuStyle.Center;
  for (const c of MARKER_COLORS) menu.addItem(c.name,labelFor(slot,c.name));
  menu.onSelect((e) => {
    const c = Clients.fromSlot(e.slot);
    if (!c || !colorCookie) return;
    if (!Cookies.set(c, colorCookie, e.info)) {
      Chat.toSlot(e.slot, msgFor(e.slot).markerSaveFailed);
      return;
    }
    Chat.toSlot(e.slot, msgFor(e.slot).markerColorChanged(e.info));
    if (isWarden(e.slot)) redraw();
  });
  menu.display(slot, 30);
  return null;
}
