/**
 * The pickup gate (AbstractSpecialDay.OnCanAcquire): while a restricted day runs, players may only
 * pick up the weapons the day allows. Registered once at load; the running day installs its rule.
 *
 * Two engine paths are gated. CanAcquire (ItemServices) is what the C# hooked; CanUse
 * (WeaponServices) is asked before a pawn touches a weapon lying on the ground, which is how
 * map-placed guns are picked up. Gating only CanAcquire let players walk over map guns on HE Only.
 */
import { HookResult } from "@s2script/sdk";
import { items, weapons, AcquireMethod, AcquireResult } from "@s2script/cs2";
import type { Player } from "@s2script/cs2";
import { weaponFromDefIndex } from "./weapons.ts";

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
    if (view.method !== AcquireMethod.PickUp) return HookResult.Continue;
    const player = view.player;
    const item = weaponFromDefIndex(view.defIndex);
    if (player === null || item === null) return HookResult.Continue;
    if (rule(player, item)) return HookResult.Continue;
    view.result = AcquireResult.NotAllowedByProhibited;
    return HookResult.Handled;
  });

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
