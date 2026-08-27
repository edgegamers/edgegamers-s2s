import { Clients } from "@s2script/sdk/clients";
import { Server } from "@s2script/sdk/server";
import type { PlayerRegistry } from "../players.ts";

export function seedPlayers(players: PlayerRegistry): void {
  for (const client of Clients.all()) players.add(client.slot, client.steamId, client.name);
}

export function playerName(slot: number): string {
  return Clients.fromSlot(slot)?.name ?? "";
}

export function applyServerSettings(): void {
  const commands = [
    "mp_autokick 0",
    "mp_disable_autokick 1",
    "mp_teammates_are_enemies 1",
    "mp_friendlyfire 1",
    "mp_halftime 0",
    "mp_maxrounds 0",
    "mp_match_can_clinch 0",
    "mp_autoteambalance 0",
    "mp_limitteams 0",
    "sv_alltalk 1",
    "sv_voicecodec vaudio_steam",
    "sv_parallel_packentities 0",
    "sv_parallel_sendsnapshot 0",
    "sv_enable_alternate_baselines 0",
  ];
  for (const command of commands) Server.command(command);
}
