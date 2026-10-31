/**
 * Pure round bookkeeping: round number, phase and the mode arbitration rule. No SDK imports, so
 * it is unit-tested directly (test/round-state.test.ts). `round.ts` drives it from game events.
 */
import type { Mode, RoundInfo, RoundPhase } from "../api";

/**
 * The `setMode` rule from the contract: from "normal" any mode may be claimed; from a non-normal
 * mode only "normal" (a release) is accepted. "normal" -> "normal" is an accepted no-op.
 */
export function canSetMode(current: Mode, next: Mode): boolean {
  if (next === "normal") return true;
  return current === "normal";
}

export class RoundState {
  round = 0;
  phase: RoundPhase = "waiting";
  mode: Mode = "normal";
  startedAt = 0;

  info(): RoundInfo {
    return { round: this.round, phase: this.phase, mode: this.mode, startedAt: this.startedAt };
  }

  /** A new map: back to "waiting", round 0. Returns the previous mode (for OnModeChanged). */
  mapStart(): Mode {
    const previous = this.mode;
    this.round = 0;
    this.phase = "waiting";
    this.mode = "normal";
    this.startedAt = 0;
    return previous;
  }

  /** round_start: next round, mode back to normal. Returns the previous mode. */
  start(nowSeconds: number, warmup: boolean): Mode {
    const previous = this.mode;
    this.round += 1;
    this.phase = warmup ? "warmup" : "freeze";
    this.mode = "normal";
    this.startedAt = nowSeconds;
    return previous;
  }

  /** round_freeze_end: the round is live (warmup stays warmup). */
  freezeEnd(): void {
    if (this.phase === "freeze" || this.phase === "waiting") this.phase = "live";
  }

  /** round_end. */
  end(): void {
    this.phase = "ended";
  }

  /**
   * Try to change the mode. Returns `{ ok, previous, changed }`: `ok` is the contract answer,
   * `changed` is true only when the mode actually moved (emit OnModeChanged then).
   */
  setMode(next: Mode): { ok: boolean; previous: Mode; changed: boolean } {
    const previous = this.mode;
    if (!canSetMode(previous, next)) return { ok: false, previous, changed: false };
    this.mode = next;
    return { ok: true, previous, changed: previous !== next };
  }
}
