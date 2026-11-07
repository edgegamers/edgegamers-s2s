/**
 * The pickup gate (AbstractSpecialDay.OnCanAcquire): while a restricted day runs, players may only
 * pick up the weapons the day allows. Registered once at load; the running day installs its rule.
 *
 * Two engine paths are gated. CanAcquire (ItemServices) is what the C# hooked; CanUse
 * (WeaponServices) is asked before a pawn touches a weapon lying on the ground, which is how
 * map-placed guns are picked up. Gating only CanAcquire let players walk over map guns on HE Only.
 */
import { HookResult } from "@s2script/sdk";
import { items, weapons } from "@s2script/cs2";
import type { AcquireMethod, AcquireResult } from "@s2script/cs2";
import type { Player } from "@s2script/cs2";
import { weaponFromDefIndex } from "./weapons.ts";

/**
 * CanAcquire enum values. `@s2script/cs2` declares AcquireMethod/AcquireResult as enums in its types
 * but does not export them at runtime, so reading `AcquireMethod.PickUp` from it throws on every
 * acquire. Values match the engine enums (same as TTT's `cs2/acquire.ts`).
 */
const ACQUIRE_PICKUP = 0 as AcquireMethod;
const ACQUIRE_PROHIBITED = 7 as AcquireResult;

/** Return true to allow `item` for `player`. */
export type PickupRule = (player: Player, item: string) => boolean;

let rule: PickupRule | null = null;
let bypassDepth = 0;

export function setPickupRule(next: PickupRule | null): void {
  rule = next;
}

/** Run `fn` with the gate open (our own giveNamedItem calls). */
export function pickupBypass<T>(fn: () => T): T {
  bypassDepth++;
  try {
    return fn();
  } finally {
    bypassDepth--;
  }
}

/** Load-window only. */
export function registerPickupGate(): void {
  items.onCanAcquire((view) => {
    if (rule === null || bypassDepth > 0) return HookResult.Continue;
    if (view.method !== ACQUIRE_PICKUP) return HookResult.Continue;
    const player = view.player;
    const item = weaponFromDefIndex(view.defIndex);
    if (player === null || item === null) return HookResult.Continue;
    if (rule(player, item)) return HookResult.Continue;
    view.result = ACQUIRE_PROHIBITED;
    return HookResult.Handled;
  });

  // Same caution as the enums: only use the weapon gate when this runtime actually provides it.
  if (typeof weapons?.onCanUse !== "function") {
    console.log("[specialdays] weapons.onCanUse unavailable; ground pickups are gated by CanAcquire only");
    return;
  }
  weapons.onCanUse((view) => {
    if (rule === null || bypassDepth > 0) return HookResult.Continue;
    const player = view.player;
    const weapon = view.weapon;
    if (player === null || weapon === null || !weapon.isValid()) return HookResult.Continue;
    const item = weaponFromDefIndex(weapon.attributeManager.item.itemDefinitionIndex ?? -1);
    if (item === null || rule(player, item)) return HookResult.Continue;
    view.allowed = false;
    return HookResult.Handled;
  });
}
