/**
 * Every prisoner and guard spawns with a knife.
 *
 * Neither the C# Jailbreak nor this port ever gave the knife on a normal spawn: both left it to
 * the engine's default loadout. That loadout is not reliable here. A player brought back with
 * `respawn()` (the guard queue filling an empty CT team, special-day respawns) can come back empty-handed,
 * and on some maps the cell spawns end up with no knife at all. So shortly after each spawn, a
 * player who is still alive and holds no knife of any kind is given `weapon_knife`.
 *
 * The give goes through every plugin's pickup gate (CanAcquire), so an RTD "Cannot Use" knife
 * block still refuses it. Special days and last requests own the loadout and are skipped, see
 * knife-logic.ts.
 */
import { after } from "@s2script/sdk";
import { Player } from "@s2script/cs2";
import type { Pawn } from "@s2script/cs2";
import { isAlive } from "@edgegamers/jailbreak-shared";
import { currentMode } from "./round";
import { KNIFE_CHECK_DELAY_MS, needsKnife } from "./knife-logic";
import type { HeldWeapon } from "./knife-logic";

function heldWeapons(pawn: Pawn | null): HeldWeapon[] {
  return (pawn?.weapons ?? [])
    .filter((w) => w.isValid())
    .map((w) => ({
      defIndex: w.attributeManager.item.itemDefinitionIndex ?? -1,
      weaponType: w.data?.weaponType ?? null,
    }));
}

function ensureKnife(userId: number): void {
  const p = Player.fromUserId(userId);
  if (!p) return;
  const pawn = p.pawn;
  const check = { alive: isAlive(p), teamNum: p.teamNum ?? 0, mode: currentMode(), held: heldWeapons(pawn) };
  if (!needsKnife(check)) return;
  if (pawn?.giveNamedItem("weapon_knife")) console.log(`[jailbreak-core] gave a missing spawn knife to ${p.playerName ?? userId}`);
}

/** player_spawn: check for the knife once the spawn loadout has landed. */
export function onPlayerSpawn(slot: number): void {
  if (slot < 0) return;
  const p = Player.fromSlot(slot);
  if (!p) return;
  const userId = p.userId;
  after(KNIFE_CHECK_DELAY_MS, () => ensureKnife(userId));
}
