/**
 * The publish handle and the player helpers every feature file shares. `plugin.ts` sets the
 * handle once in OnPluginStart; until then emits are dropped (nothing can be subscribed yet).
 */
import type { TypedPublishHandle } from "@s2script/sdk";
import { Player } from "@s2script/cs2";
import { teamName } from "@edgegamers/jailbreak-shared";
import type { Contract, PlayerRef, TeamName } from "../api";

let handle: TypedPublishHandle<Contract> | null = null;

export function setHandle(h: TypedPublishHandle<Contract>): void {
  handle = h;
}

export function bus(): TypedPublishHandle<Contract> | null {
  return handle;
}

/** A copied, wire-safe reference to a player. */
export function refOf(p: Player): PlayerRef {
  return { slot: p.slot, userId: p.userId, steamId: p.steamId, name: p.playerName ?? "" };
}

export function teamOf(slot: number): TeamName {
  return teamName(Player.fromSlot(slot)?.teamNum);
}

/** The player whose pawn (or controller) is entity `index`, or null. */
export function playerByEntityIndex(index: number): Player | null {
  for (const p of Player.all()) {
    if (p.ref.index === index) return p;
    const pawn = p.pawn;
    if (pawn && pawn.ref.index === index) return p;
  }
  return null;
}
