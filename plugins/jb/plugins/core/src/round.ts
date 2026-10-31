import {logEntry} from '@edgegamers/jailbreak-shared';
/**
 * Round tracking and mode arbitration. The game-event handlers here only move the state; the
 * per-round reset of the other features is orchestrated in plugin.ts so OnRoundStart is emitted
 * after EVERYTHING was reset.
 */
import { GameRules, Player } from "@s2script/cs2";
import { nowSeconds, teamName } from "@edgegamers/jailbreak-shared";
import type { Mode, RoundInfo, TeamName } from "../api";
import { RoundState } from "./round-state";
import { bus } from "./bus";
import { log } from "./logs";

const state = new RoundState();

export const getRound = (): RoundInfo => state.info();
export const currentRound = (): number => state.round;
export const startedAt = (): number => state.startedAt;
export const currentMode = (): Mode => state.mode;

export function isWarmup(): boolean {
  // RoundUtil.IsWarmup: no game rules counts as warmup.
  const rules = GameRules.get();
  return rules === null || rules.warmupPeriod !== false;
}

function emitModeChange(previous: Mode): void {
  if (previous === state.mode) return;
  bus()?.emit("OnModeChanged", { round: state.round, mode: state.mode, previous });
}

/** core.setMode — see the contract rule in round-state.ts. */
export function setMode(mode: Mode): boolean {
  const r = state.setMode(mode);
  if (r.changed) {
    log(...logEntry("JB_LOG_ROUND_MODE", [String(r.previous), String(mode)], [0,1]));
    emitModeChange(r.previous);
  }
  return r.ok;
}

export function roundStarted(): void {
  const previous = state.start(nowSeconds(), isWarmup());
  emitModeChange(previous);
}

export function roundLive(): void {
  state.freezeEnd();
  bus()?.emit("OnRoundLive", { round: state.round });
}

export function roundEnded(winnerTeamNum: number): TeamName {
  state.end();
  const winner = teamName(winnerTeamNum);
  bus()?.emit("OnRoundEnd", { round: state.round, winner });
  return winner;
}

export function mapStarted(): void {
  emitModeChange(state.mapStart());
}

/** Late load (plugin reloaded mid-map): pick the phase up from the game rules. */
export function seedFromGameRules(): void {
  const rules = GameRules.get();
  if (!rules || Player.all().length === 0) return;
  state.round = 1;
  const elapsed = rules.timeElapsed ?? 0;
  state.startedAt = nowSeconds() - Math.max(0, Math.floor(elapsed));
  state.phase = rules.warmupPeriod ? "warmup" : rules.freezePeriod ? "freeze" : "live";
}

export function emitRoundStart(): void {
  bus()?.emit("OnRoundStart", { round: state.round });
}
