import type { BlackboxApi, BlackboxChannel } from "@edgegamers/blackbox";
import type {
  TttCoreApi,
  TttCoreForwards,
  TttEvents,
  TttLogEntry,
  TttStartRoundOptions,
  TttTeamKey,
} from "../api";
import type { TttCoreConfig } from "./config.ts";
import type { BodyRegistry } from "./cs2/bodies.ts";
import { startingLoadout, type InventoryAdapter } from "./cs2/inventory.ts";
import { identifyBody as identifyRegisteredBody } from "./cs2/interact.ts";
import { TttPriority, type TttEventBus } from "./events.ts";
import type { PlayerRegistry } from "./players.ts";
import type { RoleRegistry } from "./roles.ts";
import type { RoundController } from "./round.ts";

export function createTttCoreApi(deps: {
  blackbox: BlackboxApi;
  bus: TttEventBus<TttEvents>;
  roles: RoleRegistry;
  round: RoundController;
  playerName(slot: number): string;
  players?: PlayerRegistry;
  bodies?: BodyRegistry;
  inventory?: InventoryAdapter;
  config?: TttCoreConfig | (() => TttCoreConfig);
  startRound?(options?: TttStartRoundOptions): boolean;
  endRound?(winner: TttTeamKey | "", reason?: string): boolean;
  setRoundDeadline?(seconds: number): void;
  extendRoundDeadline?(seconds: number, maxRemaining: number): number;
  emitForward?<K extends keyof TttCoreForwards>(event: K, payload: TttCoreForwards[K]): void;
}): TttCoreApi {
  const log: BlackboxChannel = deps.blackbox.createChannel({ id: "ttt.round", capacity: 512 });
  const settings = (): TttCoreConfig | null => deps.config === undefined
    ? null
    : typeof deps.config === "function" ? deps.config() : deps.config;
  const record = (entry: TttLogEntry): void => {
    log.record({
      at: Date.now() / 1000,
      kind: entry.kind,
      message: entry.message,
      actor: entry.actorSlot === undefined
        ? undefined
        : { slot: entry.actorSlot, name: deps.playerName(entry.actorSlot) },
      target: entry.targetSlot === undefined
        ? undefined
        : { slot: entry.targetSlot, name: deps.playerName(entry.targetSlot) },
      data: entry.data,
      coalesceKey: entry.coalesceKey,
    });
  };
  deps.bus.on("gameState", (event) => {
    if (event.state === "countdown") log.clear();
  }, { priority: TttPriority.HIGHEST });
  if (deps.emitForward !== undefined) {
    const forward = deps.emitForward;
    deps.bus.on("gameState", (event) => { forward("gameState", { ...event }); }, {
      priority: TttPriority.MONITOR,
    });
    deps.bus.on("roleAssigned", (event) => { forward("roleAssigned", { ...event }); }, {
      priority: TttPriority.MONITOR,
    });
    deps.bus.on("death", (event) => { forward("death", { ...event }); }, {
      priority: TttPriority.MONITOR,
    });
    deps.bus.on("damage", (event) => {
      forward("damage", {
        slot: event.slot,
        attacker: event.attacker,
        damage: event.damage,
        weapon: event.weapon,
      });
    }, { priority: TttPriority.MONITOR, ignoreCanceled: true });
    deps.bus.on("join", (event) => { forward("join", { ...event }); }, {
      priority: TttPriority.MONITOR,
    });
    deps.bus.on("leave", (event) => { forward("leave", { ...event }); }, {
      priority: TttPriority.MONITOR,
    });
    deps.bus.on("bodyCreate", (event) => {
      forward("bodyCreate", { body: { ...event.body } });
    }, { priority: TttPriority.MONITOR, ignoreCanceled: true });
    deps.bus.on("bodyIdentify", (event) => {
      forward("bodyIdentify", { body: { ...event.body }, identifier: event.identifier });
    }, { priority: TttPriority.MONITOR, ignoreCanceled: true });
  }
  return {
    registerRole: deps.roles.registerRole,
    reserveRole: deps.roles.reserveRole,
    roleDefinition: deps.roles.roleDefinition,
    roleDefinitions: deps.roles.roleDefinitions,
    startingLoadout(role) {
      const config = settings();
      const definition = deps.roles.roleDefinition(role);
      return config === null || definition === null ? null : startingLoadout(config, definition);
    },
    loadoutOf: (slot) => deps.inventory?.loadoutOf(slot) ?? null,
    roleOf: deps.roles.roleOf,
    teamOfRole: deps.roles.teamOfRole,
    player: (slot) => deps.players?.player(slot) ?? null,
    activePlayers: () => deps.players?.activePlayers() ?? [],
    gameState: deps.round.snapshot,
    isAlive: (slot) => deps.players?.isAlive(slot) ?? false,
    isParticipating: (slot) => deps.players?.isParticipating(slot) ?? false,
    body: (ownerSlot) => deps.bodies?.bodyOf(ownerSlot) ?? null,
    identifyBody(ownerSlot, identifier) {
      if (deps.bodies === undefined) return false;
      const body = deps.bodies.bodyOf(ownerSlot);
      if (body === null || !identifyRegisteredBody(deps.bodies, deps.bus, ownerSlot, identifier)) return false;
      record({
        kind: "body_identify",
        message: `${deps.playerName(identifier)} identified ${body.ownerName}`,
        actorSlot: identifier,
        targetSlot: ownerSlot,
        data: { role: body.ownerRole, killerSlot: body.killerSlot },
      });
      return true;
    },
    startRound: deps.startRound ?? (() => false),
    endRound: deps.endRound ?? deps.round.endRound,
    setRoundDeadline: deps.setRoundDeadline ?? (() => undefined),
    extendRoundDeadline: deps.extendRoundDeadline ?? (() => 0),
    log: record,
    renderLogs: () => log.render(),
  };
}
