export type MaulBackendVersion = "v1" | "v2";

export interface MaulBanState {
  active: boolean;
  minutes: number;
  reason: string;
}

export interface MaulDsInfo {
  ds?: boolean;
  tier?: number | null;
  tierName?: string | null;
  joinMessage?: string;
}

export interface MaulUserGroup {
  rank: number;
  name?: string;
}

export interface MaulProfile {
  steamId: string;
  found: boolean;
  userId: number;
  name: string;
  divisionTag: string;
  primaryRank: number;
  groups: readonly MaulUserGroup[];
  ds?: MaulDsInfo;
  verified: boolean;
  ban: MaulBanState;
}

export interface MaulGrant {
  groupNames: readonly string[];
  flags: number;
  immunity: number;
  missingGroups: readonly string[];
}

export interface MaulBackendStatus {
  version: MaulBackendVersion;
  ready: boolean;
  description: string;
}

export interface MaulApi {
  profile(steamId: string): MaulProfile | null;
  grant(steamId: string): MaulGrant | null;
  isVerified(steamId: string): boolean;
  refresh(slot: number): boolean;
  backend(): MaulBackendStatus;
}
