import type {
  TttEvents,
  TttGameStateSnapshot,
  TttRoundState,
  TttStartingLoadoutSnapshot,
  TttStartRoundOptions,
  TttTeamKey,
} from "../api";
import type { TttCoreConfig } from "./config.ts";
import { roundDuration } from "./config.ts";
import type { TttEventBus } from "./events.ts";
import type { PlayerRegistry } from "./players.ts";
import type { RoleRegistry } from "./roles.ts";
import type { RoundController } from "./round.ts";
import { startingLoadout } from "./cs2/inventory.ts";

export interface TttRuntime {
  gameState(): TttGameStateSnapshot;
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
  applyStartingLoadout?(slot: number, loadout: TttStartingLoadoutSnapshot): void;
}): TttRuntime {
  const now = deps.now ?? (() => Date.now() / 1000);
  const settings = (): TttCoreConfig =>
    typeof deps.config === "function" ? deps.config() : deps.config;
  let deadline = 0;
  let countdownDeadline = 0;
  let nextRoundAt = 0;
  let roundQuiet = false;

  function transition(
    state: TttRoundState,
    winner: TttTeamKey | "",
    reason: string,
    quiet: boolean,
    commit: () => boolean,
    afterCommit?: () => void,
  ): boolean {
    const previousState = deps.round.snapshot().state;
    const event = deps.bus.emit("gameStateChanging", {
      previousState,
      state,
      winner,
      reason,
      quiet,
      canceled: false,
    });
    if (event.canceled || !commit()) return false;
    afterCommit?.();
    deps.bus.emit("gameState", {
      previousState,
      ...deps.round.snapshot(),
      quiet,
    });
    return true;
  }

  function beginRound(): boolean {
    if (deps.round.snapshot().state !== "countdown") return false;
    const slots = deps.players.activeSlots();
    if (slots.length < settings().minPlayers) {
      const reason = "Not enough players";
      return transition("waiting", "", reason, roundQuiet, () => deps.round.abortCountdown(reason), () => {
        countdownDeadline = 0;
        roundQuiet = false;
      });
    }
    return transition("in_progress", "", "", roundQuiet, () => deps.round.beginRound(), () => {
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
        const alive = participating && deps.players.isAlive(slot);
        deps.players.setParticipating(slot, participating);
        deps.players.setAlive(slot, alive);
        deps.round.setAlive(slot, alive);
        const definition = deps.roles.roleDefinition(role);
        if (participating && definition !== null) {
          deps.applyStartingLoadout?.(slot, startingLoadout(settings(), definition));
        }
        deps.bus.emit("roleAssigned", { slot, role });
      }
      deadline = now() + roundDuration(settings(), slots.length);
      countdownDeadline = 0;
      nextRoundAt = 0;
    });
  }

  function endRound(winner: TttTeamKey | "", reason?: string): boolean {
    const snapshot = deps.round.snapshot();
    if (snapshot.state !== "in_progress" && snapshot.state !== "countdown") return false;
    return transition("finished", winner, reason ?? "", roundQuiet, () => deps.round.endRound(winner, reason), () => {
      deadline = 0;
      countdownDeadline = 0;
      nextRoundAt = now() + settings().timeBetweenRounds;
    });
  }

  return {
    gameState: deps.round.snapshot,
    startRound(options) {
      const slots = deps.players.activeSlots();
      if (deps.round.snapshot().state !== "waiting" || slots.length < settings().minPlayers) return false;
      const quiet = options?.quiet ?? false;
      return transition("countdown", "", "", quiet, () => deps.round.startCountdown(slots.length), () => {
        roundQuiet = quiet;
        countdownDeadline = now() + settings().countdownSeconds;
        deadline = 0;
        nextRoundAt = 0;
      });
    },
    endRound,
    setRoundDeadline(seconds) {
      deadline = seconds > 0 ? now() + seconds : 0;
    },
    tick() {
      const snapshot = deps.round.snapshot();
      if (snapshot.state === "countdown" && countdownDeadline > 0 && now() >= countdownDeadline) {
        return beginRound();
      }
      if (snapshot.state === "in_progress" && deadline > 0 && now() >= deadline) {
        return endRound("innocent", "Round time expired");
      }
      if (snapshot.state === "finished" && nextRoundAt > 0 && now() >= nextRoundAt) {
        return transition("waiting", "", "", false, () => {
          if (deps.round.snapshot().state !== "finished") return false;
          deps.round.resetRound();
          return true;
        }, () => {
          for (const slot of deps.players.activeSlots()) {
            deps.players.setParticipating(slot, false);
            deps.players.setAlive(slot, false);
          }
          nextRoundAt = 0;
          roundQuiet = false;
        });
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
