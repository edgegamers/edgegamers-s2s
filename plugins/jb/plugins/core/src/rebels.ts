import {logEntry} from '@edgegamers/jailbreak-shared';
/**
 * Rebels (Jailbreak.Rebel RebelManager + RebelListener). A prisoner who hurts a guard is a rebel
 * for `rebel_time` seconds: their model fades from red back to white and their screen pulses red
 * every second. Death, disconnect and the next round clear it.
 */
import { config, HookResult } from "@s2script/sdk";
import { Fade, Player } from "@s2script/cs2";
import type { GameEvents } from "@s2script/cs2";
import { Clients } from "@s2script/sdk";
import { isAlive, nowSeconds, packColor32, setPawnColor, Team } from "@edgegamers/jailbreak-shared";
import { RebelBook, rebelColor, rebelPercent, rebelScreenAlpha } from "./rebel-book";
import { bus, refOf } from "./bus";
import { describe, log } from "./logs";
import { msgFor } from "./messages";
import type { PlayerRef } from "../api";

const book = new RebelBook();
let enabled = true;

const rebelTime = (): number => Math.max(0, config.getInt("rebel_time"));

function liveEntry(slot: number): Player | null {
  const e = book.get(slot);
  if (!e) return null;
  const p = Player.fromSlot(slot);
  if (!p || p.userId !== e.userId) return null;
  return p;
}

export function isRebel(slot: number): boolean {
  return getRebelSeconds(slot) > 0;
}

export function getRebelSeconds(slot: number): number {
  const p = liveEntry(slot);
  if (!p) return 0;
  return book.secondsLeft(slot, nowSeconds(), p.userId);
}

export function getRebels(): number[] {
  return book.slots().filter((s) => isRebel(s));
}

/** RebelManager.applyRebelColor: tint the model and pulse the screen red. */
function applyColor(p: Player): void {
  const pawn = p.pawn;
  if (!pawn || !pawn.isValid) return;
  const percent = rebelPercent(book.secondsLeft(p.slot, nowSeconds(), p.userId), rebelTime());
  // SetColor keeps the pawn's current alpha (other plugins may have made it translucent).
  const alpha = ((pawn.render ?? 0xffffffff) >>> 24) & 0xff;
  setPawnColor(pawn, rebelColor(percent), alpha === 0 ? 255 : alpha);
  if (Clients.fromSlot(p.slot)?.isBot) return;
  Fade.to(p.slot, {
    duration: Math.round(1.5 * 512),
    holdTime: Math.round(1 * 512),
    flags: 0x0002 | 0x0010, // FADE_OUT | purge
    color: packColor32({ r: 255, g: 0, b: 0 }, rebelScreenAlpha(percent)),
  });
}

/** core.markRebel. */
export function markRebel(slot: number, seconds: number, reason: string): boolean {
  const p = Player.fromSlot(slot);
  if (!p || p.teamNum !== Team.Prisoner || !isAlive(p)) return false;
  if (!enabled) return isRebel(slot);
  // No mode check (C# RebelListener had none): special days call disableRebelsForRound(), and
  // @edgegamers/jailbreak-lastrequest vetoes "damage" marks for LR participants through OnRebelRequested.

  const duration = seconds > 0 ? Math.floor(seconds) : rebelTime();
  const h = bus();
  if (h) {
    const verdict = h.dispatch("OnRebelRequested", { player: refOf(p), seconds: duration, reason });
    if (verdict >= HookResult.Handled) return isRebel(slot);
  }

  const isNew = book.mark(slot, p.userId, nowSeconds() + duration);
  if (isNew) {
    log(...logEntry("JB_LOG_IS_NOW_A_REBEL", [String(describe(slot))]));
    h?.emit("OnRebelChanged", { player: refOf(p), rebel: true, reason });
  }
  applyColor(p);
  return true;
}

function clear(slot: number, reason: string, notify: boolean): boolean {
  const e = book.get(slot);
  if (!e) return false;
  const p = Player.fromSlot(slot);
  const same = p !== null && p.userId === e.userId;
  if (notify && same) log(...logEntry("JB_LOG_IS_NO_LONGER_A_REBEL", [String(describe(slot))]));
  book.unmark(slot);
  if (same && p) {
    if (notify) Clients.fromSlot(slot)?.chat(msgFor(slot).noLongerRebel());
    if (notify) applyColor(p);
    bus()?.emit("OnRebelChanged", { player: refOf(p), rebel: false, reason });
  }
  return true;
}

/** core.unmarkRebel (also used for expiry). */
export function unmarkRebel(slot: number, reason: string): boolean {
  return clear(slot, reason, true);
}

export function disableRebelsForRound(): void {
  enabled = false;
}

/** Round start: everyone is pardoned and rebels are allowed again. */
export function resetRebels(): void {
  enabled = true;
  for (const slot of book.slots()) {
    const p = liveEntry(slot);
    book.unmark(slot);
    if (!p) continue;
    const pawn = p.pawn;
    if (pawn && pawn.isValid) setPawnColor(pawn, { r: 255, g: 255, b: 255 });
    bus()?.emit("OnRebelChanged", { player: refOf(p), rebel: false, reason: "round" });
  }
}

/** Every second: expire rebels, refresh the colour fade of the rest. */
export function tickRebels(): void {
  const now = nowSeconds();
  for (const slot of book.slots()) {
    const p = liveEntry(slot);
    if (!p) {
      book.unmark(slot);
      continue;
    }
    if (book.secondsLeft(slot, now, p.userId) <= 0) unmarkRebel(slot, "expired");
    else applyColor(p);
  }
}

// ---- Listeners ------------------------------------------------------------------------------

/** RebelListener.OnPlayerHurt: a prisoner hurting a guard becomes a rebel. */
export function onPlayerHurt(ev: GameEvents["player_hurt"]): void {
  const victim = Player.fromSlot(ev.getPlayerSlot("userid"));
  if (!victim || victim.teamNum !== Team.Guard) return;
  const attacker = Player.fromSlot(ev.getPlayerSlot("attacker"));
  if (!attacker || attacker.teamNum !== Team.Prisoner) return;
  markRebel(attacker.slot, 0, "damage");
}

export function onPlayerDeath(ev: GameEvents["player_death"]): void {
  const slot = ev.getPlayerSlot("userid");
  if (slot >= 0) clear(slot, "death", false);
}

/** OnClientDisconnect: the client handle is already invalid, so emit from its identity snapshot. */
export function onDisconnect(who: PlayerRef): void {
  const e = book.get(who.slot);
  if (!e || e.userId !== who.userId) return;
  book.unmark(who.slot);
  bus()?.emit("OnRebelChanged", { player: who, rebel: false, reason: "disconnect" });
}
