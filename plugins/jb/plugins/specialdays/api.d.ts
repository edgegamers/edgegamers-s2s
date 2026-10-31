/**
 * @edgegamers/jailbreak-specialdays — special days (protocol 2).
 *
 * Depends on @edgegamers/jailbreak-core (claims the "specialday" round mode). A special day runs for one round.
 */
import type { Notification } from "@s2script/sdk/interfaces";

export type SDType =
  | "custom"
  | "bhop"
  | "ffa"
  | "fog"
  | "gungame"
  | "ghost"
  | "he"
  | "hns"
  | "infection"
  | "noscope"
  | "oitc"
  | "rocketjump"
  | "speedrun"
  | "teleport"
  | "warday";

export interface SDInfo {
  type: SDType;
  /** Display name, e.g. "Hide and Seek". */
  name: string;
  round: number;
  /** SteamID64 of whoever started it ("0" for the server/auto). */
  starterSteamId: string;
}

export interface SDStartEvent {
  day: SDInfo;
}

export interface SDEndEvent {
  day: SDInfo;
}

export interface JbSpecialDays {
  isRunning(): boolean;
  /** The running day, or null. */
  getCurrent(): SDInfo | null;
  /** Rounds played since the last special day ended. */
  roundsSinceLast(): number;
}

export declare function isRunning(): boolean;
export declare function getCurrent(): SDInfo | null;
export declare function roundsSinceLast(): number;

export interface Contract {
  methods: JbSpecialDays;
  forwards: {
    /** After the day's setup ran (teams, weapons, cells). */
    OnSpecialDayStart: Notification<SDStartEvent>;
    OnSpecialDayEnd: Notification<SDEndEvent>;
  };
}
