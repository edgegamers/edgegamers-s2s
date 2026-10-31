/**
 * Small pure rules used by the warden plugin (no SDK imports; unit-tested in test/rules.test.ts).
 */

export type PeaceReason = "admin" | "warden" | "initial_warden" | "warden_taken";

/**
 * How long a peace mute lasts. Prisoners stay muted for `prisoner` seconds, guards for `guard`
 * (at most 10). Base time scales with the number of living prisoners
 * (https://www.desmos.com/calculator/gwd9cqw4yq): floor((prisoners + 30) / 5) * 5.
 */
export function peaceDuration(alivePrisoners: number, reason: PeaceReason): { prisoner: number; guard: number } {
  const base = Math.floor((Math.max(0, alivePrisoners) + 30) / 5) * 5;
  let prisoner: number;
  switch (reason) {
    case "warden_taken":
      prisoner = Math.floor(base / 4);
      break;
    case "warden":
      prisoner = Math.floor(base / 2);
      break;
    default:
      prisoner = base;
  }
  return { prisoner, guard: Math.min(10, prisoner) };
}

export interface GuardArmorConfig {
  /** Armor when teams are balanced (T/ratio == CT). */
  equal: number;
  /** Armor when guards outnumber the ratio. */
  outnumber: number;
  /** Armor when prisoners outnumber the ratio. */
  outnumbered: number;
}

/**
 * The armor every living guard is raised to when the first warden of a round is picked.
 * Balance = T / ratio - CT: positive (Ts outnumber) → `outnumbered`, zero → `equal`, negative → `outnumber`.
 */
export function guardArmor(tCount: number, ctCount: number, ratio: number, cfg: GuardArmorConfig): number {
  const balance = tCount / ratio - ctCount; // ratio 0 → ±Infinity / NaN, as in the C# float division
  if (Number.isNaN(balance)) return cfg.equal;
  if (balance > 0) return cfg.outnumbered;
  if (balance < 0) return cfg.outnumber;
  return cfg.equal;
}

export type ParseResult = { ok: true; value: number } | { ok: false; arg: string; expected: string };

/** `!countdown [seconds]`: default when no argument, else an integer within [min, max]. */
export function parseCountdown(arg: string, min: number, max: number, def: number): ParseResult {
  let value = def;
  if (arg !== "") {
    if (!/^[+-]?\d+$/.test(arg)) return { ok: false, arg, expected: "number" };
    value = parseInt(arg, 10);
    if (value <= 0) return { ok: false, arg, expected: "number greater than 0" };
  }
  if (value < min) return { ok: false, arg, expected: `number greater than or equal to ${min}` };
  if (value > max) return { ok: false, arg, expected: `number less than or equal to ${max}` };
  return { ok: true, value };
}

/**
 * The seconds-remaining values a countdown of `duration` announces (every second for the last 5,
 * plus every multiple of 5), each with its delay from the start, then "go" at `duration`.
 */
export function countdownSchedule(duration: number): { delay: number; remaining: number }[] {
  const out: { delay: number; remaining: number }[] = [];
  for (let i = duration; i > 0; i--) {
    if (i <= 5 || i % 5 === 0) out.push({ delay: duration - i, remaining: i });
  }
  return out;
}

/** `!roll [min max]` bounds: 0..10 by default, both must be integers when given. */
export function parseRoll(args: readonly string[]): { ok: true; min: number; max: number } | { ok: false; arg: string } {
  if (args.length < 2) return { ok: true, min: 0, max: 10 };
  const [a, b] = args;
  if (!/^[+-]?\d+$/.test(a)) return { ok: false, arg: a };
  if (!/^[+-]?\d+$/.test(b)) return { ok: false, arg: b };
  return { ok: true, min: parseInt(a, 10), max: parseInt(b, 10) };
}

/** C# `Random.Next(min, max)`: an integer in [min, max) (min when the range is empty). */
export function rollBetween(min: number, max: number, random: () => number): number {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  if (hi <= lo) return lo;
  return lo + Math.floor(random() * (hi - lo));
}

/**
 * SourceMod admin-flag letters → an ADMFLAG bitmask (`"o"` → CUSTOM1, `"bz"` → GENERIC|ROOT).
 * a..n are bits 0..13, z is ROOT (bit 14), o..t are CUSTOM1..6 (bits 15..20). Unknown letters are
 * ignored; an empty string is 0 (= no flag needed).
 */
export function flagsFromLetters(letters: string): number {
  let mask = 0;
  for (const ch of letters.toLowerCase()) {
    const c = ch.charCodeAt(0);
    if (ch === "z") mask |= 1 << 14;
    else if (c >= 97 && c <= 110) mask |= 1 << (c - 97); // a..n
    else if (c >= 111 && c <= 116) mask |= 1 << (c - 111 + 15); // o..t
  }
  return mask >>> 0;
}

export interface Point3 {
  x: number;
  y: number;
  z: number;
}

/** Inside the warden marker: within `radius + 32` units (3D) of its centre. */
export function inMarker(center: Point3, radius: number, pos: Point3): boolean {
  const r = radius + 32;
  const dx = center.x - pos.x;
  const dy = center.y - pos.y;
  const dz = center.z - pos.z;
  return dx * dx + dy * dy + dz * dz <= r * r;
}

export interface MarkerPlacement {
  center: Point3;
  radius: number;
  placedAtMs: number;
}

export interface MarkerConfig {
  minRadius: number;
  maxRadius: number;
  resizeMs: number;
}

/**
 * What a warden ping does to the marker. A ping within `resizeMs` of placing resizes the existing
 * marker to the ping's distance (clamped to [min, max]; pings further than max*1.3 are ignored).
 * Any other ping places a fresh marker of the minimum radius at the ping.
 */
export function markerPing(
  current: MarkerPlacement | null,
  ping: Point3,
  nowMs: number,
  cfg: MarkerConfig,
): { action: "place" | "resize" | "ignore"; marker: MarkerPlacement | null } {
  if (current && nowMs - current.placedAtMs < cfg.resizeMs) {
    const dx = current.center.x - ping.x;
    const dy = current.center.y - ping.y;
    const dz = current.center.z - ping.z;
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (!(distance <= cfg.maxRadius * 1.3)) return { action: "ignore", marker: current };
    const radius = Math.max(cfg.minRadius, Math.min(cfg.maxRadius, distance));
    return { action: "resize", marker: { ...current, radius } };
  }
  return { action: "place", marker: { center: { ...ping }, radius: cfg.minRadius, placedAtMs: nowMs } };
}

/**
 * Whether a running peace mute still applies to a player who just spawned on `team`
 * (2 = prisoner, 3 = guard). Times are epoch milliseconds; guards' peace ends earlier.
 */
export function peaceCoversSpawn(team: number, nowMs: number, peaceEndMs: number, guardPeaceEndMs: number): boolean {
  if (team === 2) return nowMs < peaceEndMs;
  if (team === 3) return nowMs < guardPeaceEndMs;
  return false;
}
