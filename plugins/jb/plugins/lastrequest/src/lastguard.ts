/**
 * Last guard (C# `LastGuard`): when the second-to-last guard dies, the remaining guard faces every
 * prisoner alone. They get HP pooled from the prisoners, everyone is beaconed, every prisoner
 * becomes a rebel, and the round clock is reset. Each prisoner death adds time and hands a
 * glock to a random unarmed prisoner. Never starts once LR is on, and needs core's "lastguard" mode.
 */
import { after, Chat } from "@s2script/sdk";
import { HintText, Player } from "@s2script/cs2";
import { Colors, isAlive, Team } from "@edgegamers/jailbreak-shared";
import { log, markRebel } from "@edgegamers/jailbreak-core";
import { isGunDef, lastGuardHealth, pooledHealth } from "./logic";
import { stopAllBeacons, startBeacon } from "./fx";
import { emit } from "./forwards";
import { isEnabled as isLREnabled } from "./manager";
import { msg } from "./messages";
import { Participant } from "./players";
import { addTimeCapped, claimMode, setTimeRemaining } from "./round";
import { settings } from "./settings";

let active = false;
let canStart = false;
/** Latched by a special day for the rest of the round (survives the delayed canStart check below). */
let disabledForRound = false;
let guard: Participant | null = null;
let startPrisoners = 0;
let endEmitted = false;
/** userIds of prisoners still eligible for a free glock. */
let prisoners: number[] = [];

export const isLastGuardActive = (): boolean => active;

const aliveOn = (team: number): Player[] => Player.all().filter((p) => p.teamNum === team && isAlive(p));

/** Core's OnRoundStart: decide (a moment later, once everyone spawned) whether LG may happen. */
export function onRoundStart(): void {
  active = false;
  canStart = false;
  disabledForRound = false;
  guard = null;
  prisoners = [];
  endEmitted = false;
  stopAllBeacons();
  after(250, () => {
    canStart = !disabledForRound && aliveOn(Team.Guard).length >= settings.lgMinCts;
  });
}

/** Core's OnRoundEnd. */
export function onRoundEnd(): void {
  if (active && guard) finish(guard.alive ? "guard_win" : "prisoner_win");
  active = false;
  canStart = false;
  stopAllBeacons();
}

/** Special day / admin: no last guard this round. */
export function disableForRound(): void {
  disabledForRound = true;
  canStart = false;
}

function finish(result: "guard_win" | "prisoner_win"): void {
  if (endEmitted || !guard) return;
  endEmitted = true;
  log(`Last guard ${guard.name} ${result === "guard_win" ? "survived" : "was killed"}`);
  emit("OnLastGuardEnd", { guard: guard.ref(), result });
}

/** player_death (C# `OnPlayerDeathEvent`). */
export function onPlayerDeath(victimSlot: number, victimTeam: number): void {
  checkLastGuard(victimSlot, victimTeam);
  if (!active) return;
  if (guard && victimSlot === guard.slot) {
    finish("prisoner_win");
    return;
  }
  if (victimTeam !== Team.Prisoner) return;
  addTimeCapped(settings.lgTimePerKill, settings.lgTimeMax);
  giveGun(victimSlot);
}

export function onDisconnect(slot: number): void {
  checkLastGuard(slot, null);
}

/** `poiTeam` null = unknown (disconnect). */
function checkLastGuard(poiSlot: number, poiTeam: number | null): void {
  if (active) return;
  const poi = Player.fromSlot(poiSlot);
  if (poi) prisoners = prisoners.filter((id) => id !== poi.userId);
  if (poiTeam !== null && poiTeam !== Team.Guard) return;
  const guards = aliveOn(Team.Guard).filter((p) => p.slot !== poiSlot);
  if (guards.length !== 1 || isLREnabled()) return;
  if (canStart && settings.lgTimeBase !== 0) startLastGuard(guards[0]);
}

/** C# `StartLastGuard`. Returns false if the guard has no pawn or the round mode is taken. */
export function startLastGuard(lastGuard: Player): boolean {
  const pawn = lastGuard.pawn;
  if (!pawn || !pawn.isValid) return false;
  if (!claimMode("lastguard")) {
    canStart = false;
    return false;
  }
  active = true;
  endEmitted = false;
  guard = Participant.of(lastGuard);

  const ts = aliveOn(Team.Prisoner);
  const calculated = pooledHealth(
    ts.map((p) => p.pawn?.health ?? 0),
    settings.lgTMaxHp,
    settings.lgCtHpRatio,
  );
  const newHp = lastGuardHealth(calculated, pawn.health ?? 0, settings.lgApplyLowerHp, settings.lgMaxHp);
  if (newHp !== null) guard.setHealth(newHp);

  startBeacon(guard.userId, Colors.Blue);
  prisoners = ts.map((p) => p.userId);
  startPrisoners = ts.length;

  if (settings.lgTimeBase !== 0) setTimeRemaining(Math.min(settings.lgTimeBase, settings.lgTimeMax));
  addTimeCapped(settings.lgTimePerPrisoner * ts.length, settings.lgTimeMax);

  const ctHealth = pawn.health ?? 0;
  const tHealth = ts.reduce((sum, p) => sum + (p.pawn?.health ?? 0), 0);
  for (const line of msg.lgStartedChat(guard.name, ctHealth, tHealth)) Chat.toAll(line);
  for (const p of Player.all()) HintText.to(p.slot, msg.lgStartedCenter(guard.name, ctHealth, tHealth));

  for (const p of ts) {
    startBeacon(p.userId, Colors.Red);
    markRebel(p.slot, 0, "lastguard");
    if (settings.lgTWeapon !== "") p.pawn?.giveNamedItem(settings.lgTWeapon);
  }

  log(`Last guard started: ${guard.name} (${ctHealth} HP) vs ${ts.length} prisoner(s) (${tHealth} HP)`);
  emit("OnLastGuardStart", { guard: guard.ref(), prisoners: startPrisoners });
  return true;
}

function hasGun(p: Player): boolean {
  return (p.pawn?.weapons ?? []).some((w) => isGunDef(w.attributeManager.item.itemDefinitionIndex ?? -1));
}

/** A prisoner died: a random living, unarmed prisoner gets a glock (C# `giveGun`). */
function giveGun(deadSlot: number): void {
  const eligible = prisoners
    .map((id) => Player.fromUserId(id))
    .filter((p): p is Player => !!p && isAlive(p) && p.slot !== deadSlot && !hasGun(p));
  prisoners = eligible.map((p) => p.userId);
  if (eligible.length === 0) return;
  const lucky = eligible[Math.floor(Math.random() * eligible.length)];
  lucky.pawn?.giveNamedItem("weapon_glock");
  prisoners = prisoners.filter((id) => id !== lucky.userId);
}
