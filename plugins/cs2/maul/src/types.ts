export interface WireUserGroup {
  rank: number;
  name?: string;
}

export interface WireDsInfo {
  ds?: boolean;
  tier?: number | null;
  tierName?: string | null;
  joinMessage?: string;
}

export interface WireInfo {
  userId: number;
  name: string;
  divisionTag: string;
  primaryRank: number;
  groups: WireUserGroup[];
  ds?: WireDsInfo;
}

export interface WireBanInfo {
  active: boolean;
  minutes: number;
  reason: string;
}

export const BAN_UNBANNED = 0;
export const BAN_PERMANENT = -1;

export const RANK_SUPER = 95;

export interface RankEntry {
  group: string;
  tag?: string;
  special?: boolean;
}

export interface RankTable {
  ranks: Record<string, RankEntry>;
}

export interface ResolvedGroup {
  flags: number;
  immunity: number;
}

export interface Grant {
  groupNames: string[];
  flags: number;
  immunity: number;
  missingGroups: string[];
}

export interface GrantEnv {
  eventserver: boolean;
}
