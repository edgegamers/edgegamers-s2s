/**
 * Jailbreak gang stats and credit rewards, fed from the Jailbreak forwards and game events.
 *
 * Stats (Gangs player stats, JSON under the C# STAT_IDs): LR stats (`jb_lr_stat`), last-guard
 * stats (`jb_lg_stat`), warden stats (`jb_warden_stat`). Credits: the C# `eco.Grant` calls that
 * lived inside the Jailbreak modules (LR reached/won, guard/warden kill, last-guard kill, rebel
 * kill) — after the split, gangperks is the only plugin that may talk to Gangs.
 */
import { Chat } from "@s2script/sdk";
import { Player } from "@s2script/cs2";
import type { GameEvents } from "@s2script/cs2";
import { Team, isAlive, isSteamId64 } from "@edgegamers/jailbreak-shared";
import type { LREndEvent, LREnabledEvent, LRStartEvent, LastGuardEvent } from "@edgegamers/jailbreak-lastrequest";
import type { WardenEvent, WardenRemovedEvent } from "@edgegamers/jailbreak-warden";
import type { BombDetonatedEvent, RebelEvent } from "@edgegamers/jailbreak-core";
import type { StatRecordDef } from "./records.ts";
import { Credits, LG_STAT, LR_STAT, WARDEN_STAT, bumpRecord, rebelKillDefault, rebelWeaponScore } from "./records.ts";
import { msgFor } from "./messages.ts";
import { deps, guard, readyGangs } from "./state.ts";

/** How long after a "death" removal/clear we still treat the dead player as warden/rebel. */
const DEATH_WINDOW_MS = 1000;

let minPlayersForCredits = 5;
let lastGuardActive = false;
/** When OnLastGuardEnd arrived (0 = not this round). */
let lastGuardEndedAt = 0;
let wardenSteam: string | null = null;
let wardenDied: { steamId: string; at: number } | null = null;
const rebels = new Set<number>();
const rebelDied = new Map<number, number>();
/** Best weapon score per rebel (userId) — RebelListener.weaponScores. */
const rebelScores = new Map<number, number>();

export function setMinPlayersForCredits(n: number): void {
  minPlayersForCredits = Math.max(0, n);
}

/** LastRequestManager.shouldGrantCredits. */
function creditsAllowed(): boolean {
  return Player.all().length >= minPlayersForCredits;
}

function bump<F extends string>(def: StatRecordDef<F>, steamId: string, field: F): void {
  const gangs = readyGangs();
  if (!gangs || !isSteamId64(steamId)) return;
  gangs.setPlayerStat(steamId, def.statId, bumpRecord(def, gangs.getPlayerStat(steamId, def.statId), field));
}

function grant(p: Player, amount: number, reason: string): void {
  const gangs = readyGangs();
  if (!gangs || !isSteamId64(p.steamId) || amount <= 0) return;
  if (gangs.grantPlayer(p.steamId, amount, reason) >= 0) Chat.toSlot(p.slot, msgFor(p.slot).creditsEarned(amount, reason));
}

const humans = (): Player[] => Player.all().filter((p) => isSteamId64(p.steamId));

// ── @edgegamers/jailbreak-lastrequest ─────────────────────────────────────────────────────────────────────────────

/** LastRequestManager.EnableLR: count the LR for every living player; reward survivors. */
export function onLREnabled(_ev: LREnabledEvent): void {
  guard("LR enabled stats", undefined, () => {
    const pay = creditsAllowed();
    for (const p of humans()) {
      if (!isAlive(p)) continue;
      const prisoner = p.teamNum === Team.Prisoner;
      bump(LR_STAT, p.steamId, prisoner ? "TLrs" : "CtLrs");
      if (!pay) continue;
      grant(p, Credits.lrReached(prisoner), "LR Reached");
      bump(LR_STAT, p.steamId, prisoner ? "LRsReachedAsT" : "LRsReachedAsCt");
    }
  });
}

/** LastRequestManager.completeLRInitiation → incrementLRStart for both players. */
export function onLRStart(ev: LRStartEvent): void {
  guard("LR start stats", undefined, () => {
    bump(LR_STAT, ev.lr.prisoner.steamId, "TLrs");
    bump(LR_STAT, ev.lr.guard.steamId, "CtLrs");
  });
}

/** LastRequestManager.EndLastRequest: the winner's LR win + credits. */
export function onLREnd(ev: LREndEvent): void {
  guard("LR end stats", undefined, () => {
    if (ev.result !== "prisoner_win" && ev.result !== "guard_win") return;
    const guardWon = ev.result === "guard_win";
    const winner = guardWon ? ev.lr.guard : ev.lr.prisoner;
    bump(LR_STAT, winner.steamId, guardWon ? "CTLrsWon" : "TLrsWon");
    if (!creditsAllowed()) return;
    const p = Player.fromUserId(winner.userId);
    if (p) grant(p, Credits.lrWin(guardWon), "LR Win");
  });
}

/** LastGuard.StartLastGuard: count the last guard for every living player. */
export function onLastGuardStart(_ev: LastGuardEvent): void {
  lastGuardActive = true;
  lastGuardEndedAt = 0;
  guard("last guard stats", undefined, () => {
    for (const p of humans()) {
      if (!isAlive(p)) continue;
      bump(LG_STAT, p.steamId, p.teamNum === Team.Guard ? "CtLgs" : "TLgs");
    }
  });
}

export function onLastGuardEnd(): void {
  if (lastGuardActive) lastGuardEndedAt = Date.now();
  lastGuardActive = false;
}

/**
 * Last guard is running — or just ended: @edgegamers/jailbreak-lastrequest emits OnLastGuardEnd from its own
 * player_death handler when the last guard dies, which may run before ours, and that death is
 * exactly the "LG Kill" the C# paid for (it only cleared the flag at round end).
 */
function lastGuardRunning(): boolean {
  return lastGuardActive || (lastGuardEndedAt !== 0 && Date.now() - lastGuardEndedAt < DEATH_WINDOW_MS);
}

// ── @edgegamers/jailbreak-warden ──────────────────────────────────────────────────────────────────────────────────

export function onWardenAssigned(ev: WardenEvent): void {
  wardenSteam = ev.player.steamId;
  guard("warden stats", undefined, () => bump(WARDEN_STAT, ev.player.steamId, "TimesWardened"));
}

export function onWardenRemoved(ev: WardenRemovedEvent): void {
  if (wardenSteam === ev.player.steamId) wardenSteam = null;
  if (ev.reason !== "death") return;
  wardenDied = { steamId: ev.player.steamId, at: Date.now() };
  guard("warden death stats", undefined, () => bump(WARDEN_STAT, ev.player.steamId, "WardenDeaths"));
}

function wasWarden(steamId: string): boolean {
  if (wardenSteam === steamId) return true;
  return wardenDied !== null && wardenDied.steamId === steamId && Date.now() - wardenDied.at < DEATH_WINDOW_MS;
}

// ── @edgegamers/jailbreak-core ────────────────────────────────────────────────────────────────────────────────────

export function onRebelChanged(ev: RebelEvent): void {
  const id = ev.player.userId;
  if (ev.rebel) {
    rebels.add(id);
    rebelDied.delete(id);
    return;
  }
  rebels.delete(id);
  if (ev.reason === "death") rebelDied.set(id, Date.now());
  else rebelDied.delete(id);
}

/**
 * @edgegamers/jailbreak-core OnBombDetonated — C4Behavior.detonate's `eco.Grant(bomber, killed * 25, "C4 Kill")`.
 * The bomber is already dead here, so they are resolved by userId. Gated by
 * `min_players_for_credits` like every other Jailbreak credit in this plugin (the C# did not gate it).
 */
export function onBombDetonated(ev: BombDetonatedEvent): void {
  guard("C4 kill credits", undefined, () => {
    if (ev.killed <= 0 || !creditsAllowed()) return;
    const p = Player.fromUserId(ev.player.userId);
    if (p) grant(p, Credits.c4Kill(ev.killed), "C4 Kill");
  });
}

function wasRebel(p: Player): boolean {
  if (rebels.has(p.userId)) return true;
  const died = rebelDied.get(p.userId);
  if (died !== undefined && Date.now() - died < DEATH_WINDOW_MS) return true;
  try {
    return deps.core?.isRebel(p.slot) ?? false;
  } catch {
    return false;
  }
}

/** Per-round reset (core OnRoundStart). */
export function resetRound(): void {
  rebelScores.clear();
  rebelDied.clear();
  rebels.clear();
  lastGuardActive = false;
  lastGuardEndedAt = 0;
}

/** Map change: forget everything. */
export function resetMap(): void {
  resetRound();
  wardenSteam = null;
  wardenDied = null;
}

// ── game events ─────────────────────────────────────────────────────────────────────────────────

/** RebelListener.OnPlayerHurt: score the weapon a prisoner hurt a guard with. */
export function onPlayerHurt(ev: GameEvents["player_hurt"]): void {
  guard("player_hurt", undefined, () => {
    const victim = Player.fromSlot(ev.getPlayerSlot("userid"));
    const attacker = Player.fromSlot(ev.getPlayerSlot("attacker"));
    if (!victim || !attacker || victim.teamNum !== Team.Guard || attacker.teamNum !== Team.Prisoner) return;
    const lr = deps.lr;
    if (lr && (lr.isInLR(attacker.slot) || lr.isInLR(victim.slot))) return;
    rebelScores.set(attacker.userId, rebelWeaponScore(ev.getString("weapon"), rebelScores.get(attacker.userId) ?? 0));
  });
}

/** WardenBehavior.OnDeath + LastGuard.grantLastGuardKill + RebelListener.OnDeath. */
export function onPlayerDeath(ev: GameEvents["player_death"]): void {
  guard("player_death", undefined, () => {
    const victim = Player.fromSlot(ev.getPlayerSlot("userid"));
    if (!victim) return;
    const attacker = Player.fromSlot(ev.getPlayerSlot("attacker"));
    const killer = attacker && attacker.slot !== victim.slot ? attacker : null;
    const pay = creditsAllowed();

    if (victim.teamNum === Team.Guard) {
      if (!specialDayRunning()) guardDeath(victim, killer, pay);
      if (lastGuardRunning() && killer) grant(killer, Credits.lastGuardKill, "LG Kill");
      return;
    }

    if (victim.teamNum === Team.Prisoner && isSteamId64(victim.steamId) && pay && killer && isSteamId64(killer.steamId)) {
      if (!wasRebel(victim)) return;
      const score = rebelScores.get(victim.userId) ?? rebelKillDefault(lastGuardRunning());
      grant(killer, score, "Rebel Kill");
    }
  });
}

function specialDayRunning(): boolean {
  try {
    return deps.sd?.isRunning() ?? false;
  } catch {
    return false;
  }
}

/** A guard died (outside special days): warden kill stats, guard/warden death stats, credits. */
function guardDeath(victim: Player, killer: Player | null, pay: boolean): void {
  const isWarden = wasWarden(victim.steamId);
  if (killer) {
    if (isWarden) bump(WARDEN_STAT, killer.steamId, "WardensKilled");
    if (pay) grant(killer, Credits.guardKill(isWarden), isWarden ? "Warden Kill" : "Guard Kill");
  }
  if (isWarden) {
    // The warden died: every other guard let their warden die.
    for (const g of humans()) {
      if (g.teamNum === Team.Guard && g.steamId !== victim.steamId) bump(WARDEN_STAT, g.steamId, "WardenDeathsAsGuard");
    }
  } else if (wardenSteam !== null && wardenSteam !== victim.steamId) {
    // A guard died on the warden's watch.
    bump(WARDEN_STAT, wardenSteam, "GuardDeathsAsWarden");
  }
}
