import {logEntry} from '@edgegamers/jailbreak-shared';
import {forRecipients} from '@edgegamers/jailbreak-shared';
import {broadcastText,broadcastLines} from '@edgegamers/jailbreak-shared';
import { after, ADMFLAG, Chat, Entity, Clients } from "@s2script/sdk";
import type { Timer } from "@s2script/sdk";
import { Player, Weapon } from "@s2script/cs2";
import type { Pawn } from "@s2script/cs2";
import { Colors, Team, isAlive, playersOn, setPawnColor } from "@edgegamers/jailbreak-shared";
import { cellsOpened, describe, isRebel, log, openCells } from "@edgegamers/jailbreak-core";
import type { PlayerRef, WardenRemovedReason } from "../api";
import { cfg } from "./config";
import { centerAll, hasFlags, isWarmup, playerRef, playToAll, pub } from "./env";
import { assignWardenIcon, removeWardenIcon } from "./icons";
import { msgFor, who } from "./messages";
import { peaceMute, peaceOnWarden, unPeaceMute } from "./peace";
import { guardArmor } from "./rules";
import { isSpecialTreatment } from "./special-treatment";

/**
 * The warden himself (WardenBehavior): assignment and removal, the first-warden buff, the blue
 * tint, the "warden died / left / passed" flows, and the auto-open-cells timer.
 */

interface PreWardenStats {
  armor: number;
  health: number;
  maxHealth: number;
  hadHealthshot: boolean;
  hadHelmet: boolean;
}

let wardenSlot = -1;
let wardenRef: PlayerRef | null = null;
let firstWarden = false;
let preStats: PreWardenStats | null = null;
const bluePrisoners = new Set<number>();
let unblueTimer: Timer | null = null;
let freedayTimer: Timer | null = null;

/** Who passed or was fired recently (SteamID/"u<userId>" → ms) — the 15 s `!warden` cooldown. */
const passCooldowns = new Map<string, number>();

export const getWarden = (): number => wardenSlot;
export const hasWarden = (): boolean => wardenSlot >= 0;
export const isWarden = (slot: number): boolean => slot >= 0 && slot === wardenSlot;

/** Cooldown key for a slot (SteamID, or user id for bots / unauthenticated players). */
export function cooldownKey(slot: number): string {
  const p = Player.fromSlot(slot);
  if (!p) return "";
  return p.steamId !== "0" ? p.steamId : `u${p.userId}`;
}

export function passCooldownEnds(slot: number): number {
  return (passCooldowns.get(cooldownKey(slot)) ?? 0) + 15000;
}

export function clearPassCooldowns(): void {
  passCooldowns.clear();
}

function wardenName(slot: number): string {
  const p = Player.fromSlot(slot);
  return who(p?.playerName ?? "", p?.teamNum);
}

// ── assignment ──────────────────────────────────────────────────────────────

/** Make `slot` warden (C# TrySetWarden). Must be a living guard, and no warden may be set. */
export function setWarden(slot: number): boolean {
  if (hasWarden()) return false;
  const p = Player.fromSlot(slot);
  if (!p || p.teamNum !== Team.Guard || !isAlive(p)) return false;
  const ref = playerRef(slot);
  if (!ref) return false;

  unPeaceMute();
  wardenSlot = slot;
  wardenRef = ref;
  setPawnColor(p.pawn, Colors.Blue);

  const name = who(ref.name, p.teamNum);
  broadcastText(forRecipients((recipient,value0) => msgFor(recipient).newWarden(value0), name));
  centerAll(forRecipients((recipient, name) => msgFor(recipient).newWardenCenter(name), ref.name));
  playToAll(cfg.soundNew);
  assignWardenIcon(slot);
  peaceOnWarden(slot);
  log(...logEntry("JB_LOG_IS_NOW_THE_WARDEN", [String(describe(slot))]));

  unblueTimer?.kill();
  unblueTimer = after(3000, unmarkPrisonersBlue);
  freedayTimer?.kill(); // a new warden cancels the "freeday" announcement after a pass
  freedayTimer = null;
  peaceMute(firstWarden ? "initial_warden" : "warden_taken");

  const pawn = p.pawn;
  if (pawn && firstWarden) {
    firstWarden = false;
    applyFirstWardenBuff(p, pawn);
  } else {
    preStats = null;
  }

  pub()?.emit("OnWardenAssigned", { player: ref });
  return true;
}

/** The round's first warden: guards' armor is raised by team balance, the warden gets extra HP/armor. */
function applyFirstWardenBuff(p: Player, pawn: Pawn): void {
  const hadHealthshot = findHealthshot(pawn) !== null;
  const hadHelmet = p.pawnHasHelmet === true;
  preStats = {
    armor: pawn.armorValue ?? 0,
    health: pawn.health ?? 0,
    maxHealth: pawn.maxHealth ?? 100,
    hadHealthshot,
    hadHelmet,
  };
  if (!hadHelmet) pawn.giveNamedItem("item_assaultsuit");

  const armor = guardArmor(playersOn(Team.Prisoner).length, playersOn(Team.Guard).length, cfg.wardenTRatio, {
    equal: cfg.hpEqual,
    outnumber: cfg.hpOutnumber,
    outnumbered: cfg.hpOutnumbered,
  });
  for (const guard of playersOn(Team.Guard)) {
    const gp = guard.pawn;
    if (!gp || !isAlive(guard)) continue;
    if ((gp.armorValue ?? 0) < armor) gp.armorValue = armor;
  }

  pawn.armorValue = cfg.wardenArmor;
  pawn.health = cfg.wardenHp;
  pawn.maxHealth = cfg.wardenMaxHp;
  if (!hadHealthshot) pawn.giveNamedItem("weapon_healthshot");
}

function findHealthshot(pawn: Pawn): Weapon | null {
  const held = new Set(pawn.weapons.map((w) => w.ref.index));
  return Weapon.findAll("weapon_healthshot").find((w) => held.has(w.ref.index)) ?? null;
}

// ── removal ─────────────────────────────────────────────────────────────────

/** Clear the warden (C# TryRemoveWarden). A pass/fire undoes the first-warden buff and starts the freeday timer. */
function clearWarden(reason: WardenRemovedReason): boolean {
  if (!hasWarden()) return false;
  const slot = wardenSlot;
  const ref = wardenRef;
  const isPass = reason === "pass" || reason === "fire";

  unPeaceMute();
  wardenSlot = -1;
  wardenRef = null;

  if (isPass) {
    freedayTimer?.kill();
    freedayTimer = after(10000, () => {
      freedayTimer = null;
      broadcastText(recipient => msgFor(recipient).nowFreeday);
    });
  }

  const p = Player.fromSlot(slot);
  const samePlayer = p !== null && ref !== null && p.userId === ref.userId;
  if (samePlayer && p) {
    if (p.pawn) setPawnColor(p.pawn, Colors.White);
    log(...logEntry("JB_LOG_IS_NO_LONGER_THE_WARDEN", [String(describe(slot)), String(reason)], [1]));
  } else if (ref) {
    log(...logEntry("JB_LOG_IS_NO_LONGER_THE_WARDEN", [String(ref.name), String(reason)], [1]));
  }
  removeWardenIcon(slot);

  const pawn = samePlayer ? p?.pawn : null;
  if (isPass && preStats && pawn && pawn.isValid) {
    // Don't let a pass keep the first-warden buff: restore the old values (or current, if lower).
    pawn.armorValue = Math.min(pawn.armorValue ?? 0, preStats.armor);
    pawn.health = Math.min(pawn.health ?? 0, preStats.health);
    pawn.maxHealth = Math.min(pawn.maxHealth ?? 100, preStats.maxHealth);
    // NOT PORTED: removing the helmet granted by the buff (no CCSPlayer_ItemServices.m_bHasHelmet write in the SDK).
    if (!preStats.hadHealthshot) {
      const shot = findHealthshot(pawn);
      if (shot) pawn.removeWeapon(shot);
    }
  }
  preStats = null;

  if (ref) pub()?.emit("OnWardenRemoved", { player: ref, reason });
  return true;
}

/**
 * Remove the warden for `reason`, running that reason's announcements (death/team change →
 * "the warden died, freeday", disconnect → "the warden left", pass/fire → "resigned"/"fired").
 * `actorSlot` is the admin who fired them (for `"fire"`), or -1.
 */
export function removeWarden(reason: WardenRemovedReason, actorSlot = -1): boolean {
  if (!hasWarden()) return false;
  const slot = wardenSlot;
  const name = wardenName(slot);
  const plain = wardenRef?.name ?? "";

  switch (reason) {
    case "death":
    case "team_change": {
      if (!clearWarden(reason)) return false;
      broadcastLines(recipient => msgFor(recipient).wardenDied);
      centerAll(recipient => msgFor(recipient).wardenDiedCenter);
      playToAll(cfg.soundKilled);
      unblueTimer?.kill(); // died within 3 s of taking warden
      unblueTimer = null;
      markPrisonersBlue();
      if (reason === "death") clearPassCooldowns();
      return true;
    }
    case "disconnect": {
      if (!clearWarden(reason)) return false;
      broadcastText(recipient => msgFor(recipient).wardenLeft);
      centerAll(recipient => msgFor(recipient).wardenLeftCenter);
      playToAll(cfg.soundPassed);
      broadcastText(recipient => msgFor(recipient).becomeNextWarden);
      return true;
    }
    case "pass": {
      broadcastText(forRecipients((recipient,value0) => msgFor(recipient).passWarden(value0), name));
      centerAll(forRecipients((recipient, name) => msgFor(recipient).passWardenCenter(name), plain));
      playToAll(cfg.soundPassed);
      broadcastText(recipient => msgFor(recipient).becomeNextWarden);
      passCooldowns.set(cooldownKey(slot), Date.now());
      if (!clearWarden(reason)) broadcastText(recipient => msgFor(recipient).removeFailed);
      return true;
    }
    case "fire": {
      const actor = actorSlot >= 0 ? Player.fromSlot(actorSlot) : null;
      const actorName = actor ? who(actor.playerName ?? "", actor.teamNum) : "";
      for (const c of Clients.all()) {
        if (actor && hasFlags(c.slot, ADMFLAG.CHAT)) Chat.toSlot(c.slot, msgFor(c.slot).fireWardenBy(actorName, name));
        else Chat.toSlot(c.slot, msgFor(c.slot).fireWarden(name));
      }
      playToAll(cfg.soundPassed);
      broadcastText(recipient => msgFor(recipient).becomeNextWarden);
      passCooldowns.set(cooldownKey(slot), Date.now());
      if (actor) log(...logEntry("JB_LOG_FIRED_THE_WARDEN", [String(describe(actorSlot))]));
      if (!clearWarden(reason)) broadcastText(recipient => msgFor(recipient).removeFailed);
      return true;
    }
    default:
      return clearWarden(reason);
  }
}

// ── the blue tint for prisoners while there's no warden ─────────────────────

function ignoreColor(slot: number): boolean {
  return isSpecialTreatment(slot) || isRebel(slot);
}

function markPrisonersBlue(): void {
  for (const p of playersOn(Team.Prisoner)) {
    if (ignoreColor(p.slot) || !isAlive(p)) continue;
    setPawnColor(p.pawn, Colors.Blue);
    bluePrisoners.add(p.slot);
  }
}

function unmarkPrisonersBlue(): void {
  unblueTimer = null;
  for (const slot of bluePrisoners) {
    const p = Player.fromSlot(slot);
    if (!p || ignoreColor(slot)) continue;
    setPawnColor(p.pawn, Colors.White);
  }
  bluePrisoners.clear();
}

// ── round lifecycle ─────────────────────────────────────────────────────────

export function wardenRoundStart(): void {
  if (hasWarden()) clearWarden("round_end");
  firstWarden = true;
  preStats = null;
  bluePrisoners.clear();
  passCooldowns.clear();
  unblueTimer?.kill();
  unblueTimer = null;
  freedayTimer?.kill(); // a pass right before round end shouldn't announce a freeday next round
  freedayTimer = null;
}

export function wardenRoundEnd(): void {
  removeWarden("round_end");
}

export function wardenMapStart(): void {
  wardenSlot = -1;
  wardenRef = null;
  passCooldowns.clear();
}

