/**
 * @edgegamers/jailbreak-lastrequest — last requests and last guard (protocol 2).
 *
 * Depends on @edgegamers/jailbreak-core (claims the "lastrequest" / "lastguard" round mode) and @edgegamers/jailbreak-warden.
 */
import type { Notification, Transform } from "@s2script/sdk/interfaces";

export interface PlayerRef {
  slot: number;
  userId: number;
  steamId: string;
  name: string;
}

export type LRType =
  | "gun_toss"
  | "rock_paper_scissors"
  | "knife_fight"
  | "no_scope"
  | "coinflip"
  | "shot_for_shot"
  | "mag_for_mag"
  | "race";

export type LRResult = "prisoner_win" | "guard_win" | "timed_out" | "interrupted";

export interface LRInfo {
  /** Unique within the map. */
  id: number;
  type: LRType;
  prisoner: PlayerRef;
  guard: PlayerRef;
  /** "pending" while being set up (countdown, race route), then "active". */
  state: "pending" | "active";
}

export interface LREnabledEvent {
  round: number;
  /** Prisoners still alive when LR became available. */
  prisoners: number;
}

export interface LRStartEvent {
  lr: LRInfo;
}

export interface LREndEvent {
  lr: LRInfo;
  result: LRResult;
}

export interface LastGuardEvent {
  guard: PlayerRef;
  /** Living prisoners at the start. */
  prisoners: number;
}

export interface LastGuardEndEvent {
  guard: PlayerRef;
  /** "guard_win" if the last guard survived the round, else "prisoner_win". */
  result: "guard_win" | "prisoner_win";
}

/** The beacon/tint colour for an LR pair. Patch `color` ("#rrggbb" | "rainbow"). */
export interface LRColorRequest {
  prisoner: PlayerRef;
  guard: PlayerRef;
  color: string;
}

export interface JbLastRequest {
  /** True once LR is available this round (few enough prisoners left). */
  isEnabled(): boolean;
  isInLR(slot: number): boolean;
  getActiveLRs(): LRInfo[];
  isLastGuardActive(): boolean;
}

export declare function isEnabled(): boolean;
export declare function isInLR(slot: number): boolean;
export declare function getActiveLRs(): LRInfo[];
export declare function isLastGuardActive(): boolean;

export interface Contract {
  methods: JbLastRequest;
  forwards: {
    OnLREnabled: Notification<LREnabledEvent>;
    OnLRStart: Notification<LRStartEvent>;
    OnLREnd: Notification<LREndEvent>;
    OnLastGuardStart: Notification<LastGuardEvent>;
    OnLastGuardEnd: Notification<LastGuardEndEvent>;
    OnLRColor: Transform<LRColorRequest, "color">;
  };
}
