import type { TttEvents, TttStartRoundOptions, TttTeamKey } from "../api";
import type { TttCoreConfig } from "./config.ts";
import { roundDuration } from "./config.ts";
import type { TttEventBus } from "./events.ts";
import type { PlayerRegistry } from "./players.ts";
import type { RoleRegistry } from "./roles.ts";
import type { RoundController } from "./round.ts";

export interface TttRuntime {
  startRound(options?: TttStartRoundOptions): boolean;
  endRound(winner: TttTeamKey | "", reason?: string): boolean;
  setRoundDeadline(seconds: number): void;
  tick(): boolean;
  markDead(slot: number): void;
  handleDeath(slot: number): TttTeamKey | "";
}

export function createTttRuntime(deps: {
  bus: TttEventBus<TttEvents>;
  roles: RoleRegistry;
  players: PlayerRegistry;
  round: RoundController;
  config: TttCoreConfig | (() => TttCoreConfig);
  now?: () => number;
}): TttRuntime {
  const now = deps.now ?? (() => Date.now() / 1000);
  const settings = (): TttCoreConfig =>
    typeof deps.config === "function" ? deps.config() : deps.config;
  let deadline = 0;
  let nextRoundAt = 0;

  function endRound(winner: TttTeamKey | "", reason?: string): boolean {
    const event = deps.bus.emit("gameState", { state: "finished", canceled: false });
    if (event.canceled || !deps.round.endRound(winner, reason)) return false;
    deadline = 0;
    nextRoundAt = now() + settings().timeBetweenRounds;
    return true;
  }

  return {
    startRound(_options) {
      const slots = deps.players.activeSlots();
      if (slots.length < settings().minPlayers) return false;
      const stateEvent = deps.bus.emit("gameState", { state: "in_progress", canceled: false });
      if (stateEvent.canceled || !deps.round.startRound(slots.length)) return false;

      const assignments = deps.roles.assignRoles(slots);
      for (const slot of slots) {
        const assigning = deps.bus.emit("roleAssigning", {
          slot,
          role: assignments.get(slot) ?? "",
          canceled: false,
        });
        const role = assigning.canceled ? "" : assigning.role;
        deps.roles.setRole(slot, role);
        const participating = deps.roles.teamOfRole(role) !== "spectator";
        deps.players.setParticipating(slot, participating);
        deps.players.setAlive(slot, participating);
        deps.round.setAlive(slot, participating);
        deps.bus.emit("roleAssigned", { slot, role });
      }
      deadline = now() + roundDuration(settings(), slots.length);
      nextRoundAt = 0;
      return true;
    },
    endRound,
    setRoundDeadline(seconds) {
      deadline = seconds > 0 ? now() + seconds : 0;
    },
    tick() {
      const snapshot = deps.round.snapshot();
      if (snapshot.state === "in_progress" && deadline > 0 && now() >= deadline) {
        return endRound("innocent", "Round time expired");
      }
      if (snapshot.state === "finished" && nextRoundAt > 0 && now() >= nextRoundAt) {
        for (const slot of deps.players.activeSlots()) {
          deps.players.setParticipating(slot, false);
          deps.players.setAlive(slot, false);
        }
        deps.round.resetRound();
        nextRoundAt = 0;
        deps.bus.emit("gameState", { state: "waiting", canceled: false });
        return true;
      }
      return false;
    },
    markDead(slot) {
      deps.players.setAlive(slot, false);
      deps.round.setAlive(slot, false);
    },
    handleDeath(slot) {
      deps.players.setAlive(slot, false);
      deps.round.setAlive(slot, false);
      const winner = deps.round.checkEndConditions();
      if (winner !== "") endRound(winner, "Team eliminated");
      return winner;
    },
  };
}
