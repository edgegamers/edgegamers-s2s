import { localizedChat as Chat } from "@edgegamers/jailbreak-shared";
/** `jointeam` handling and round start/end balancing (CTBans listeners). */
import { Commands, HookResult, Server } from "@s2script/sdk";
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
import { clearQueue, fillGuards, leaveQueue, queue, resetRoundRestarts, trimGuards } from "./queueing";
import { guardsToAdd, guardsToRemove } from "./ratio";
import { atLeast } from "./ranks";

/** Playing humans, including clients whose SteamID has not been verified yet. */
function playingHumans(): Player[] {
  return Player.allConnected().filter(p => isRealClient(p.slot)
    && (p.teamNum === Team.Prisoner || p.teamNum === Team.Guard));
}

/** Playing humans on `team`, counting unverified clients too, so every prisoner counts toward the ratio. */
function playingOn(team: number): number {
  return playingHumans().filter(p => p.teamNum === team).length;
}

/** Players who asked for CT while waiting for an opponent. Nobody is moved to CT without asking. */
const ctRequests = new Set<string>();

/** The engine's own balancer moves prisoners to CT whenever T outnumbers CT; jailbreak teams never are even. */
export function disableEngineBalance(): void {
  Server.command("mp_autoteambalance 0");
  Server.command("mp_limitteams 0");
}

export function forgetPlayer(steamId: string): void {
  ctRequests.delete(steamId);
}

function joinAndSpawn(p: Player, team: number): void {
  if (p.teamNum !== team) p.changeTeam(team);
  if (p.teamNum === team && p.pawnIsAlive !== true) p.respawn();
}

/** Establish the first opposing pair without waiting for a round that needs both teams to start. */
export function balanceStartingTeams(preferredSteamId?: string): void {
  if (isSpecialDayRound()) return;
  const players = playingHumans();
  if (players.length === 1) {
    joinAndSpawn(players[0]!, Team.Prisoner);
    return;
  }
  if (players.length !== 2) return;
  const guards = players.filter(p => p.teamNum === Team.Guard);
  if (guards.length === 1) return;
  // Only a player who asked for CT (team menu or !guard) may become the first guard.
  const eligible = (p: Player): boolean => p.steamId !== "0" && entry(p.steamId)?.loaded === true
    && !activeBan(p.steamId) && (ctRequests.has(p.steamId) || queue.has(p.steamId));
  const guard = guards[0] ?? players.find(p => p.steamId === preferredSteamId && eligible(p))
    ?? players.find(eligible);
  if (!guard) return; // Nobody asked for CT, their ban records are pending, or they may not guard.
  // Keep a prisoner present before moving the guard, so the engine can commence normally.
  for (const p of players) if (p.slot !== guard.slot) joinAndSpawn(p, Team.Prisoner);
  ctRequests.delete(guard.steamId);
  leaveQueue(guard.steamId);
  joinAndSpawn(guard, Team.Guard);
}

export function onJoinTeam(slot: number, team: number | string): HookResultValue {
  if (!isRealClient(slot)) return HookResult.Continue; // bots (and invalid slots) only
  const p = Player.fromSlot(slot);
  if (!p) return HookResult.Continue;
  const req = parseJoinTeam(String(team));
  if (req === "ct" && p.steamId !== "0") ctRequests.add(p.steamId);
  else ctRequests.delete(p.steamId);
  if (req === "spec") {
    leaveQueue(p.steamId);
    return HookResult.Continue;
  }
  const playing = playingHumans();
  const others = playing.filter(other => other.slot !== slot);
  const joining = p.teamNum !== Team.Prisoner && p.teamNum !== Team.Guard;
  if (!isSpecialDayRound() && (others.length === 0 || (others.length === 1
    && (joining || ctEmpty() || !playing.some(other => other.teamNum === Team.Prisoner))))) {
    // Intercepted joins do not run the engine's spawn path. Spawn while waiting, then seed CT.
    if (p.teamNum !== Team.Prisoner) p.changeTeam(Team.Prisoner);
    balanceStartingTeams(p.steamId);
    if (p.teamNum === Team.Prisoner) joinAndSpawn(p, Team.Prisoner);
    if (req === "ct" && p.steamId === "0") Chat.toSlot(slot, msg.guardUnverified());
    return HookResult.Stop;
  }
  if (req === "ct" && p.steamId === "0") {
    // Unverified: no ban/priority can be checked, so never CT.
    if (p.teamNum !== Team.Prisoner) p.changeTeam(Team.Prisoner);
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
  if (p.teamNum === Team.Guard) return HookResult.Stop;
  // Empty CT: join and spawn now, once the player's ban state is known (loaded) and clean.
  if (ctEmpty() && entry(p.steamId)?.loaded === true && !activeBan(p.steamId)) {
    leaveQueue(p.steamId);
    p.changeTeam(Team.Guard);
    if (p.teamNum === Team.Guard) p.respawn();
    return HookResult.Stop;
  }
  // Otherwise the !guard logic decides (banned → reminder, not loaded → "priority unavailable").
  if (p.teamNum !== Team.Prisoner) p.changeTeam(Team.Prisoner);
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

function isSpecialDayRound(): boolean {
  return specialDayThisRound || getRound().mode === "specialday";
}

/** Core OnModeChanged: remember that a special day ran this round (it may hand the mode back to normal). */
export function noteModeChanged(mode: string): void {
  if (mode === "specialday") specialDayThisRound = true;
}

/** Core OnRoundStart: bans, minimum priority, then fill CT from the queue. */
export function roundStart(): void {
  specialDayThisRound = false;
  resetRoundRestarts();
  enforceBans();
  if (playingHumans().length <= 2) {
    balanceStartingTeams();
    return;
  }
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
  // Only queued volunteers are moved to CT; with an empty queue CT stays short.
  const add = guardsToAdd(playingOn(Team.Prisoner), playingOn(Team.Guard), s.ratio);
  if (add > 0 && !fillGuards(add)) broadcast(msg.queueEmptyBroadcast());
}

/**
 * Core OnRoundEnd: bans always. Unless this round was a special day, move guards back to T only when
 * prisoners have left and CT now breaks the ratio. Prisoners are never moved to CT here.
 */
export function roundEnd(): void {
  enforceBans();
  if (isSpecialDayRound()) return;
  const remove = guardsToRemove(playingOn(Team.Prisoner), playingOn(Team.Guard), settings().ratio);
  if (remove > 0) trimGuards(remove);
}

export function mapStart(): void {
  specialDayThisRound = false;
  ctRequests.clear();
  disableEngineBalance();
  clearQueue();
}

export function isLiveRound(): boolean {
  return GameRules.get()?.warmupPeriod !== true;
}
