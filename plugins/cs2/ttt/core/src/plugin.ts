import { plugin } from "@s2script/sdk/plugin";
import { config } from "@s2script/sdk/config";
import type { BlackboxApi } from "@edgegamers/blackbox";
import type { TttCoreApi, TttEvents } from "../api";
import { createTttCoreApi } from "./api.ts";
import { createBodyRegistry } from "./cs2/bodies.ts";
import { installCoreHandlers } from "./cs2/handlers.ts";
import { applyServerSettings, seedPlayers } from "./cs2/pawn.ts";
import { registerCoreCommands } from "./commands.ts";
import { createCoreConfigSnapshot } from "./config.ts";
import { TttEventBus, TttPriority } from "./events.ts";
import { message } from "./messages.ts";
import { createPlayerRegistry } from "./players.ts";
import { createPreFrameQueue } from "./preframe.ts";
import { createRoleRegistry } from "./roles.ts";
import { createRoundController } from "./round.ts";
import { createTttRuntime } from "./runtime.ts";

export default plugin((ctx) => {
  const blackbox = ctx.use<BlackboxApi>("@edgegamers/blackbox");
  const bus = new TttEventBus<TttEvents>();
  const roles = createRoleRegistry();
  roles.registerDefaults();
  const round = createRoundController(roles);
  const players = createPlayerRegistry(roles);
  const bodies = createBodyRegistry();
  let settings = createCoreConfigSnapshot(config);
  const runtime = createTttRuntime({ bus, roles, players, round, config: () => settings });
  const preFrame = createPreFrameQueue((slot) => ({
    steamId: players.steamIdOf(slot),
    generation: players.generationOf(slot),
  }));
  const playerName = players.nameOf;
  const api = createTttCoreApi({
    blackbox,
    bus,
    roles,
    round,
    playerName,
    players,
    startRound: runtime.startRound,
    endRound: runtime.endRound,
    setRoundDeadline: runtime.setRoundDeadline,
  });
  ctx.publish<TttCoreApi>("@edgegamers/ttt-core", api);

  seedPlayers(players);
  applyServerSettings();
  ctx.config.onChange(() => { settings = createCoreConfigSnapshot(config); });
  bus.on("gameState", (event) => {
    if (event.state === "in_progress") bodies.clear();
  }, { priority: TttPriority.HIGHEST });
  bus.on("roleAssigned", (event) => {
    api.log({ kind: "role", message: `${players.nameOf(event.slot)} was assigned ${event.role}`, actorSlot: event.slot });
  }, { priority: TttPriority.MONITOR });
  bus.on("death", (event) => {
    api.log({
      kind: "death",
      message: `${players.nameOf(event.slot)} died`,
      actorSlot: event.killer >= 0 ? event.killer : undefined,
      targetSlot: event.slot,
      data: { weapon: event.weapon, headshot: event.headshot },
    });
  }, { priority: TttPriority.MONITOR });
  bus.on("damage", (event) => {
    api.log({
      kind: "damage",
      message: `${players.nameOf(event.attacker)} damaged ${players.nameOf(event.slot)}`,
      actorSlot: event.attacker >= 0 ? event.attacker : undefined,
      targetSlot: event.slot,
      data: { damage: event.damage, weapon: event.weapon },
      coalesceKey: `${event.attacker}:${event.slot}:${event.weapon}`,
    });
  }, { priority: TttPriority.MONITOR, ignoreCanceled: true });

  installCoreHandlers(ctx, {
    bus,
    players,
    roles,
    round,
    runtime,
    bodies,
    config: () => settings,
    drainPreFrame: () => { preFrame.drain(); },
  });
  registerCoreCommands(ctx.commands, { api, runtime, roles, players });
  console.log(message("loaded"));

  return {
    onUnload() {
      preFrame.bumpMapEpoch();
      bodies.clear();
      players.clear();
      bus.clear();
    },
  };
});
