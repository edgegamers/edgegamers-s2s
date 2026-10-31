import {logEntry} from '@edgegamers/jailbreak-shared';
import {forRecipients} from '@edgegamers/jailbreak-shared';
import {broadcastText} from '@edgegamers/jailbreak-shared';
/**
 * The last-request manager (C# `LastRequestManager`): when LR turns on, starting and ending LRs,
 * the damage and pickup rules while LRs run, and the per-round reset.
 */
import { after, Chat, HookResult } from "@s2script/sdk";
import type { DamageInfo, EntityRef, HookResultValue } from "@s2script/sdk";
import { AcquireMethod, AcquireResult, HintText, Player, Weapon } from "@s2script/cs2";
import type { CanAcquireView } from "@s2script/cs2";
import { Colors, hl, isAlive, packColor32, parseColor, RAINBOW, Team } from "@edgegamers/jailbreak-shared";
import { getRound, log, unmarkRebel } from "@edgegamers/jailbreak-core";
import type { LRInfo, LRResult, LRType } from "../api";
import { createLastRequest } from "./games";
import type { LastRequest, LRHost } from "./games";
import { clearTint, startRainbow, stopAllBeacons, tintPlayer } from "./fx";
import { emit, lrColor } from "./forwards";
import { damageVerdict, lrName, shouldEnableLR } from "./logic";
import { msgFor } from "./messages";
import { closeAllMenus } from "./menus";
import { countOnTeam, isReal, Participant, playerOfEntity, playToAll } from "./players";
import { addTimeCapped, addTimeRemaining, claimMode, isWarmup, releaseMode, setDefaultWinner, setTimeRemaining } from "./round";
import { settings } from "./settings";

const LR_SOUND = "sounds/jb/ct/lr.vsnd";

let enabled = false;
let nextId = 1;
const active: LastRequest[] = [];
/** Slots tied up in an LR that is still being configured (weapon menu open). */
const configuring = new Set<number>();
/** userIds whose model we tinted for an LR (restored when it ends). */
const tinted = new Set<number>();

/** Hooks other modules plug in (avoids import cycles; wired in plugin.ts). */
export const bridge = {
  lastGuardActive: (): boolean => false,
  /** Open the `!lr` flow for a prisoner (C# `ExecuteClientCommandFromServer("css_lr")`). */
  openLR: (_slot: number): void => {},
};

// ---------------------------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------------------------

export const isEnabled = (): boolean => enabled;

export function getActiveLR(slot: number): LastRequest | null {
  return active.find((lr) => lr.isParticipant(slot)) ?? null;
}

export const isInLR = (slot: number): boolean => getActiveLR(slot) !== null;

/** In an LR or picking a weapon for one. */
export const isBusy = (slot: number): boolean => isInLR(slot) || configuring.has(slot);

export const activeInfos = (): LRInfo[] => active.map((lr) => lr.info());

export const hasActiveLRs = (): boolean => active.length > 0;

// ---------------------------------------------------------------------------------------------
// Enabling
// ---------------------------------------------------------------------------------------------

/**
 * Turn LR on (C# `EnableLR`). Claims core's "lastrequest" mode first — refused means a special day
 * owns the round right now; LR stays off, and is re-checked on the next prisoner death or when
 * the mode returns to "normal" (Custom / Bunny Hop hand it back). `diedSlot` is not offered the LR menu.
 */
export function enableLR(diedSlot = -1): boolean {
  if (!claimMode("lastrequest")) return false;
  enabled = true;
  broadcastText(recipient => msgFor(recipient).enabled());

  const prisoners = Player.all().filter((p) => p.teamNum === Team.Prisoner && isAlive(p));
  const guards = Player.all().filter((p) => p.teamNum === Team.Guard && isAlive(p)).length;
  if (settings.lrTimeBase !== 0) setTimeRemaining(settings.lrTimeBase);
  addTimeRemaining(settings.lrTimePerGuard * guards);

  stopAllBeacons();
  playToAll(LR_SOUND);

  const lastGuard = bridge.lastGuardActive();
  for (const p of prisoners) {
    if (p.slot === diedSlot) continue;
    if (lastGuard) unmarkRebel(p.slot, "lastrequest");
    bridge.openLR(p.slot);
  }
  setDefaultWinner(3);

  log(...logEntry("JB_LOG_LAST_REQUEST_ENABLED_PRISONERS_LEFT", [String(prisoners.length)]));
  emit("OnLREnabled", { round: getRound().round, prisoners: prisoners.length });
  return true;
}

/** LR off for now (debug `disable`). Gives the round mode back if no LR is running. */
export function disableLR(): void {
  enabled = false;
  if (active.length === 0) releaseMode("lastrequest");
}

/** True while no special day owns core's round mode (LR/LG modes are ours to hand over). */
function modeAvailable(): boolean {
  return getRound().mode !== "specialday";
}

/** C# `checkLR`: half a second after a prisoner dies/leaves, see if LR should turn on. */
export function scheduleLRCheck(): void {
  const round = getRound().round;
  after(500, () => {
    if (getRound().round !== round) return; // a new round started meanwhile
    const ok = shouldEnableLR({
      enabled,
      modeAvailable: modeAvailable(),
      guards: countOnTeam(Team.Guard),
      alivePrisoners: Player.all().filter((p) => p.teamNum === Team.Prisoner && isAlive(p)).length,
      threshold: settings.lrActivateAt,
    });
    if (ok) enableLR();
  });
}

// ---------------------------------------------------------------------------------------------
// Starting / ending
// ---------------------------------------------------------------------------------------------

const host: LRHost = { end: (lr, result) => endLastRequest(lr, result) };

/** Start an LR (C# `InitiateLastRequest`): optional config menu, then setup. */
export function initiateLastRequest(prisoner: Player, guard: Player, type: LRType): boolean {
  const lr = createLastRequest(host, nextId++, type, Participant.of(prisoner), Participant.of(guard));
  const slots = [lr.prisoner.slot, lr.guard.slot];
  for (const s of slots) configuring.add(s);
  const release = (): void => {
    for (const s of slots) configuring.delete(s);
  };
  lr.configure(
    () => {
      release();
      if (!lr.prisoner.alive || !lr.guard.alive || isInLR(lr.prisoner.slot) || isInLR(lr.guard.slot)) return;
      completeInitiation(lr);
    },
    release,
  );
  return true;
}

function completeInitiation(lr: LastRequest): void {
  lr.setup();
  active.push(lr);

  for (const p of [lr.prisoner, lr.guard]) {
    p.setHealth(100);
    p.setArmor(0);
  }
  applyColor(lr);

  broadcastText(forRecipients((recipient,value0,value1,value2) => msgFor(recipient).inform(value0, value1, value2), lr.prisoner.name,lr.type,lr.guard.name));
  log(...logEntry("JB_LOG_STARTED_A_LR_AGAINST", [String(lr.prisoner.name), String(lrName(lr.type)), String(lr.guard.name)], [1]));
  emit("OnLRStart", { lr: lr.info() });
}

/** OnLRColor: "" keeps the default (no tint, as in the C#); a colour tints both; "rainbow" cycles. */
function applyColor(lr: LastRequest): void {
  const color = lrColor({ prisoner: lr.prisoner.ref(), guard: lr.guard.ref(), color: "" });
  const parsed = parseColor(color);
  if (parsed === null) return;
  for (const p of [lr.prisoner, lr.guard]) {
    tinted.add(p.userId);
    if (parsed === RAINBOW) startRainbow(p.userId);
    else tintPlayer(p.userId, parsed);
  }
  lr.tell(forRecipients((recipient,value0) => parsed === RAINBOW ? msgFor(recipient).lrRainbow() : msgFor(recipient).lrColor(value0), hl(color)));
}

/** End an LR (C# `EndLastRequest`). Safe to call twice; the second call is ignored. */
export function endLastRequest(lr: LastRequest, result: LRResult): void {
  const i = active.indexOf(lr);
  if (i < 0) return;
  active.splice(i, 1);
  const info = lr.info();
  lr.state = "completed";

  for (const p of [lr.prisoner, lr.guard]) {
    if (tinted.delete(p.userId)) clearTint(p.userId);
  }

  if (result === "guard_win" || result === "prisoner_win") {
    addTimeCapped(settings.lrTimePerLR, settings.maxTimeForLR);
    broadcastText(forRecipients((recipient,value0,value1,value2,value3,value4) => msgFor(recipient).decided(value0, value1, value2, value3, value4), result,lr.prisoner.name,lr.guard.name,lr.prisoner.present,lr.guard.present));
  }
  log(...logEntry("JB_LOG_LR_BETWEEN_AND_ENDED", [String(lrName(lr.type)), String(lr.prisoner.name), String(lr.guard.name), String(result.replace("_", " "))], [0,3]));
  emit("OnLREnd", { lr: info, result });

  lr.onEnd(result);
  lr.dispose();
}

function endAll(result: LRResult): void {
  for (const lr of [...active]) endLastRequest(lr, result);
}

// ---------------------------------------------------------------------------------------------
// Game hooks
// ---------------------------------------------------------------------------------------------

/** player_death (C# `OnPlayerDeath`). */
export function onPlayerDeath(victimSlot: number): void {
  if (isWarmup()) return;
  const lr = getActiveLR(victimSlot);
  if (lr) {
    endLastRequest(lr, victimSlot === lr.prisoner.slot ? "guard_win" : "prisoner_win");
    return;
  }
  if (Player.fromSlot(victimSlot)?.teamNum !== Team.Prisoner) return;
  scheduleLRCheck();
}

/** A client left (C# `OnPlayerDisconnect`): their LR is lost, or LR may now turn on. */
export function onDisconnect(slot: number): void {
  configuring.delete(slot);
  if (isWarmup()) return;
  const lr = getActiveLR(slot);
  if (lr) {
    endLastRequest(lr, slot === lr.prisoner.slot ? "guard_win" : "prisoner_win");
    return;
  }
  if (enabled) return;
  scheduleLRCheck();
}

/** A participant switched teams mid-LR: nobody won. */
export function onTeamChange(slot: number): void {
  const lr = getActiveLR(slot);
  if (lr) endLastRequest(lr, "interrupted");
}

/** OnTakeDamage pre-hook (C# `ShouldBlockDamage`). */
export function onTakeDamage(info: DamageInfo): HookResultValue | void {
  if (!enabled || active.length === 0) return;
  const attacker = playerOfEntity(info.attacker);
  const victim = playerOfEntity(info.victim);
  if (!isReal(attacker) || !victim) return;
  const verdict = damageVerdict(getActiveLR(victim.slot)?.id ?? null, getActiveLR(attacker.slot)?.id ?? null);
  if (verdict === "allow") return;
  HintText.to(attacker.slot, verdict === "block_one_in_lr" ? msgFor(attacker.slot).damageBlockedInside : msgFor(attacker.slot).damageBlockedOtherLR);
  return HookResult.Handled;
}

/** CanAcquire pre-hook (C# `OnCanAcquire`): each LR may forbid pickups. */
export function onCanAcquire(view: CanAcquireView): HookResultValue | void {
  if (active.length === 0 || view.method !== AcquireMethod.PickUp) return;
  const p = view.player;
  if (!p) return;
  if (!active.some((lr) => lr.preventEquip(p.slot, view.defIndex))) return;
  view.result = AcquireResult.NotAllowedByProhibited;
  return HookResult.Handled;
}

/** A pawn dropped a weapon (C# `OnDrop`): tint it by team and tell the owner's LR. */
export function onWeaponDrop(owner: Player, weaponRef: EntityRef | null): void {
  const lr = getActiveLR(owner.slot);
  if (!lr) return;
  const weapon = Weapon.fromEntity(weaponRef);
  if (!weapon || !weapon.isValid()) return;
  weapon.render = packColor32(owner.teamNum === Team.Guard ? Colors.Blue : Colors.Red);
  lr.onWeaponDrop(owner.slot, weapon);
}

export function onWeaponFire(slot: number): void {
  getActiveLR(slot)?.onWeaponFire(slot);
}

export function onFrame(): void {
  for (const lr of active) lr.onFrame();
}

// ---------------------------------------------------------------------------------------------
// Round lifecycle
// ---------------------------------------------------------------------------------------------

/** Core's OnRoundStart (C# `OnRoundStart`). */
export function onRoundStart(): void {
  enabled = false;
  closeAllMenus();
  endAll("timed_out");
  configuring.clear();
  setDefaultWinner(2);
}

/** Core's OnRoundEnd (C# `OnRoundEnd`). */
export function onRoundEnd(): void {
  endAll("timed_out");
  enabled = false;
}

/**
 * A special day took the round: running LRs end as "interrupted" and LR turns off. Not latched —
 * LR simply cannot claim the mode while the day holds it, and may start if it returns to "normal".
 */
export function onModeTaken(): void {
  if (enabled || active.length > 0) log(...logEntry("JB_LOG_LAST_REQUEST_DISABLED_THE_ROUND_MODE_WAS_TAKEN", []));
  enabled = false;
  endAll("interrupted");
}

/** The round mode came back to "normal" from a special day: re-run the "few prisoners left" check. */
export function onModeReturned(): void {
  if (!enabled) scheduleLRCheck();
}

/** Plugin unload: end everything quietly. */
export function shutdown(): void {
  endAll("interrupted");
  enabled = false;
}
