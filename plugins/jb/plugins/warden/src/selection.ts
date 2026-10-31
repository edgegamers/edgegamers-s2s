import {logEntry} from '@edgegamers/jailbreak-shared';
import {broadcastText} from '@edgegamers/jailbreak-shared';
import { Chat, Clients, Cookies } from "@s2script/sdk";
import type { Cookie } from "@s2script/sdk";
import { Player } from "@s2script/cs2";
import { Team, isAlive, isSteamId64 } from "@edgegamers/jailbreak-shared";
import { log } from "@edgegamers/jailbreak-core";
import { cfg } from "./config";
import { hasFlagLetters, roundAfter } from "./env";
import { msgFor } from "./messages";
import { runRaffle, type Favor } from "./queue";
import { cooldownKey, hasWarden, setWarden } from "./warden";

/**
 * Choosing the warden (WardenSelectionBehavior + AutoWarden): for a few seconds after round start
 * guards can `!warden` into a raffle weighted by how many rounds they've gone without being picked;
 * afterwards it's first come, first served. Auto-warden subscribers are entered for them, and a
 * "guaranteed warden" (the RTD reward) wins outright.
 */

let queueActive = false;
/** userIds in this round's raffle. */
const queued = new Set<number>();
/** Raffle weighting, per player (SteamID / "u<userId>") for the session. */
const favors = new Map<string, Favor>();
/** SteamIDs that win the next raffle they join (until used or the map changes). */
const guaranteed = new Set<string>();

let autoCookie: Cookie | null = null;

export function initSelection(): void {
  autoCookie = Cookies.register("jb_warden_auto", {
    description: "Automatically join the warden raffle (Y/N)",
    default: "N",
  });
}

export const isQueueActive = (): boolean => queueActive;

export function isInQueue(slot: number): boolean {
  const p = Player.fromSlot(slot);
  return p !== null && queued.has(p.userId);
}

function canEnterQueue(slot: number): boolean {
  const p = Player.fromSlot(slot);
  if (!p || p.teamNum !== Team.Guard || !isAlive(p)) return false;
  return queueActive && !hasWarden();
}

/** Use up a guaranteed-warden reward if `slot` holds one and becomes warden now. */
export function tryGuaranteed(slot: number): boolean {
  const steamId = Player.fromSlot(slot)?.steamId ?? "0";
  if (!guaranteed.has(steamId)) return false;
  if (!setWarden(slot)) return false;
  guaranteed.delete(steamId);
  log(...logEntry("JB_LOG_GUARANTEED_WARDEN_USED_BY", [String(steamId)]));
  return true;
}

export function tryEnterQueue(slot: number): boolean {
  if (!canEnterQueue(slot)) return false;
  if (tryGuaranteed(slot)) return true;
  const p = Player.fromSlot(slot);
  if (!p) return false;
  queued.add(p.userId);
  return true;
}

export function tryExitQueue(slot: number): boolean {
  if (!canEnterQueue(slot)) return false;
  const p = Player.fromSlot(slot);
  if (p) queued.delete(p.userId);
  return true;
}

export function guaranteeWarden(steamId: string): boolean {
  if (!isSteamId64(steamId)) return false;
  guaranteed.add(steamId);
  return true;
}

function chooseWarden(): void {
  queueActive = false;
  if (hasWarden()) return;
  const eligible = Player.all().filter((p) => p.teamNum === Team.Guard && isAlive(p) && queued.has(p.userId));
  if (eligible.length === 0) {
    broadcastText(recipient => msgFor(recipient).noWardens);
    return;
  }
  const keyToSlot = new Map<string, number>();
  for (const p of eligible) keyToSlot.set(cooldownKey(p.slot), p.slot);
  const winner = runRaffle([...keyToSlot.keys()], favors, Math.random);
  if (winner !== null) setWarden(keyToSlot.get(winner) ?? -1);
}

function runAutoWarden(): void {
  if (!autoCookie || !queueActive) return;
  for (const p of Player.all()) {
    if (p.teamNum !== Team.Guard || !isAlive(p) || p.steamId === "0") continue;
    if (!hasFlagLetters(p.slot, cfg.autoWardenFlag)) continue;
    if (p.pawn?.hasMovedSinceSpawn !== true) continue; // AFK guards don't get auto-entered
    const c = Clients.fromSlot(p.slot);
    if (!c || Cookies.get(c, autoCookie) !== "Y") continue;
    if (isInQueue(p.slot)) continue;
    if (tryEnterQueue(p.slot)) Chat.toSlot(p.slot, msgFor(p.slot).joinRaffle);
  }
}

/** `!aw` / `!autowarden`: toggle the auto-warden preference. Returns the message to show. */
export function toggleAutoWarden(slot: number): string {
  const c = Clients.fromSlot(slot);
  if (!autoCookie || !c || c.isBot) return msgFor(slot).togglingNotEnabled;
  const enable = Cookies.get(c, autoCookie) !== "Y";
  if (!Cookies.set(c, autoCookie, enable ? "Y" : "N")) return msgFor(slot).markerSaveFailed;
  return msgFor(slot).autoWardenToggled(enable);
}

/** Round start (non-warmup): open the raffle, pick in a few seconds. */
export function selectionRoundStart(warmup: boolean): void {
  queued.clear();
  queueActive = false;
  if (warmup) return;
  queueActive = true;
  broadcastText(recipient => msgFor(recipient).pickingShortly);
  roundAfter(cfg.queueSeconds * 1000, chooseWarden);
  roundAfter(cfg.autoWardenDelay * 1000, runAutoWarden);
}

export function selectionRoundEnd(): void {
  queueActive = false;
}

export function selectionOnDisconnect(userId: number): void {
  queued.delete(userId);
}

export function selectionMapStart(): void {
  guaranteed.clear();
  queued.clear();
  queueActive = false;
}
