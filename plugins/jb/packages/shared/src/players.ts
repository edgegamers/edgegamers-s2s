import { Player, RenderMode_t } from "@s2script/cs2";
import type { Pawn } from "@s2script/cs2";
import { Team } from "./teams";
import type { Rgb } from "./color";
import { packColor32 } from "./color";

/**
 * Player queries. A slot is only meaningful *now*: never keep one across an await or a timer
 * without re-checking (`Player.fromUserId(userId)` re-resolves a connection).
 */

/** True if the player's pawn is alive. */
export function isAlive(p: Player | null | undefined): boolean {
  if (!p) return false;
  const pawn = p.pawn;
  if (!pawn || !pawn.isValid) return false;
  if (p.pawnIsAlive === false) return false;
  const hp = pawn.health;
  return hp !== null && hp > 0;
}

/** Every connected player on `teamNum` (bots included). */
export function playersOn(teamNum: number): Player[] {
  return Player.all().filter((p) => p.teamNum === teamNum);
}

/** Every living player, optionally restricted to one team. */
export function alivePlayers(teamNum?: number): Player[] {
  return Player.all().filter((p) => isAlive(p) && (teamNum === undefined || p.teamNum === teamNum));
}

export const alivePrisoners = (): Player[] => alivePlayers(Team.Prisoner);
export const aliveGuards = (): Player[] => alivePlayers(Team.Guard);

/** The player's team number, or 0 if the slot is empty. */
export function teamOfSlot(slot: number): number {
  return Player.fromSlot(slot)?.teamNum ?? 0;
}

/** Display name for a slot ("" if empty). */
export function nameOfSlot(slot: number): string {
  const p = Player.fromSlot(slot);
  return p?.playerName ?? "";
}

/** Tint a pawn's model (alpha < 255 needs a transparent render mode, which this sets). */
export function setPawnColor(pawn: Pawn | null | undefined, color: Rgb, alpha = 255): boolean {
  if (!pawn || !pawn.isValid) return false;
  if (alpha < 255) pawn.renderMode = RenderMode_t.RenderTransAlpha;
  pawn.render = packColor32(color, alpha);
  return true;
}
