import { renderText, consoleText, type Text } from "@edgegamers/jailbreak-shared";
import { localizedChat as Chat } from "@edgegamers/jailbreak-shared";
import { ADMFLAG, after, Clients, Voice } from "@s2script/sdk";
import type { Timer } from "@s2script/sdk";
import { Player } from "@s2script/cs2";
import { Team, alivePrisoners, isAlive } from "@edgegamers/jailbreak-shared";
import { getRound, log } from "@edgegamers/jailbreak-core";
import type { PeaceReason } from "../api";
import { cfg } from "./config";
import { centerTo, hasFlags, isWarmup, pub } from "./env";
import { msg } from "./messages";
import { peaceDuration, prisonerLockApplies, voiceRule } from "./rules";
import type { VoiceRule } from "./rules";
import { isWarden } from "./warden";

/**
 * Voice policy (Jailbreak.Mute, extended):
 * - Peace: everyone alive but the warden is muted; guards get their voice back after at most
 *   10 seconds, prisoners after the full duration. Admins are muted like everyone else.
 * - Dead players (and spectators) are heard only by other dead players, TTT-style.
 * - `!speaktoall`: a chat admin is heard by everyone, through peace and death, until they turn
 *   it off or the round ends.
 * - `prisoner_mute_min_players` (0 = off): with at least that many players on teams at round
 *   start, living prisoners stay muted until last request (any non-normal round mode).
 *
 * Every player's rule is recomputed from that state ({@link refreshVoice}) and applied as a
 * per-plugin `Voice` rule, so lifting it never touches an admin's `sm_mute` from basecomm. If voice
 * rules are degraded on this build we fall back to `voiceMuted` (dead players then can't talk at
 * all), and only ever clear what we set ourselves.
 */

type Applied = { key: string; via: "rule" | "flag" };
const applied = new Map<number, Applied>();
const speakToAll = new Set<number>();
const lastReminder = new Map<number, number>();

let peaceEndMs = 0;
let guardPeaceEndMs = 0;
let lastPeaceMs = 0;
let lastReason: PeaceReason = "admin";
let guardTimer: Timer | null = null;
let prisonerTimer: Timer | null = null;
let prisonerLock = false;
let pendingRefresh: Timer | null = null;

const isHuman = (slot: number): boolean => {
  const c = Clients.fromSlot(slot);
  return !!c && !c.isBot;
};
const isChatAdmin = (slot: number): boolean => isHuman(slot) && hasFlags(slot, ADMFLAG.CHAT);

function ruleFor(p: Player): VoiceRule {
  return voiceRule(
    { alive: isAlive(p), team: p.teamNum ?? 0, warden: isWarden(p.slot), speakToAll: speakToAll.has(p.slot) },
    { nowMs: Date.now(), peaceEndMs, guardPeaceEndMs, prisonerLock },
  );
}

function release(slot: number): void {
  const prev = applied.get(slot);
  if (!prev) return;
  applied.delete(slot);
  if (prev.via === "rule") Voice.reset(slot);
  else {
    const c = Clients.fromSlot(slot);
    if (c) c.voiceMuted = false;
  }
}

function apply(slot: number, rule: VoiceRule, receivers: readonly number[]): void {
  const key = rule === "dead" ? `dead:${receivers.join(",")}` : rule;
  const prev = applied.get(slot);
  if (prev?.key === key) return;
  if (rule === "open") {
    release(slot);
    return;
  }
  const audience = rule === "dead" ? receivers : [];
  if (Voice.setAudibleTo(slot, audience)) {
    if (prev?.via === "flag") {
      const c = Clients.fromSlot(slot);
      if (c) c.voiceMuted = false;
    }
    applied.set(slot, { key, via: "rule" });
    return;
  }
  // Voice rules are degraded: fall back to a full mute through the client flag we own.
  if (prev?.via === "rule") Voice.reset(slot);
  if (prev?.via === "flag") {
    applied.set(slot, { key, via: "flag" });
    return;
  }
  applied.delete(slot);
  const c = Clients.fromSlot(slot);
  if (c && !c.voiceMuted) {
    c.voiceMuted = true;
    applied.set(slot, { key, via: "flag" });
  }
}

/** Recompute and apply every human player's voice rule. `leaving` is a slot that is disconnecting. */
export function refreshVoice(leaving = -1): void {
  const humans = Player.all().filter((p) => p.slot !== leaving && isHuman(p.slot));
  const rules = humans.map((p) => ({ slot: p.slot, rule: ruleFor(p) }));
  const dead = humans.filter((p) => !isAlive(p)).map((p) => p.slot);
  for (const { slot, rule } of rules) apply(slot, rule, dead);
  const present = new Set(rules.map((r) => r.slot));
  for (const slot of [...applied.keys()]) if (!present.has(slot)) release(slot);
}

/**
 * Refresh on the next frame: at `player_death` / `player_spawn` / `player_team` time the pawn's
 * life state may not have settled yet. Several events in one frame coalesce into one pass.
 */
export function scheduleVoiceRefresh(): void {
  if (pendingRefresh) return;
  pendingRefresh = after(0, () => {
    pendingRefresh = null;
    refreshVoice();
  });
}

export function isPeace(): boolean {
  return Date.now() < peaceEndMs;
}

/** Milliseconds since the last peace started (Infinity if never). */
export function msSinceLastPeace(): number {
  return lastPeaceMs === 0 ? Infinity : Date.now() - lastPeaceMs;
}

export function peaceMute(reason: PeaceReason): void {
  const { prisoner, guard } = peaceDuration(alivePrisoners().length, reason);

  switch (reason) {
    case "admin":
      Chat.toAll(msg.peaceByAdmin(prisoner));
      break;
    case "warden":
      Chat.toAll(msg.peaceByWarden(prisoner));
      break;
    default:
      Chat.toAll(msg.peaceGeneral(prisoner));
  }

  const now = Date.now();
  peaceEndMs = now + prisoner * 1000;
  guardPeaceEndMs = now + guard * 1000;
  lastPeaceMs = now;
  lastReason = reason;

  guardTimer?.kill();
  prisonerTimer?.kill();
  guardTimer = after(guard * 1000, unmuteGuards);
  prisonerTimer = after(prisoner * 1000, unmutePrisoners);
  refreshVoice();

  log(`Peace enacted for ${prisoner}s (${reason}).`);
  pub()?.emit("OnPeaceChanged", { active: true, reason, seconds: prisoner });
}

/** End any running peace now: unmute living guards and prisoners. */
export function unPeaceMute(): void {
  if (guardTimer) unmuteGuards();
  if (prisonerTimer) unmutePrisoners();
}

function unmuteGuards(): void {
  guardPeaceEndMs = Math.min(guardPeaceEndMs, Date.now());
  if (guardTimer) {
    guardTimer.kill();
    guardTimer = null;
    Chat.toAll(msg.unmutedGuards);
  }
  refreshVoice();
}

function unmutePrisoners(): void {
  const ended = prisonerTimer !== null;
  peaceEndMs = Math.min(peaceEndMs, Date.now());
  if (prisonerTimer) {
    prisonerTimer.kill();
    prisonerTimer = null;
  }
  refreshVoice();
  if (ended) {
    Chat.toAll(prisonerLock ? msg.peaceOverPrisonersLocked : msg.unmutedPrisoners);
    pub()?.emit("OnPeaceChanged", { active: false, reason: lastReason, seconds: 0 });
  }
}

/** Humans on T or CT (the population for the prisoner lock). */
function playersOnTeams(): number {
  return Player.all().filter((p) => isHuman(p.slot) && (p.teamNum === Team.Prisoner || p.teamNum === Team.Guard))
    .length;
}

/** Round start: end peace, drop `!speaktoall`, and decide this round's prisoner lock. */
export function peaceRoundStart(): void {
  unPeaceMute();
  speakToAll.clear();
  // A special day may already have claimed the round in its own OnRoundStart handler.
  prisonerLock = !isWarmup() && getRound().mode === "normal" && prisonerLockApplies(playersOnTeams(), cfg.prisonerMuteMinPlayers);
  if (prisonerLock) {
    Chat.toAll(msg.prisonersLockedUntilLR);
    log(`Prisoners muted until last request (${playersOnTeams()} players).`);
  }
  refreshVoice();
}

export function peaceRoundEnd(): void {
  unPeaceMute();
  liftPrisonerLock(false);
}

/** Core's round mode left "normal" (last request, last guard or a special day): prisoners may talk. */
export function peaceOnModeChanged(mode: string): void {
  if (mode !== "normal") liftPrisonerLock(true);
}

function liftPrisonerLock(announce: boolean): void {
  if (!prisonerLock) return;
  prisonerLock = false;
  refreshVoice();
  if (announce) Chat.toAll(msg.unmutedPrisoners);
}

/** Toggle `!speaktoall` for a chat admin. Returns the new state, or null if not allowed. */
export function toggleSpeakToAll(slot: number): boolean | null {
  if (!isChatAdmin(slot)) return null;
  const on = !speakToAll.has(slot);
  if (on) speakToAll.add(slot);
  else speakToAll.delete(slot);
  refreshVoice();
  return on;
}

export function isSpeakingToAll(slot: number): boolean {
  return speakToAll.has(slot);
}

/** Deaths, spawns and team changes all change who hears whom. */
export function peaceOnLifeChange(): void {
  scheduleVoiceRefresh();
}

/** The warden changed: the new one always has a voice; the old one follows the normal rules. */
export function peaceOnWarden(): void {
  refreshVoice();
}

export function peaceOnDisconnect(slot: number): void {
  applied.delete(slot); // the engine drops a leaving sender's rules itself
  speakToAll.delete(slot);
  lastReminder.delete(slot);
  refreshVoice(slot);
}

export function peaceOnPluginEnd(): void {
  pendingRefresh?.kill();
  pendingRefresh = null;
  guardTimer?.kill();
  prisonerTimer?.kill();
  guardTimer = prisonerTimer = null;
  peaceEndMs = guardPeaceEndMs = 0;
  prisonerLock = false;
  speakToAll.clear();
  for (const slot of [...applied.keys()]) release(slot);
}

function remind(slot: number, text: Text, everyMs: number): void {
  const now = Date.now();
  if (now - (lastReminder.get(slot) ?? 0) < everyMs) return;
  lastReminder.set(slot, now);
  centerTo(slot, text);
}

/** Per voice packet from `slot` (C# OnClientVoice listener): reminders, and a self-heal check. */
export function peaceOnVoice(slot: number): void {
  const p = Player.fromSlot(slot);
  const c = Clients.fromSlot(slot);
  if (!p || !c || c.isBot) return;

  const rule = ruleFor(p);
  const expected = rule === "open" ? undefined : rule;
  const current = applied.get(slot)?.key.split(":")[0];
  if (current !== expected) scheduleVoiceRefresh(); // an event we missed; converge next frame

  if (speakToAll.has(slot)) return;
  const admin = isChatAdmin(slot);
  if (rule === "dead") {
    remind(slot, admin ? msg.adminDeadReminder : msg.deadReminder, 20_000);
    return;
  }
  if (rule === "muted") {
    const locked = !isPeace() && prisonerLock;
    remind(slot, admin ? msg.adminMutedReminder : locked ? msg.lockedReminder : msg.muteReminder, 3000);
    return;
  }
  if (c.voiceMuted) remind(slot, msg.muteReminder, 3000);
}
