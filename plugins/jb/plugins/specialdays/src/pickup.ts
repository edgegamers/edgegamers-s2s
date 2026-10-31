/**
 * The pickup gate (AbstractSpecialDay.OnCanAcquire): while a day has executed, players may only pick
 * up the weapons the day allows. Registered once at load; the running day installs its rule.
 */
import { HookResult } from "@s2script/sdk";
import { items, AcquireMethod, AcquireResult } from "@s2script/cs2";
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
}
