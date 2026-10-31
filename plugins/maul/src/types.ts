// src/types.ts — MAUL v1 wire shapes and the domain types the pure modules speak.
// Wire shapes mirror what maul-legacy's src/api/handlers/info.php and maul3's
// (api)/v1/info/[...args]/+server.ts actually serialize.

/** A group entry in the `info` response's `groups` array. */
export interface WireUserGroup {
  rank: number;
  name?: string;
}

/** The `dsInfo` block of the `info` response (Dedicated Supporter). */
export interface WireDsInfo {
  ds?: boolean;
  tier?: number | null;
  tierName?: string | null;
  joinMessage?: string;
  nameColor?: string;
  chatTag?: boolean;
  spotlight?: boolean;
  motdAds?: boolean;
  chatAds?: boolean;
}

/** The `info` endpoint's success body. MAUL serves `{error}` at HTTP 200 on failure. */
export interface WireInfo {
  userid?: number;
  gameid?: string;
  name?: string;
  division?: string;
  divisionName?: string;
  primaryGroup?: string;
  primaryRank?: number;
  groups?: WireUserGroup[];
  dsInfo?: WireDsInfo;
  verification?: boolean;
  verificationExpired?: boolean;
  state?: number | string[];
  error?: string;
}

/** The `banInfo` endpoint's success body. */
export interface WireBanInfo {
  duration?: number;
  reason?: string;
  error?: string;
}

/** `banInfo.duration` sentinel: not banned (MAUL_BANS_UNBANNED). */
export const BAN_UNBANNED = 0;
/** `banInfo.duration` sentinel: permanent ban (MAUL_BANS_PERMABAN). */
export const BAN_PERMANENT = -1;

/** The technical-team rank that additionally inherits the `root` admin group. */
export const RANK_SUPER = 95;

/** One rank's entry in configs/maul_authentication.json. */
export interface RankEntry {
  /** admin_groups.json group name to inherit. */
  group: string;
  /** Name tag for this rank, e.g. "=(eGO)=". Absent = no tag. */
  tag?: string;
  /** Event-gated: only applied when `eventserver` is on (SM's "special" "1"). */
  special?: boolean;
}

/** The parsed ranks table: rank ordinal (as a string key) -> entry. */
export interface RankTable {
  ranks: Record<string, RankEntry>;
}

/** The subset of an s2script AdminGroup the grant fold needs. */
export interface ResolvedGroup {
  flags: number;
  immunity: number;
}

/** What the grant fold produces for one player. */
export interface Grant {
  /** Group names inherited, in fold order (for logging). */
  groupNames: string[];
  /** Union of every inherited group's flag mask. */
  flags: number;
  /** Max of every inherited group's immunity. */
  immunity: number;
  /** Group names referenced by the table but missing from admin_groups.json. */
  missingGroups: string[];
}

/** The environment switches the grant fold reads. */
export interface GrantEnv {
  eventserver: boolean;
}
