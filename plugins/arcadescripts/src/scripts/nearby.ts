// ArcadeScripts for s2script. Derived from ArcadeScripts-CSS by Supergosciuツ (GPL-3.0).
// See LICENSE and NOTICE. Shared by the Poison and Lightning ports (upstream GetClosestPlayers).
import type { Pawn } from '@s2script/cs2';
import { distance, pawnAlive, players, same } from '../util';
import type { Vec } from '../util';

/** Living players within `maxDistance` of `origin`, nearest first, excluding one player and one team. */
export function closestPlayers(origin: Vec, maxPlayers: number, maxDistance: number, ignore: Pawn | null, ignoreTeam: number): Pawn[] {
  const found: { pawn: Pawn; distance: number }[] = [];
  for (const { player, pawn } of players()) {
    if (same(pawn.ref, ignore?.ref) || player.teamNum === ignoreTeam || !pawnAlive(pawn)) continue;
    const at = pawn.origin;
    if (!at) continue;
    const d = distance(at, origin);
    if (d <= maxDistance) found.push({ pawn, distance: d });
  }
  found.sort((a, b) => a.distance - b.distance);
  return found.slice(0, maxPlayers).map((entry) => entry.pawn);
}
