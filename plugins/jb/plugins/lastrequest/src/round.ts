/**
 * Round helpers: the clock (C# `RoundUtil`), warmup, and claiming core's round mode.
 */
import { Server } from "@s2script/sdk";
import { GameRules } from "@s2script/cs2";
import { getRound, setMode } from "@edgegamers/jailbreak-core";
import { cappedTimeDelta } from "./logic";

export function timeRemaining(): number {
  return Math.floor(GameRules.get()?.timeRemaining ?? 0);
}

export function setTimeRemaining(seconds: number): void {
  GameRules.get()?.setTimeRemaining(seconds);
}

export function addTimeRemaining(seconds: number): void {
  if (seconds !== 0) GameRules.get()?.addTimeRemaining(seconds);
}

/** Add `seconds` but never let the clock pass `max`. */
export function addTimeCapped(seconds: number, max: number): void {
  addTimeRemaining(cappedTimeDelta(timeRemaining(), seconds, max));
}

export function isWarmup(): boolean {
  return GameRules.get()?.warmupPeriod === true;
}

/** Which side wins if the clock runs out (C#: CTs once LR is on, Ts otherwise). */
export function setDefaultWinner(team: 2 | 3): void {
  Server.command(`mp_default_team_winner_no_objective ${team}`);
}

/**
 * Claim core's round mode for one of ours. Last guard can hand over to last request (both
 * belong to this plugin), so if we already own the other one we release it first. Returns false
 * when someone else (a special day) owns the round.
 */
export function claimMode(mode: "lastrequest" | "lastguard"): boolean {
  const current = getRound().mode;
  if (current === mode) return true;
  if (current === "lastrequest" || current === "lastguard") setMode("normal");
  return setMode(mode);
}

/** Give the mode back if we still hold `mode`. */
export function releaseMode(mode: "lastrequest" | "lastguard"): void {
  if (getRound().mode === mode) setMode("normal");
}
