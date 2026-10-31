/** `jointeam` handling and round start/end balancing (CTBans listeners). */
import { Chat, Commands, HookResult } from "@s2script/sdk";
import type { HookResultValue } from "@s2script/sdk";
import { GameRules, Player } from "@s2script/cs2";
import { Team } from "@edgegamers/jailbreak-shared";
import { getRound } from "@edgegamers/jailbreak-core";
import { activeBan, remind } from "./ctbans";
import { settings } from "./config";
import { broadcast, ctEmpty, humans, isRealClient } from "./env";
import { msg } from "./messages";
import { capOfSlot, entry, rankOfSlot } from "./players";
import { parseJoinTeam } from "./queue";
import { clearQueue, fillGuards, leaveQueue, resetRoundRestarts, trimGuards } from "./queueing";
import { guardsToAdd, guardsToRemove } from "./ratio";
import { atLeast } from "./ranks";

export function onJoinTeam(slot: number, argString: string): HookResultValue {
  if (!isRealClient(slot)) return HookResult.Continue; // bots (and invalid slots) only
  const p = Player.fromSlot(slot);
  if (!p) return HookResult.Continue;
  const req = parseJoinTeam(argString);
  if (req === "ct" && p.steamId === "0") {
    // Unverified: no ban/priority can be checked, so never CT.
    p.changeTeam(Team.Prisoner);
    Chat.toSlot(slot, msg.guardUnverified());
    return HookResult.Stop;
  }
  if (req === "auto") {
    p.changeTeam(Team.Prisoner);
    return HookResult.Stop;
  }
  if (req === "t") {
    const alive = p.pawnIsAlive === true;
    p.changeTeam(Team.Prisoner);
    return alive ? HookResult.Stop : HookResult.Continue;
  }
  if (req === "spec") {
    leaveQueue(p.steamId);
    return HookResult.Continue;
  }
  if (p.teamNum === Team.Guard) return HookResult.Stop;
  // Empty CT: join directly, but only once the player's ban state is known (loaded) and clean.
  if (ctEmpty() && entry(p.steamId)?.loaded === true && !activeBan(p.steamId)) {
    leaveQueue(p.steamId);
    return HookResult.Continue;
  }
  // Otherwise the !guard logic decides (banned → reminder, not loaded → "priority unavailable").
  p.changeTeam(Team.Prisoner);
  Commands.dispatch("sm_guard", slot, "", "chat");
  return HookResult.Stop;
}

function enforceBans(): void {
  for (const p of humans(Team.Guard)) {
    const ban = activeBan(p.steamId);
    if (!ban) continue;
    remind(p.slot, ban);
    p.changeTeam(Team.Prisoner);
  }
}

let specialDayThisRound = false;

/** Core OnModeChanged: remember that a special day ran this round (it may hand the mode back to normal). */
export function noteModeChanged(mode: string): void {
  if (mode === "specialday") specialDayThisRound = true;
}

/** Core OnRoundStart: bans, minimum priority, then fill CT from the queue. */
export function roundStart(): void {
  specialDayThisRound = false;
  resetRoundRestarts();
  enforceBans();
  const s = settings();
  for (const p of humans(Team.Guard)) {
    if (atLeast(rankOfSlot(p.slot), "eg")) continue;
    const e = entry(p.steamId);
    if (!e?.loaded) continue; // not loaded (DB down / still loading) → don't punish
    const prio = Math.min(e.priority ?? 0, capOfSlot(p.slot));
    if (prio >= s.minPriority) continue;
    p.changeTeam(Team.Prisoner);
    Chat.toSlot(p.slot, msg.guardInsufficient(prio, s.minPriority));
  }
  const add = guardsToAdd(humans(Team.Prisoner).length, humans(Team.Guard).length, s.ratio);
  if (add > 0 && !fillGuards(add)) broadcast(msg.queueEmptyBroadcast());
}

/** Core OnRoundEnd: bans always; ratio trim unless this round was a special day. */
export function roundEnd(): void {
  enforceBans();
  if (specialDayThisRound || getRound().mode === "specialday") return;
  const remove = guardsToRemove(humans(Team.Prisoner).length, humans(Team.Guard).length, settings().ratio);
  if (remove > 0) trimGuards(remove);
}

export function mapStart(): void {
  clearQueue();
}

export function isLiveRound(): boolean {
  return GameRules.get()?.warmupPeriod !== true;
}
