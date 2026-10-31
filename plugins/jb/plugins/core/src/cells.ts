import {logEntry} from '@edgegamers/jailbreak-shared';
import {forRecipients} from '@edgegamers/jailbreak-shared';
import {broadcastText} from '@edgegamers/jailbreak-shared';
/**
 * Cell doors (MapUtil.OpenCells + the warden's auto-open timer). The opener is a func_button:
 * a zone tagged `cell_button` (from the optional @s2script/zones plugin) marks it exactly;
 * otherwise the name heuristic picks the best-named button nearest the CT spawn.
 */
import { Chat, Entity, config } from "@s2script/sdk";
import type { EntityRef, Timer } from "@s2script/sdk";
import { after } from "@s2script/sdk";
import { Player } from "@s2script/cs2";
import { Team, alivePlayers } from "@edgegamers/jailbreak-shared";
import type { Zone, Zones } from "@s2script/zones";
import {
  boxCenter,
  insideBox,
  isConfidentLevel,
  nearSpawnHull,
  pickCellButton,
  Sensitivity,
  SENSITIVITY_NAMES,
} from "./cell-logic";
import type { ButtonCandidate, Point, SensitivityLevel } from "./cell-logic";
import { bus } from "./bus";
import { currentRound, isWarmup } from "./round";
import { log } from "./logs";
import { msgFor } from "./messages";

let opened = false;
let autoTimer: Timer | null = null;
let zones: Zones | null = null;

export function setZones(z: Zones | null): void {
  zones = z;
}

export const cellsOpened = (): boolean => opened;

const toPoint = (v: { x: number; y: number; z: number }): Point => ({ x: v.x, y: v.y, z: v.z });

/** Zones carrying `tag` or named `<tag>…`; [] without the zones plugin. */
export function zonesTagged(tag: string): Zone[] {
  if (!zones) return [];
  try {
    const byTag = zones.getZonesByTag(tag);
    const byName = zones.getZones().filter((z) => z.name.toLowerCase().startsWith(tag) && !byTag.some((t) => t.name === z.name));
    return [...byTag, ...byName];
  } catch {
    return []; // provider went away between attach and call
  }
}

function ctSpawn(): Point | null {
  for (const s of Entity.findByClass("info_player_counterterrorist")) {
    const o = s.origin;
    if (o) return toPoint(o);
  }
  return null;
}

function tSpawns(): Point[] {
  const out: Point[] = [];
  for (const s of Entity.findByClass("info_player_terrorist")) {
    const o = s.origin;
    if (o) out.push(toPoint(o));
  }
  return out;
}

/** Press the chosen button: Unlock then Press, with a guard as the activator (MapUtil.PressButton). */
function press(ref: EntityRef): boolean {
  const guard = alivePlayers(Team.Guard)[0]?.ref;
  ref.acceptInput("Unlock", undefined, guard);
  return ref.acceptInput("Press", undefined, guard);
}

/**
 * Find and press a cell button. Returns the level it matched at, or null if no button exists.
 * `source` = where "nearest" is measured from.
 */
export function pressNearest(source: Point | null, start: SensitivityLevel): SensitivityLevel | null {
  const refs = new Map<number, EntityRef>();
  const candidates: ButtonCandidate[] = [];
  for (const b of Entity.findByClass("func_button")) {
    if (!b.isValid()) continue;
    refs.set(b.index, b);
    const o = b.origin;
    candidates.push({ id: b.index, name: b.name ?? "", target: b.target ?? "", origin: o ? toPoint(o) : null });
  }
  const pick = pickCellButton(candidates, source, start);
  if (!pick) return null;
  const ref = refs.get(pick.button.id);
  if (!ref || !press(ref)) return null;
  log(...logEntry("JB_LOG_CELL_BUTTON_PRESSED", [String(pick.button.name || "Unlabeled"), String(pick.button.target || "None"), String(SENSITIVITY_NAMES[pick.level])], [2]));
  return pick.level;
}

/** MapUtil.OpenCells(zoneManager): zone-tagged button first, else the confident heuristic. */
function tryOpen(): boolean {
  const buttonZone = zonesTagged("cell_button")[0];
  if (buttonZone) return pressNearest(boxCenter(buttonZone.min, buttonZone.max), Sensitivity.Any) !== null;
  const level = pressNearest(ctSpawn(), Sensitivity.NameCellDoor);
  return level !== null && isConfidentLevel(level);
}

/** core.openCells. */
export function openCells(source: string): boolean {
  const ok = tryOpen();
  log(...(ok ? logEntry("JB_LOG_CELLS_OPENED", [String(source)], [0]) : logEntry("JB_LOG_FAILED_TO_OPEN_THE_CELLS", [String(source)], [0])));
  if (!ok) return false;
  opened = true;
  bus()?.emit("OnCellsOpened", { round: currentRound(), source });
  return true;
}

/** Prisoners still in the cells: inside a `cell` zone, or near the T spawns without one. */
export function prisonersInCells(): Player[] {
  const cellZones = zonesTagged("cell");
  const spawns = cellZones.length === 0 ? tSpawns() : [];
  return alivePlayers(Team.Prisoner).filter((p) => {
    const o = p.pawn?.origin;
    if (!o) return false;
    const pt = toPoint(o);
    if (cellZones.length > 0) return cellZones.some((z) => insideBox(pt, z.min, z.max));
    return nearSpawnHull(pt, spawns);
  });
}

function autoOpen(): void {
  autoTimer = null;
  const inCells = prisonersInCells().length;
  const snitch = config.getBool("opencells_snitch");
  if (opened) {
    if (snitch && inCells > 0) broadcastText(forRecipients((recipient,value0) => msgFor(recipient).cellsSnitchPrisoners(value0), inCells));
    return;
  }
  // Open regardless of whether anyone is detected inside (for convenience) ...
  openCells("auto");
  // ... but only announce it if prisoners were still in there.
  if (inCells === 0) return;
  broadcastText(forRecipients((recipient,value0) => snitch ? msgFor(recipient).cellsOpenedWithPrisoners(value0) : msgFor(recipient).cellsAutoOpened(), inCells));
}

/** Round start: cells closed again; arm the auto-open timer outside warmup. */
export function resetCells(): void {
  opened = false;
  autoTimer?.kill();
  autoTimer = null;
  const delay = config.getInt("opencells_delay");
  if (delay < 0 || isWarmup()) return;
  autoTimer = after(delay * 1000, autoOpen);
}

export function stopAutoOpen(): void {
  autoTimer?.kill();
  autoTimer = null;
}

/** Debug `testnearopen`: press whatever button is nearest to `pos`. */
export function openNearest(pos: Point): boolean {
  return pressNearest(pos, Sensitivity.Any) !== null;
}

export { toPoint };
