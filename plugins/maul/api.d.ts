/**
 * @edgegamers/s2s-maul — what MAUL knows about a connected player (s2script interop protocol 2).
 *
 * MAUL looks every player up once they are authenticated; these read that cached answer and never
 * call the MAUL API themselves. Methods are synchronous; payloads are copied.
 */
import type { Notification } from "@s2script/sdk/interfaces";

export interface DsTierEvent {
  /** Decimal SteamID64. */
  steamId: string;
  /** The new tier (see {@link Maul.getDsTier}). */
  tier: number;
  /** The tier before this lookup; 0 for a fresh connect. */
  previous: number;
}

export interface Maul {
  /**
   * The player's Dedicated Supporter tier: 0 = not a supporter (or MAUL has not answered yet),
   * 1 Silver, 2 Gold, 3 Platinum, 4 Royal. Only for players on this server.
   */
  getDsTier(steamId: string): number;
  /** True once MAUL has answered for this player, including "not a member". */
  isVerified(steamId: string): boolean;
}

export declare function getDsTier(steamId: string): number;
export declare function isVerified(steamId: string): boolean;

export interface Contract {
  methods: Maul;
  forwards: {
    /** A lookup finished with a different DS tier than the one cached (usually 0 to N on join). */
    OnDsTierChanged: Notification<DsTierEvent>;
  };
}
