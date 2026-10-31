/**
 * Special-day type names, the `!sd <name>` parser (SDTypeExtensions.FromString) and the display
 * names. Pure: no SDK imports, unit-tested.
 */
import type { SDType } from "../api";

/**
 * The C# `SDType` enum in declaration order. `!sd <number>` used the enum ordinal (the old menu
 * sent `css_sd <int>`), so the order is kept; `null` marks the enum members that never had an
 * implementation (PACMAN, SNAKE, TAG).
 */
export const SD_ORDINALS: readonly (SDType | null)[] = [
  "custom",
  "bhop",
  "ffa",
  "fog",
  "gungame",
  "ghost",
  "he",
  "hns",
  "infection",
  "noscope",
  "oitc",
  null, // pacman
  "rocketjump",
  null, // snake
  "speedrun",
  null, // tag
  "teleport",
  "warday",
];

/** Every implemented day, in enum order. */
export const ALL_TYPES: readonly SDType[] = SD_ORDINALS.filter((t): t is SDType => t !== null);

/** Enum names with no implementation: a valid C# enum name, but not a startable day. */
const UNIMPLEMENTED = new Set(["pacman", "snake", "tag"]);

/** SDTypeExtensions.FromString aliases (lower-case, spaces removed). `null` = alias of an unimplemented day. */
const ALIASES: Readonly<Record<string, SDType | null>> = {
  freeforall: "ffa",
  hide: "hns",
  hideseek: "hns",
  seek: "hns",
  ns: "noscope",
  war: "warday",
  tron: null, // SNAKE
  gun: "gungame",
  zomb: "infection",
  zombie: "infection",
  rocket: "rocketjump",
  rj: "rocketjump",
  marketgardner: "rocketjump",
  speed: "speedrun",
  speeders: "speedrun",
  speedrunners: "speedrun",
  race: "speedrun",
  tp: "teleport",
  he: "he",
  grenade: "he",
  grenades: "he",
  ghost: "ghost",
  ghosts: "ghost",
  fog: "fog",
};

export function isSDType(s: string): s is SDType {
  return (ALL_TYPES as readonly string[]).includes(s);
}

/**
 * Parse what a player typed after `!sd`. Accepts the enum name (any case), the enum ordinal, or
 * one of the C# aliases ("zombie", "hide seek", "rj", "free for all", …). Returns null for
 * anything else, including the enum members that were never implemented.
 */
export function parseSDType(input: string): SDType | null {
  const raw = input.trim();
  if (raw === "") return null;
  // Enum.TryParse accepts an integer ordinal.
  if (/^[+-]?\d+$/.test(raw)) {
    const n = Number(raw);
    return Number.isInteger(n) && n >= 0 && n < SD_ORDINALS.length ? SD_ORDINALS[n] : null;
  }
  const lower = raw.toLowerCase();
  if (isSDType(lower)) return lower;
  if (UNIMPLEMENTED.has(lower)) return null;
  const squashed = lower.replace(/\s+/g, "");
  if (isSDType(squashed)) return squashed;
  return Object.prototype.hasOwnProperty.call(ALIASES, squashed) ? ALIASES[squashed] : null;
}

/** Parse a comma/space separated list of day names (config values); unknown entries are skipped. */
export function parseSDTypeList(list: string): SDType[] {
  const out: SDType[] = [];
  for (const part of list.split(/[,\s]+/)) {
    const t = parseSDType(part);
    if (t !== null && !out.includes(t)) out.push(t);
  }
  return out;
}

/** Display names (the C# locale `Name`s). */
export const SD_NAMES: Readonly<Record<SDType, string>> = {
  custom: "Custom",
  bhop: "Bunny Hop",
  ffa: "Free for All",
  fog: "Fog War",
  gungame: "Gun Game",
  ghost: "Ghost War",
  he: "HE Only",
  hns: "Hide and Seek",
  infection: "Infection",
  noscope: "No Scope",
  oitc: "One in the Chamber",
  rocketjump: "Rocket Jump",
  speedrun: "Speedrunners",
  teleport: "Teleport",
  warday: "Warday",
};

/** "a"/"an" for "Today is a(n) <Name> day!" (C# checks the first letter for a vowel). */
export function article(name: string): string {
  return /^[aeiou]/i.test(name) ? "an" : "a";
}
