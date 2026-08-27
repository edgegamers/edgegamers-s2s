/*!
MIT License

Copyright (c) 2026 EdgeGamers, LLC

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/
import type { TttCoreApi } from "@edgegamers/ttt-core";
import type { TttKarmaApi } from "@edgegamers/ttt-karma";
import type { TttPurchaseResult, TttShopApi, TttShopItem } from "../api.d.ts";

export interface TttShopOptions {
  karma?: TttKarmaApi | null;
}

export function createShopApi(core: TttCoreApi, _options: TttShopOptions = {}): TttShopApi {
  const items = new Map<string, TttShopItem>();
  const balances: number[] = [];
  const purchaseCounts = new Map<string, Map<number, number>>();

  function balanceOf(slot: number): number {
    return balances[slot] ?? 0;
  }

  function canPurchase(slot: number, itemId: string): TttPurchaseResult {
    const item = items.get(itemId);
    if (item === undefined) return "not_found";
    if (!item.enabled) return "not_purchasable";
    if (core.gameState().state !== "in_progress") return "not_purchasable";

    const role = core.roleOf(slot);
    if (item.allowedRoles?.includes(role) === false) return "wrong_role";
    if (item.allowedTeams?.includes(core.teamOfRole(role)) === false) return "wrong_role";
    if (item.price > balanceOf(slot)) return "insufficient_funds";
    if (item.limit !== undefined && (purchaseCounts.get(itemId)?.get(slot) ?? 0) >= item.limit) return "limit_reached";

    return item.canPurchase?.(slot) ?? "success";
  }

  return {
    registerItem(item) {
      items.set(item.id, item);
    },
    itemById(id) {
      return items.get(id) ?? null;
    },
    allItems() {
      return [...items.values()];
    },
    balanceOf,
    addBalance(slot, amount) {
      balances[slot] = balanceOf(slot) + amount;
    },
    setBalance(slot, amount) {
      balances[slot] = amount;
    },
    resetRound() {
      balances.length = 0;
      purchaseCounts.clear();
    },
    canPurchase,
    tryPurchase(slot, itemId) {
      const result = canPurchase(slot, itemId);
      if (result !== "success") return result;

      const item = items.get(itemId)!;
      balances[slot] = balanceOf(slot) - item.price;
      if (item.onPurchase(slot) === false) {
        balances[slot] = balanceOf(slot) + item.price;
        return "delivery_failed";
      }

      const countsForItem = purchaseCounts.get(itemId) ?? new Map<number, number>();
      countsForItem.set(slot, (countsForItem.get(slot) ?? 0) + 1);
      purchaseCounts.set(itemId, countsForItem);
      return "success";
    },
  };
}
