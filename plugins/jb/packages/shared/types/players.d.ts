import { Player } from "@s2script/cs2";
import type { Pawn } from "@s2script/cs2";
import type { Rgb } from "./color";
/**
 * Player queries. A slot is only meaningful *now*: never keep one across an await or a timer
 * without re-checking (`Player.fromUserId(userId)` re-resolves a connection).
 */
/** True if the player's pawn is alive. */
export declare function isAlive(p: Player | null | undefined): boolean;
/** Every connected player on `teamNum` (bots included). */
export declare function playersOn(teamNum: number): Player[];
/** Every living player, optionally restricted to one team. */
export declare function alivePlayers(teamNum?: number): Player[];
export declare const alivePrisoners: () => Player[];
export declare const aliveGuards: () => Player[];
/** The player's team number, or 0 if the slot is empty. */
export declare function teamOfSlot(slot: number): number;
/** Display name for a slot ("" if empty). */
export declare function nameOfSlot(slot: number): string;
/** Tint a pawn's model (alpha < 255 needs a transparent render mode, which this sets). */
export declare function setPawnColor(pawn: Pawn | null | undefined, color: Rgb, alpha?: number): boolean;
