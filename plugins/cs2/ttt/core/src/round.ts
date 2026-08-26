import type { TttGameStateSnapshot, TttRoundState, TttTeamKey } from "../api";
import type { RoleRegistry } from "./roles.ts";

export interface RoundController {
  setAlive(slot: number, alive: boolean): void;
  startRound(participants: number): boolean;
  endRound(winner: TttTeamKey | "", reason?: string): boolean;
  checkEndConditions(): TttTeamKey | "";
  resetRound(): void;
  snapshot(): TttGameStateSnapshot;
}

export function createRoundController(roles: RoleRegistry): RoundController {
  const alive = new Map<number, boolean>();
  let state: TttRoundState = "waiting";
  let participants = 0;
  let roundsThisMap = 0;
  let winner: TttTeamKey | "" = "";

  return {
    setAlive(slot, value) {
      alive.set(slot, value);
    },
    startRound(count) {
      if (state !== "waiting") return false;
      state = "in_progress";
      participants = count;
      roundsThisMap += 1;
      winner = "";
      return true;
    },
    endRound(nextWinner) {
      if (state !== "in_progress" && state !== "countdown") return false;
      state = "finished";
      winner = nextWinner;
      return true;
    },
    checkEndConditions() {
      let traitorAlive = 0;
      let innocentAlive = 0;
      for (const [slot, isAlive] of alive) {
        if (!isAlive) continue;
        const team = roles.teamOfRole(roles.roleOf(slot));
        if (team === "traitor") traitorAlive += 1;
        if (team === "innocent") innocentAlive += 1;
      }
      if (traitorAlive === 0 && innocentAlive === 0) return "";
      if (traitorAlive === 0) return "innocent";
      if (innocentAlive === 0) return "traitor";
      return "";
    },
    resetRound() {
      state = "waiting";
      participants = 0;
      winner = "";
      alive.clear();
    },
    snapshot() {
      return { state, participants, roundsThisMap, winner };
    },
  };
}
