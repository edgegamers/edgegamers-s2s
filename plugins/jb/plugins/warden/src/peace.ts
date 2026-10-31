import {logEntry} from '@edgegamers/jailbreak-shared';
import {forRecipients} from '@edgegamers/jailbreak-shared';
import {broadcastText} from '@edgegamers/jailbreak-shared';
import { ADMFLAG, after, Chat, Clients, Voice } from "@s2script/sdk";
import type { Timer } from "@s2script/sdk";
import { Player } from "@s2script/cs2";
import { Team, alivePrisoners } from "@edgegamers/jailbreak-shared";
import { log } from "@edgegamers/jailbreak-core";
import type { PeaceReason } from "../api";
import { centerTo, hasFlags, pub } from "./env";
import { msgFor } from "./messages";
import { peaceCoversSpawn, peaceDuration } from "./rules";
import { isWarden } from "./warden";

/**
 * Peace mute (Jailbreak.Mute): everyone but the warden is muted for a while, guards get their voice
 * back after at most 10 seconds, prisoners after the full duration. Dead players are muted until
 * the next round. Admins with the CHAT flag are never muted (they get reminders instead).
 *
 * Muting uses a per-plugin `Voice` rule (audible to nobody) rather than `Client.voiceMuted`, so a
 * round-start unmute never lifts an admin's `sm_mute` from basecomm. If voice rules are degraded on
 * this build we fall back to `voiceMuted`, and only ever clear what we set ourselves.
 */

type MuteKind = "rule" | "flag";
const muted = new Map<number, MuteKind>();

let peaceEndMs = 0;
let guardPeaceEndMs = 0;
let lastPeaceMs = 0;
let lastReason: PeaceReason = "admin";
let guardTimer: Timer | null = null;
let prisonerTimer: Timer | null = null;
const lastReminder = new Map<number, number>();

function bypassMute(slot: number): boolean {
  const c = Clients.fromSlot(slot);
  if (!c || c.isBot) return false;
  return hasFlags(slot, ADMFLAG.CHAT);
}

function mute(slot: number): void {
  if (bypassMute(slot) || muted.has(slot)) return;
  if (Voice.setAudibleTo(slot, [])) {
    muted.set(slot, "rule");
    return;
  }
  const c = Clients.fromSlot(slot);
  if (c && !c.voiceMuted) {
    c.voiceMuted = true;
    muted.set(slot, "flag");
  }
}

function unmute(slot: number): void {
  const kind = muted.get(slot);
  if (kind === undefined) return;
  muted.delete(slot);
  if (kind === "rule") Voice.reset(slot);
  else {
    const c = Clients.fromSlot(slot);
    if (c) c.voiceMuted = false;
  }
}

function isMuted(slot: number): boolean {
  return muted.has(slot) || (Clients.fromSlot(slot)?.voiceMuted ?? false);
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
  for (const p of Player.all()) {
    if (!isWarden(p.slot)) mute(p.slot);
  }

  switch (reason) {
    case "admin":
      broadcastText(forRecipients((recipient,value0) => msgFor(recipient).peaceByAdmin(value0), prisoner));
      break;
    case "warden":
      broadcastText(forRecipients((recipient,value0) => msgFor(recipient).peaceByWarden(value0), prisoner));
      break;
    default:
      broadcastText(forRecipients((recipient,value0) => msgFor(recipient).peaceGeneral(value0), prisoner));
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

  log(...logEntry("JB_LOG_PEACE_ENACTED_FOR_S", [String(prisoner), String(reason)], [1]));
  pub()?.emit("OnPeaceChanged", { active: true, reason, seconds: prisoner });
}

/** End any running peace now: unmute living guards and prisoners. */
export function unPeaceMute(): void {
  if (guardTimer) unmuteGuards();
  if (prisonerTimer) unmutePrisoners();
}

function unmuteGuards(): void {
  for (const p of Player.all()) {
    if (p.teamNum === Team.Guard && p.pawnIsAlive) unmute(p.slot);
  }
  if (guardTimer) {
    guardTimer.kill();
    guardTimer = null;
    broadcastText(recipient => msgFor(recipient).unmutedGuards);
  }
  guardPeaceEndMs = Math.min(guardPeaceEndMs, Date.now());
}

function unmutePrisoners(): void {
  for (const p of Player.all()) {
    if (p.teamNum === Team.Prisoner && p.pawnIsAlive) unmute(p.slot);
  }
  if (prisonerTimer) {
    prisonerTimer.kill();
    prisonerTimer = null;
    broadcastText(recipient => msgFor(recipient).unmutedPrisoners);
    peaceEndMs = Math.min(peaceEndMs, Date.now());
    pub()?.emit("OnPeaceChanged", { active: false, reason: lastReason, seconds: 0 });
  }
}

/** Round start: end peace and give everybody their voice back. */
export function peaceRoundStart(): void {
  unPeaceMute();
  for (const slot of [...muted.keys()]) unmute(slot);
}

export function peaceRoundEnd(): void {
  unPeaceMute();
}

/** Dead players can't talk (until the next round). */
export function peaceOnDeath(slot: number): void {
  const c = Clients.fromSlot(slot);
  if (!c || c.isBot) return;
  mute(slot);
}

/**
 * A player came back to life mid-round (respawning special days, warmup): give back the voice
 * their death took, unless a running peace mute still covers their team.
 */
export function peaceOnSpawn(slot: number): void {
  const p = Player.fromSlot(slot);
  if (!p || isWarden(slot)) return;
  if (peaceCoversSpawn(p.teamNum ?? 0, Date.now(), peaceEndMs, guardPeaceEndMs)) return;
  unmute(slot);
}

/** The new warden always has a voice. */
export function peaceOnWarden(slot: number): void {
  unmute(slot);
}

export function peaceOnDisconnect(slot: number): void {
  muted.delete(slot);
  lastReminder.delete(slot);
}

function remind(slot: number, text: string): void {
  const now = Date.now();
  if (now - (lastReminder.get(slot) ?? 0) < 3000) return;
  lastReminder.set(slot, now);
  centerTo(slot, text);
}

/** Per voice packet from `slot` (C# OnClientVoice listener). */
export function peaceOnVoice(slot: number): void {
  const p = Player.fromSlot(slot);
  const c = Clients.fromSlot(slot);
  if (!p || !c || c.isBot) return;

  if (isWarden(slot)) {
    unmute(slot); // always let the warden speak
    return;
  }
  const alive = p.pawnIsAlive === true;
  const bypass = bypassMute(slot);
  if (!alive && !bypass) {
    remind(slot, msgFor(slot).deadReminder);
    mute(slot);
    return;
  }
  if (isMuted(slot)) {
    remind(slot, msgFor(slot).muteReminder);
    return;
  }
  if (!bypass) return;

  // Admins are never muted, so remind them instead.
  if (isPeace()) {
    if (p.teamNum === Team.Guard && Date.now() >= guardPeaceEndMs) return;
    remind(slot, msgFor(slot).peaceReminder);
    return;
  }
  if (!alive) remind(slot, msgFor(slot).adminDeadReminder);
}
