import { Admin, after, Clients } from "@s2script/sdk";
import type { Timer, TypedPublishHandle } from "@s2script/sdk";
import { GameRules, HintText, Player } from "@s2script/cs2";
import { getRound } from "@edgegamers/jailbreak-core";
import type { Contract, PlayerRef } from "../api";
import { flagsFromLetters } from "./rules";

/**
 * Small runtime helpers shared by the warden modules: the publish handle (for forwards), player
 * references, admin checks, round timing, sounds and centre text.
 */

let publisher: TypedPublishHandle<Contract> | null = null;

export function setPublisher(h: TypedPublishHandle<Contract>): void {
  publisher = h;
}

/** The `@edgegamers/jailbreak-warden` publish handle (null only before OnPluginStart ran). */
export function pub(): TypedPublishHandle<Contract> | null {
  return publisher;
}

/** A copied wire reference to whoever is in `slot` now, or null. */
export function playerRef(slot: number): PlayerRef | null {
  const p = Player.fromSlot(slot);
  if (!p) return null;
  return { slot, userId: p.userId, steamId: p.steamId, name: p.playerName ?? "" };
}

/** True if the player in `slot` holds every bit of `mask` (0 = no flag required). Console (-1) passes. */
export function hasFlags(slot: number, mask: number): boolean {
  if (slot < 0 || mask === 0) return true;
  return Admin.forSlot(slot)?.hasFlags(mask) ?? false;
}

/** Same, with SourceMod flag letters from config (e.g. "o"). */
export function hasFlagLetters(slot: number, letters: string): boolean {
  return hasFlags(slot, flagsFromLetters(letters));
}

export function isWarmup(): boolean {
  return getRound().phase === "warmup" || GameRules.get()?.warmupPeriod === true;
}

/** Seconds since freeze time ended (C# RoundUtil.GetTimeElapsed); 0 if unknown. */
export function roundElapsed(): number {
  const gr = GameRules.get();
  if (!gr) return 0;
  const elapsed = gr.timeElapsed;
  if (elapsed === null) return 0;
  return Math.floor(elapsed - (gr.freezeTime ?? 0));
}

const roundTimers = new Set<Timer>();

/** A timer that is killed at the next round start or round end (C# `coroutines.Round`). */
export function roundAfter(ms: number, fn: () => void): Timer {
  const t = after(ms, () => {
    roundTimers.delete(t);
    fn();
  });
  roundTimers.add(t);
  return t;
}

export function killRoundTimers(): void {
  for (const t of roundTimers) t.kill();
  roundTimers.clear();
}

/** `play sounds/<path>` on every real client (a workshop-shipped .vsnd; bots are skipped). */
export function playToAll(path: string): void {
  if (path === "") return;
  for (const c of Clients.all()) {
    if (!c.isBot) c.command(`play sounds/${path}`);
  }
}

/** Centre/hint text to everyone (C# `.ToAllCenter()`). */
export function centerAll(text: string | ((slot: number) => string)): void {
  for (const p of Player.all()) HintText.to(p.slot, typeof text === "string" ? text : text(p.slot));
}

export function centerTo(slot: number, text: string): void {
  HintText.to(slot, text);
}
