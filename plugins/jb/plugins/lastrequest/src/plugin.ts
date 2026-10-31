import {loadMessages} from './messages';
/**
 * @edgegamers/jailbreak-lastrequest — last requests (8 games), LR rebel and last guard. Wiring only: the logic
 * lives in manager.ts (LR), lr-command.ts (!lr), lr-rebel.ts (!rebel), lastguard.ts, debug.ts.
 */
import {
  ADMFLAG,
  command,
  config,
  Entity,
  every,
  HookResult,
  publish,
  SDKHook,
  SDKHookType,
  SDKUnhook,
  use,
} from "@s2script/sdk";
import type { Client, EntityRef } from "@s2script/sdk";
import { Events, items, Player } from "@s2script/cs2";
import { Team } from "@edgegamers/jailbreak-shared";
import type { LRInfo } from "../api";
import { clearAllEffects, tickEffects } from "./fx";
import { bindForwardHandle } from "./forwards";
import * as lastGuard from "./lastguard";
import { endRaceCommand, lrCommand, openLRFor } from "./lr-command";
import * as rebel from "./lr-rebel";
import * as lr from "./manager";
import { lgDebugCommand, lrDebugCommand } from "./debug";
import { playerOfEntity } from "./players";
import { loadSettings } from "./settings";

export function OnPluginStart(): void {
  loadMessages();
  loadSettings();
  config.onChange(() => loadSettings());

  bindForwardHandle(
    publish("@edgegamers/jailbreak-lastrequest", {
      isEnabled: (): boolean => lr.isEnabled(),
      isInLR: (slot: number): boolean => lr.isInLR(slot),
      getActiveLRs: (): LRInfo[] => lr.activeInfos(),
      isLastGuardActive: (): boolean => lastGuard.isLastGuardActive(),
    }),
  );

  lr.bridge.lastGuardActive = lastGuard.isLastGuardActive;
  lr.bridge.openLR = openLRFor;

  // --- core round lifecycle -------------------------------------------------------------------
  const core = use("@edgegamers/jailbreak-core");
  core.on("OnRoundStart", () => {
    lr.onRoundStart();
    lastGuard.onRoundStart();
    clearAllEffects();
  });
  // C# RebelListener: hurting a guard while in an LR never makes a prisoner a rebel.
  core.on("OnRebelRequested", (ev) =>
    ev.reason === "damage" && lr.isInLR(ev.player.slot) ? HookResult.Handled : HookResult.Continue,
  );
  core.on("OnRoundEnd", () => {
    lr.onRoundEnd();
    lastGuard.onRoundEnd();
    rebel.reset();
  });
  // The round a special day claimed the mode in: core's round-start reset also reports
  // "specialday" -> "normal" (with the NEW round number), which must not trigger an LR check.
  let specialDayRound = -1;
  core.on("OnModeChanged", (ev) => {
    // Only a special day can take the round from us (LR/LG hand over between themselves).
    if (ev.mode === "specialday") {
      specialDayRound = ev.round;
      // Running LRs end; LR is not latched off (it can't claim the mode while the day holds it,
      // and is re-checked if the day hands the mode back). Last guard IS off for the round: no
      // C# special day except Warday allowed it, and Warday never hands the mode back.
      lr.onModeTaken();
      lastGuard.disableForRound();
    } else if (ev.mode === "normal" && ev.previous === "specialday" && ev.round === specialDayRound) {
      // Custom / Bunny Hop give the mode back right after setup: LR may turn on later.
      lr.onModeReturned();
    }
  });

  // --- commands -------------------------------------------------------------------------------
  command("sm_lr", (cmd) => {
    lrCommand(cmd);
    return HookResult.Handled;
  });
  command("sm_lastrequest", (cmd) => {
    lrCommand(cmd);
    return HookResult.Handled;
  });
  command("sm_rebel", (cmd) => {
    rebel.rebelCommand(cmd);
    return HookResult.Handled;
  });
  command("sm_endrace", (cmd) => {
    endRaceCommand(cmd);
    return HookResult.Handled;
  });
  command.admin("sm_lrdebug", ADMFLAG.ROOT, (cmd) => {
    lrDebugCommand(cmd);
    return HookResult.Handled;
  });
  command.admin("sm_lgdebug", ADMFLAG.ROOT, (cmd) => {
    lgDebugCommand(cmd);
    return HookResult.Handled;
  });

  // --- game events ----------------------------------------------------------------------------
  Events.on("player_death", (ev) => {
    const victim = ev.getPlayerSlot("userid");
    if (victim < 0) return;
    const team = Player.fromSlot(victim)?.teamNum ?? 0;
    lr.onPlayerDeath(victim);
    lastGuard.onPlayerDeath(victim, team);
  });
  Events.on("player_team", (ev) => {
    const slot = ev.getPlayerSlot("userid");
    if (slot >= 0) lr.onTeamChange(slot);
  });
  Events.on("weapon_fire", (ev) => {
    const slot = ev.getPlayerSlot("userid");
    if (slot >= 0) lr.onWeaponFire(slot);
  });
  Events.on("player_spawn", (ev) => {
    const pawn = Player.fromSlot(ev.getPlayerSlot("userid"))?.pawn;
    if (pawn) hookDrops(pawn.ref);
  });

  items.onCanAcquire((view) => lr.onCanAcquire(view));

  // Damage rules: every player pawn, now and as they are created.
  for (const pawn of Entity.findByClass("player")) SDKHook(pawn, SDKHookType.OnTakeDamage, lr.onTakeDamage);
  for (const p of Player.all()) if (p.pawn) hookDrops(p.pawn.ref);

  every(100, tickEffects);
}

/** WeaponDropPost on a pawn (re-hooked on every spawn; unhook first so it never doubles). */
function hookDrops(pawn: EntityRef): void {
  SDKUnhook(pawn, SDKHookType.WeaponDropPost, onDrop);
  SDKHook(pawn, SDKHookType.WeaponDropPost, onDrop);
}

function onDrop(entity: EntityRef, weapon: EntityRef | null): void {
  const owner = playerOfEntity(entity);
  if (!owner) return;
  lr.onWeaponDrop(owner, weapon);
  if (owner.teamNum === Team.Prisoner) rebel.onWeaponDrop(owner);
}

export function OnEntityCreated(entity: EntityRef | null, className: string): void {
  if (!entity || className !== "player") return;
  SDKHook(entity, SDKHookType.OnTakeDamage, lr.onTakeDamage);
}

export function OnGameFrame(): void {
  lr.onFrame();
}

export function OnClientDisconnect(client: Client): void {
  lr.onDisconnect(client.slot);
  rebel.onDisconnect(client.slot);
  lastGuard.onDisconnect(client.slot);
}

export function OnPluginEnd(): void {
  lr.shutdown();
  clearAllEffects();
}
