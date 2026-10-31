/**
 * @edgegamers/jailbreak-warden — the warden, warden selection, special treatment and peace/mute (protocol 2).
 *
 * Depends on @edgegamers/jailbreak-core. Cosmetic choices (warden icon, special-treatment icon, paint colour) are
 * exposed as Transform forwards so another plugin (e.g. @edgegamers/jailbreak-gangperks) can customise them
 * without warden knowing about it. Colours are wire strings: "#rrggbb", "rainbow" or "" (default).
 */
import type { Notification, Transform } from "@s2script/sdk/interfaces";

export interface PlayerRef {
  slot: number;
  userId: number;
  steamId: string;
  name: string;
}

export type WardenRemovedReason =
  | "pass"
  | "fire"
  | "death"
  | "disconnect"
  | "team_change"
  | "admin"
  | "round_end";

export interface WardenEvent {
  player: PlayerRef;
}

export interface WardenRemovedEvent {
  player: PlayerRef;
  reason: WardenRemovedReason;
}

export interface SpecialTreatmentEvent {
  player: PlayerRef;
  granted: boolean;
}

/** Why everyone (but the warden) was muted. */
export type PeaceReason = "admin" | "warden" | "initial_warden" | "warden_taken";

export interface PeaceEvent {
  active: boolean;
  reason: PeaceReason;
  /** Seconds the prisoner mute lasts (0 when `active` is false). */
  seconds: number;
}

/** The text glyph drawn above a player's head. Patch `icon` to change it. */
export interface IconRequest {
  player: PlayerRef;
  icon: string;
}

/** The warden's paint/laser colour. Patch `color` ("#rrggbb" | "rainbow"). */
export interface PaintColorRequest {
  player: PlayerRef;
  color: string;
}

export interface JbWarden {
  /** Warden slot, or -1. */
  getWarden(): number;
  hasWarden(): boolean;
  isWarden(slot: number): boolean;
  /** Make `slot` warden (must be a living guard and no warden set). */
  setWarden(slot: number): boolean;
  removeWarden(reason: WardenRemovedReason): boolean;
  /**
   * The next time this SteamID joins the warden queue (or types !w while no warden is set) they
   * win it outright — the RTD "guaranteed warden" reward. Lasts until used or the map changes.
   */
  guaranteeWarden(steamId: string): boolean;
  isInQueue(slot: number): boolean;

  isSpecialTreatment(slot: number): boolean;
  setSpecialTreatment(slot: number, granted: boolean): boolean;

  isPeace(): boolean;
  peaceMute(reason: PeaceReason): void;
  unPeaceMute(): void;
}

export declare function getWarden(): number;
export declare function hasWarden(): boolean;
export declare function isWarden(slot: number): boolean;
export declare function setWarden(slot: number): boolean;
export declare function removeWarden(reason: WardenRemovedReason): boolean;
export declare function guaranteeWarden(steamId: string): boolean;
export declare function isInQueue(slot: number): boolean;
export declare function isSpecialTreatment(slot: number): boolean;
export declare function setSpecialTreatment(slot: number, granted: boolean): boolean;
export declare function isPeace(): boolean;
export declare function peaceMute(reason: PeaceReason): void;
export declare function unPeaceMute(): void;

export interface Contract {
  methods: JbWarden;
  forwards: {
    OnWardenAssigned: Notification<WardenEvent>;
    OnWardenRemoved: Notification<WardenRemovedEvent>;
    OnSpecialTreatment: Notification<SpecialTreatmentEvent>;
    OnPeaceChanged: Notification<PeaceEvent>;
    OnWardenIcon: Transform<IconRequest, "icon">;
    OnSpecialIcon: Transform<IconRequest, "icon">;
    OnPaintColor: Transform<PaintColorRequest, "color">;
  };
}
