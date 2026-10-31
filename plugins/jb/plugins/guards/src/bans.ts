/**
 * The CT ban model — pure (CTBans `CTBan` class + CTBanService penalty/caps).
 *
 * `duration` is seconds. 0 = permanent. Negative = revoked (the original length, negated); a revoked
 * permanent ban is stored as -1. Times are unix seconds.
 */
export interface Ban {
  /** Target SteamID64 (decimal string). */
  steamId: string;
  /** Issuer SteamID64, "0" for console. */
  admin: string;
  reason: string;
  duration: number;
  timestamp: number;
}

/** Permanent for display ("Permanently"), including a revoked permanent ban (-1). */
export function isPermanent(b: Ban): boolean {
  return b.duration === 0 || b.duration === -1;
}

export function isRevoked(b: Ban): boolean {
  return b.duration < 0;
}

/**
 * True while the ban restricts the player. Fixes the CS# bug where a revoked permanent ban (-1)
 * counted as permanent and was re-enforced after a reconnect.
 */
export function isActive(b: Ban, now: number): boolean {
  if (isRevoked(b)) return false;
  if (b.duration === 0) return true;
  return b.timestamp + b.duration >= now;
}

export function secondsLeft(b: Ban, now: number): number {
  if (isPermanent(b)) return 0;
  return b.timestamp + b.duration - now;
}

/** Whole minutes left, never below 1 for a timed ban; 0 for permanent. */
export function minutesLeft(b: Ban, now: number): number {
  if (isPermanent(b)) return 0;
  return Math.max(Math.floor(secondsLeft(b, now) / 60), 1);
}

export function effectiveDuration(b: Ban): number {
  return Math.abs(b.duration);
}

/** The stored duration after revoking `b`. */
export function revokedDuration(b: Ban): number {
  return b.duration === 0 ? -1 : -Math.abs(b.duration);
}

/** Clamp a requested length to an issuer's maximum (0 = uncapped). A permanent request from a capped issuer is reduced. */
export function capDuration(requested: number, max: number): { seconds: number; reduced: boolean } {
  if (max > 0 && (requested > max || requested === 0)) return { seconds: max, reduced: true };
  return { seconds: requested, reduced: false };
}

/**
 * The repeat-ban priority penalty: non-revoked bans whose end falls within the last `windowHours`.
 * Returns the count and summed minutes when there are at least `minBans`, else null.
 */
export function repeatPenalty(
  history: readonly Ban[],
  now: number,
  windowHours: number,
  minBans: number,
): { count: number; minutes: number } | null {
  const since = now - windowHours * 3600;
  const recent = history.filter((b) => !isRevoked(b) && b.timestamp + b.duration >= since);
  if (recent.length < minBans) return null;
  const minutes = recent.reduce((sum, b) => sum + Math.floor(b.duration / 60), 0);
  return { count: recent.length, minutes };
}
