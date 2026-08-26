import type { PluginContext } from "@s2script/sdk/plugin";
import type { TttEvents } from "../../api";
import type { TttCoreConfig } from "../config.ts";
import type { TttEventBus } from "../events.ts";
import type { PlayerRegistry } from "../players.ts";
import type { RoleRegistry } from "../roles.ts";
import type { RoundController } from "../round.ts";
import type { TttRuntime } from "../runtime.ts";
import type { BodyRegistry } from "./bodies.ts";
import { createCombatRuntime } from "./combat.ts";
import { applyServerSettings, seedPlayers } from "./pawn.ts";

export function installCoreHandlers(ctx: PluginContext, deps: {
  bus: TttEventBus<TttEvents>;
  players: PlayerRegistry;
  roles: RoleRegistry;
  round: RoundController;
  runtime: TttRuntime;
  bodies: BodyRegistry;
  config(): TttCoreConfig;
  drainPreFrame(): void;
}): void {
  const combat = createCombatRuntime(deps);

  ctx.clients.onActive((client) => {
    deps.players.add(client.slot, client.steamId, client.name);
    deps.bus.emit("join", { slot: client.slot });
  });

  ctx.clients.onDisconnect((client) => {
    deps.bus.emit("leave", { slot: client.slot });
    if (deps.players.isAlive(client.slot)) deps.runtime.handleDeath(client.slot);
    deps.players.remove(client.slot);
  });

  ctx.events.on("player_spawn", (event) => {
    const slot = event.getPlayerSlot("userid");
    if (slot < 0 || !deps.players.isParticipating(slot)) return;
    deps.players.setAlive(slot, true);
    deps.round.setAlive(slot, true);
  });

  ctx.events.on("player_death", (event) => {
    const slot = event.getPlayerSlot("userid");
    if (slot < 0) return;
    combat.death(
      slot,
      event.getPlayerSlot("attacker"),
      event.getPlayerSlot("assister"),
      event.getString("weapon"),
      event.getBool("headshot"),
    );
  });

  ctx.events.on("player_hurt", (event) => {
    const slot = event.getPlayerSlot("userid");
    if (slot < 0) return;
    combat.damage(
      slot,
      event.getPlayerSlot("attacker"),
      event.getInt("dmg_health"),
      event.getString("weapon"),
    );
  });

  ctx.events.on("round_start", applyServerSettings);
  ctx.server.onMapStart(() => {
    deps.players.clear();
    deps.bodies.clear();
    deps.round.resetRound();
    seedPlayers(deps.players);
    applyServerSettings();
  });

  ctx.server.onGameFrame(() => {
    deps.drainPreFrame();
    deps.runtime.tick();
    if (
      deps.round.snapshot().state === "waiting" &&
      deps.players.playerCount() >= deps.config().minPlayers
    ) {
      deps.runtime.startRound();
    }
  });
}
