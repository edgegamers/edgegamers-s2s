/**
 * Who may start a special day, and when (SpecialDayManager.CanStartSpecialDay). Pure.
 *
 * Rules, in the C# order:
 *  - Anyone with the "bypass" flag (C# `@css/rcon`) or the server console skips the round rules.
 *  - Otherwise: must be the warden and not in warmup, no day may be running, the cooldown must have
 *    passed, and the round must be young enough.
 *  - Then the per-day gate (C# donor gating in SDTypeExtensions.CanCall, now a config-driven admin
 *    flag) applies to everyone except root.
 */

export type StartDenial =
  | { kind: "not_warden" }
  | { kind: "running" }
  | { kind: "cooldown"; rounds: number }
  | { kind: "too_late"; maxSeconds: number }
  | { kind: "gated" };

export interface StartCheck {
  /** Console, or a player with the bypass (rcon) flag. */
  bypassRules: boolean;
  /** Root admins ignore the per-day gate. Console counts as root. */
  root: boolean;
  isWarden: boolean;
  warmup: boolean;
  running: boolean;
  roundsSinceLast: number;
  cooldownRounds: number;
  /** Seconds since the round started. */
  elapsedSeconds: number;
  maxElapsedSeconds: number;
  /** The day is gated (donor list) and the caller lacks the gate flag. */
  gated: boolean;
}

export function checkStart(c: StartCheck): StartDenial | null {
  if (!c.bypassRules) {
    if (!c.isWarden || c.warmup) return { kind: "not_warden" };
    if (c.running) return { kind: "running" };
    const roundsToNext = c.roundsSinceLast - c.cooldownRounds;
    if (roundsToNext < 0) return { kind: "cooldown", rounds: Math.abs(roundsToNext) };
    if (c.elapsedSeconds > c.maxElapsedSeconds) return { kind: "too_late", maxSeconds: c.maxElapsedSeconds };
  }
  if (c.gated && !c.root) return { kind: "gated" };
  return null;
}

/** The round-start counter: warmup rounds don't count. */
export function nextRoundsSince(current: number, warmup: boolean): number {
  return warmup ? current : current + 1;
}
