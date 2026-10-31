import {logEntry} from '@edgegamers/jailbreak-shared';
import {forRecipients} from '@edgegamers/jailbreak-shared';
import {broadcastText} from '@edgegamers/jailbreak-shared';
import { Chat } from "@s2script/sdk";
import { Fade, Player } from "@s2script/cs2";
import { Colors, isAlive, packColor32, setPawnColor } from "@edgegamers/jailbreak-shared";
import { describe, isRebel, log, unmarkRebel } from "@edgegamers/jailbreak-core";
import { centerTo, playerRef, pub } from "./env";
import { assignSpecialIcon, removeSpecialIcon } from "./icons";
import { msgFor, who } from "./messages";

/**
 * Special treatment (SpecialTreatmentBehavior): a prisoner the warden favours for the round. They
 * glow green, get a faint green screen tint and an "S" icon, and lose any rebel status. Revoked on
 * death, on becoming a rebel (core's OnRebelChanged), and reset every round.
 */

const special = new Set<number>();

// Fade flags (CUserMessageFade): FADE_IN 0x1, FADE_OUT 0x2, PURGE 0x10. Units are 1/512 s.
const FADE_IN = 0x1;
const FADE_OUT = 0x2;
const PURGE = 0x10;
const tint = packColor32({ r: 0, g: 255, b: 0 }, 16);

export function isSpecialTreatment(slot: number): boolean {
  return special.has(slot);
}

export function grantSpecialTreatment(slot: number): boolean {
  if (special.has(slot)) return true;
  const p = Player.fromSlot(slot);
  if (!p || !isAlive(p)) return false;
  special.add(slot);

  if (isRebel(slot)) unmarkRebel(slot, "special_treatment");
  setPawnColor(p.pawn, Colors.Green);
  Fade.to(slot, { duration: Math.round(0.2 * 512), holdTime: 999999 * 512, color: tint, flags: FADE_OUT | PURGE });

  const name = who(p.playerName ?? "", p.teamNum);
  Chat.toSlot(slot, msgFor(slot).stGranted);
  centerTo(slot, msgFor(slot).stGrantedCenter);
  broadcastText(forRecipients((recipient,value0) => msgFor(recipient).stGrantedTo(value0), name));

  assignSpecialIcon(slot);
  log(...logEntry("JB_LOG_WAS_GRANTED_SPECIAL_TREATMENT", [String(describe(slot))]));
  emit(slot, true);
  return true;
}

export function revokeSpecialTreatment(slot: number, print: boolean): boolean {
  if (!special.has(slot)) return true;
  special.delete(slot);

  const p = Player.fromSlot(slot);
  if (p) {
    setPawnColor(p.pawn, Colors.White);
    Fade.to(slot, { duration: Math.round(1.5 * 512), holdTime: 0, color: tint, flags: FADE_IN | PURGE });
    if (print) {
      Chat.toSlot(slot, msgFor(slot).stRevoked);
      centerTo(slot, msgFor(slot).stRevokedCenter);
      broadcastText(forRecipients((recipient,value0) => msgFor(recipient).stRevokedFrom(value0), who(p.playerName ?? "", p.teamNum)));
    }
    log(...logEntry("JB_LOG_LOST_SPECIAL_TREATMENT", [String(describe(slot))]));
  }
  removeSpecialIcon(slot);
  emit(slot, false);
  return true;
}

export function setSpecialTreatment(slot: number, granted: boolean): boolean {
  return granted ? grantSpecialTreatment(slot) : revokeSpecialTreatment(slot, true);
}

function emit(slot: number, granted: boolean): void {
  const player = playerRef(slot);
  if (player) pub()?.emit("OnSpecialTreatment", { player, granted });
}

/** Per-round reset: respawn already restores colour, so only state and icons are dropped. */
export function specialRoundStart(): void {
  for (const slot of [...special]) removeSpecialIcon(slot);
  special.clear();
}

export function specialOnDeath(slot: number): void {
  revokeSpecialTreatment(slot, false);
}

export function specialOnDisconnect(slot: number): void {
  special.delete(slot);
  removeSpecialIcon(slot);
}
