import type { WireDsInfo, WireUserGroup } from "./types.ts";

export type BackendResult<T> = { ok: true; data: T } | { ok: false; reason: string };

export interface BanState {
  active: boolean;
  minutes: number;
  reason: string;
}

export interface PlayerLookup {
  found: boolean;
  ban: BanState;
  userId: number;
  name: string;
  divisionTag: string;
  primaryRank: number;
  groups: WireUserGroup[];
  ds: WireDsInfo | undefined;
  verified: boolean;
  gameIdPk: number | null;
}

export interface BanRequest {
  steamId: string;
  handle: string;
  bannerIdentity: string;
  bannerUserId: number;
  minutes: number;
  reason: string;
  admins: { steamId: string; userId: number }[];
  note?: string;
  target: PlayerLookup | null;
}

export interface MaulBackend {
  readonly version: "v1" | "v2";
  isReady(): boolean;
  describe(): string;
  lookup(steamId: string, clientIp: string): Promise<BackendResult<PlayerLookup>>;
  ban(request: BanRequest): Promise<BackendResult<unknown>>;
}

export function notFound(): PlayerLookup {
  return {
    found: false,
    ban: { active: false, minutes: 0, reason: "" },
    userId: 0,
    name: "",
    divisionTag: "",
    primaryRank: 0,
    groups: [],
    ds: undefined,
    verified: false,
    gameIdPk: null,
  };
}
