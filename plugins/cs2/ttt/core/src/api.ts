import type { BlackboxApi, BlackboxChannel } from "@edgegamers/blackbox";
import type {
  TttCoreApi,
  TttEvents,
  TttLogEntry,
  TttStartRoundOptions,
  TttTeamKey,
} from "../api";
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
  startRound?(options?: TttStartRoundOptions): boolean;
  endRound?(winner: TttTeamKey | "", reason?: string): boolean;
  setRoundDeadline?(seconds: number): void;
}): TttCoreApi {
  const log: BlackboxChannel = deps.blackbox.createChannel({ id: "ttt.round", capacity: 512 });
  deps.bus.on("gameState", (event) => {
    if (event.state === "in_progress") log.clear();
  }, { priority: TttPriority.HIGHEST });
  return {
    registerRole: deps.roles.registerRole,
    reserveRole: deps.roles.reserveRole,
    roleOf: deps.roles.roleOf,
    teamOfRole: deps.roles.teamOfRole,
    player: (slot) => deps.players?.player(slot) ?? null,
    activePlayers: () => deps.players?.activePlayers() ?? [],
    gameState: deps.round.snapshot,
    isAlive: (slot) => deps.players?.isAlive(slot) ?? false,
    isParticipating: (slot) => deps.players?.isParticipating(slot) ?? false,
    startRound: deps.startRound ?? (() => deps.round.startRound(0)),
    endRound: deps.endRound ?? deps.round.endRound,
    setRoundDeadline: deps.setRoundDeadline ?? (() => undefined),
    on: deps.bus.on.bind(deps.bus),
    log(entry: TttLogEntry) {
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
    },
    renderLogs: () => log.render(),
  };
}
