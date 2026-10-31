// src/backend.ts — the version-agnostic MAUL contract.
//
// v1 and v2 differ enough that the rest of the plugin should not know which is in use:
//
//   v1  two GETs (banInfo + info), base64url path args, raw API key in AUTHORIZATION.
//   v2  ONE POST (players/lookup) returning ban status AND profile together, JSON bodies,
//       raw key for lookup but a short-lived JWT for writes, and penalties keyed by an
//       internal GameId PK rather than a SteamID.
//
// Everything downstream (auth.ts, bans.ts, commands.ts) speaks the domain types below.

import type { WireDsInfo, WireUserGroup } from "./types.ts";

/** A call either yields data or a reason the caller can log and retry on. */
export type BackendResult<T> = { ok: true; data: T } | { ok: false; reason: string };

/** Ban state as the plugin cares about it, normalized across versions. */
export interface BanState {
  /** True if a ban is currently in force. */
  active: boolean;
  /** Minutes remaining; 0 with `active` true means permanent. */
  minutes: number;
  reason: string;
}

/** Everything one lookup yields. `found: false` = MAUL has no record (a pub user). */
export interface PlayerLookup {
  found: boolean;
  ban: BanState;
  userId: number;
  /** The forum/MAUL display name, or "" when unknown. */
  name: string;
  divisionTag: string;
  primaryRank: number;
  groups: WireUserGroup[];
  ds: WireDsInfo | undefined;
  verified: boolean;
  /**
   * v2's internal GameId primary key, needed to issue a penalty. Null on v1, which addresses
   * bans by SteamID instead — the reason `ban()` takes the whole lookup rather than an id.
   */
  gameIdPk: number | null;
}

/** What a ban push needs, independent of how the backend addresses the target. */
export interface BanRequest {
  steamId: string;
  /** The banned player's display name, recorded with the ban. */
  handle: string;
  /** The admin's SteamID64, or "" for a console/system ban. */
  bannerIdentity: string;
  minutes: number;
  reason: string;
  /**
   * Admins online to witness the ban. Carries BOTH identifiers because the versions disagree:
   * v1 wants a CSV of game ids (SteamID64s), v2 wants a CSV of MAUL user ids.
   */
  admins: { steamId: string; userId: number }[];
  note?: string;
  /**
   * The cached lookup for this player, when one exists.
   *
   * No longer required to issue a ban: both API versions now target the player by their in-game id
   * (v2 gained `gameIdValue` in maul3 !141), so an offline ban needs nothing from here.
   */
  target: PlayerLookup | null;
}

/** The operations the plugin needs from MAUL, in either API version. */
export interface MaulBackend {
  /** Which version this is, for logs and sm_maul_status. */
  readonly version: "v1" | "v2";
  /** True once the backend has everything it needs to make a call (key, identity, …). */
  isReady(): boolean;
  /** A one-line description of the resolved endpoint, for sm_maul_status. */
  describe(): string;
  /** Ban status + profile in one domain result. */
  lookup(steamId: string, clientIp: string): Promise<BackendResult<PlayerLookup>>;
  /** Record a ban. */
  ban(request: BanRequest): Promise<BackendResult<unknown>>;
}

/** An empty lookup — the shape returned for a player MAUL has never seen. */
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
