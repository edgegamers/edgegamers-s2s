/**
 * Ranks and priority caps — pure. Replaces CTBans' MAUL `GetRank()` (group membership) and
 * `MaximumPriority` (permission → cap), driven by s2script admin groups.
 */
export const RANKS = ["none", "e", "eg", "ego", "advisor", "manager", "srmanager", "commgr", "root"] as const;
export type Rank = (typeof RANKS)[number];

const DEFAULT_NORMAL_CAP = 480;

/** Parse `k=v,k=v`. Malformed entries (no `=`, empty key/value, extra `=`) are skipped and reported. */
export function parsePairs(s: string, warn: (m: string) => void): Map<string, string> {
  const out = new Map<string, string>();
  for (const raw of s.split(",")) {
    const part = raw.trim();
    if (!part) continue;
    const bits = part.split("=");
    const key = bits[0]?.trim() ?? "";
    const value = bits[1]?.trim() ?? "";
    if (bits.length !== 2 || !key || !value) {
      warn(`ignoring malformed pair "${part}"`);
      continue;
    }
    out.set(key, value);
  }
  return out;
}

/** `rank=group` pairs → rank → group. Unknown rank names are skipped and reported. */
export function parseRankGroups(s: string, warn: (m: string) => void): Map<Rank, string> {
  const out = new Map<Rank, string>();
  for (const [rank, group] of parsePairs(s, warn)) {
    if (!(RANKS as readonly string[]).includes(rank) || rank === "none") {
      warn(`ignoring unknown rank "${rank}"`);
      continue;
    }
    out.set(rank as Rank, group);
  }
  return out;
}

/** `group=cap` pairs (plus `default=cap`) → group → cap. Non-integer caps are skipped and reported. */
export function parseCaps(s: string, warn: (m: string) => void): Map<string, number> {
  const out = new Map<string, number>();
  for (const [group, value] of parsePairs(s, warn)) {
    const n = Number.parseInt(value, 10);
    if (!Number.isFinite(n) || String(n) !== value) {
      warn(`ignoring non-numeric cap "${group}=${value}"`);
      continue;
    }
    out.set(group, n);
  }
  return out;
}

/** The highest rank whose group the player is in; flags only when no mapped group matches. */
export function rankOf(
  groups: readonly string[],
  rankGroups: Map<Rank, string>,
  flags: { root: boolean; ban: boolean },
): Rank {
  for (let i = RANKS.length - 1; i > 0; i--) {
    const group = rankGroups.get(RANKS[i]);
    if (group !== undefined && groups.includes(group)) return RANKS[i];
  }
  if (flags.root) return "root";
  if (flags.ban) return "eg";
  return "none";
}

export function atLeast(rank: Rank, min: Rank): boolean {
  return RANKS.indexOf(rank) >= RANKS.indexOf(min);
}

/** The "normal" cap (`default`), above which DS skip chances apply. */
export function normalCap(caps: Map<string, number>): number {
  return caps.get("default") ?? DEFAULT_NORMAL_CAP;
}

/** Prefix for a `priority_caps` key that matches admin flag letters instead of a group name. */
export const FLAG_CAP_PREFIX = "flag:";

/**
 * SourceMod flag letters -> ADMFLAG mask: a..n are bits 0..13, z is ROOT (14), o..t are CUSTOM1..6
 * (15..20). Unknown letters are ignored.
 */
export function flagMask(letters: string): number {
  let mask = 0;
  for (const ch of letters.toLowerCase()) {
    const c = ch.charCodeAt(0);
    if (ch === "z") mask |= 1 << 14;
    else if (c >= 97 && c <= 110) mask |= 1 << (c - 97);
    else if (c >= 111 && c <= 116) mask |= 1 << (c - 111 + 15);
  }
  return mask >>> 0;
}

/**
 * The highest cap the player qualifies for, else the default cap. A key is either an admin group
 * name or `flag:<letters>`, which matches when the player holds every listed flag. Flag keys are
 * what MAUL-granted Dedicated Supporters hit: runtime admins carry flags but no group names.
 */
export function capFor(
  groups: readonly string[],
  caps: Map<string, number>,
  hasFlags: (mask: number) => boolean = () => false,
): number {
  let max = normalCap(caps);
  for (const [key, cap] of caps) {
    if (cap <= max) continue;
    if (key.startsWith(FLAG_CAP_PREFIX)) {
      const need = flagMask(key.slice(FLAG_CAP_PREFIX.length));
      if (need !== 0 && hasFlags(need)) max = cap;
    } else if (groups.includes(key)) {
      max = cap;
    }
  }
  return max;
}

/** CTBans `GetMaxBanTime`: seconds an issuer may ban for; 0 = uncapped (console, above commgr, dangerous managers). */
export function maxBanSeconds(
  rank: Rank,
  console: boolean,
  o: { maxMinutes: number; managerMaxMinutes: number; allowDangerous: boolean },
): number {
  if (console) return 0;
  if (atLeast(rank, "root")) return 0;
  if (rank === "manager" || rank === "srmanager" || rank === "commgr") {
    return o.allowDangerous ? 0 : o.managerMaxMinutes * 60;
  }
  return o.maxMinutes * 60;
}
