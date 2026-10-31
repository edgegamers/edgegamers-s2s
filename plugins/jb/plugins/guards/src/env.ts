/** Runtime helpers: publisher, player refs, humans per team, empty-CT check, chat by SteamID. */
import { Chat, Clients } from "@s2script/sdk";
import type { TypedPublishHandle } from "@s2script/sdk";
import { Player } from "@s2script/cs2";
import { nowSeconds, Team } from "@edgegamers/jailbreak-shared";
import type { Contract, PlayerRef } from "../api";

let publisher: TypedPublishHandle<Contract> | null = null;

export function setPublisher(h: TypedPublishHandle<Contract>): void {
  publisher = h;
}

export function pub(): TypedPublishHandle<Contract> | null {
  return publisher;
}

export function now(): number {
  return nowSeconds();
}

export function playerRef(slot: number): PlayerRef | null {
  const p = Player.fromSlot(slot);
  if (!p) return null;
  return { slot, userId: p.userId, steamId: p.steamId, name: p.playerName ?? "" };
}

/** A connected, non-bot client with a real SteamID. */
export function isHuman(slot: number): boolean {
  const c = Clients.fromSlot(slot);
  return !!c && c.isValid() && !c.isBot && c.steamId !== "0";
}

/** A connected, non-bot client, verified or not (SteamID may still be "0"). */
export function isRealClient(slot: number): boolean {
  const c = Clients.fromSlot(slot);
  return !!c && c.isValid() && !c.isBot;
}

/**
 * True when no real player is on CT. Unverified (SteamID "0") non-bots on CT count as guards; bots do
 * not (they never guard on their own). Shared by the team menu and `!guard`.
 */
export function ctEmpty(): boolean {
  return !Player.allConnected().some((p) => p.teamNum === Team.Guard && isRealClient(p.slot));
}

/** Connected humans on `team` (Team.Prisoner = 2, Team.Guard = 3). */
export function humans(team: number): Player[] {
  return Player.allConnected().filter((p) => p.teamNum === team && isHuman(p.slot));
}

export function playerBySteam(steamId: string): Player | null {
  return Player.allConnected().find((p) => p.steamId === steamId) ?? null;
}

export function broadcast(line: string | ((slot:number)=>string)): void {
  if(typeof line==='string')Chat.toAll(line);
  else for(const p of Player.allConnected())Chat.toSlot(p.slot,line(p.slot));
}

export function toSteam(steamId: string, line: string | ((slot:number)=>string)): void {
  const p = playerBySteam(steamId);
  if (p) Chat.toSlot(p.slot, typeof line==='function'?line(p.slot):line);
}
