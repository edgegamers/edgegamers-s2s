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
import type {
  TttBalanceChangeSource,
  TttPurchaseResult,
  TttShopApi,
  TttShopForwards,
  TttShopItem,
} from "../api.d.ts";

export interface TttShopOptions {
  karma?: TttKarmaApi | null;
  enabled?: () => boolean;
  emitForward?<K extends keyof TttShopForwards>(event: K, payload: TttShopForwards[K]): void;
}

export interface TttShopItemDefinition extends TttShopItem {
  canPurchase?(slot: number): TttPurchaseResult | "success";
  onPurchase?(slot: number): void | boolean;
}

export interface TttShopRuntime extends TttShopApi {
  registerItemDefinition(item: TttShopItemDefinition): void;
}

function cloneDescriptor(item: TttShopItem): TttShopItem {
  const descriptor: TttShopItem = {
    id: item.id,
    name: item.name,
    description: item.description,
    price: item.price,
    enabled: item.enabled,
  };
  if (item.allowedRoles !== undefined) descriptor.allowedRoles = [...item.allowedRoles];
  if (item.allowedTeams !== undefined) descriptor.allowedTeams = [...item.allowedTeams];
  if (item.limit !== undefined) descriptor.limit = item.limit;
  return descriptor;
}

export function createShopApi(core: TttCoreApi, options: TttShopOptions = {}): TttShopRuntime {
  const items = new Map<string, TttShopItemDefinition>();
  const balances: number[] = [];
  const purchaseCounts = new Map<string, Map<number, number>>();
  const purchaseBlocks = new Map<string, string>();
  const balanceGainMultipliers = new Map<string, number>();
  const enabled = options.enabled ?? (() => true);

  function registerItemDefinition(item: TttShopItemDefinition): void {
    items.set(item.id, {
      ...cloneDescriptor(item),
      canPurchase: item.canPurchase,
      onPurchase: item.onPurchase,
    });
  }

  function balanceOf(slot: number): number {
    return Number.isInteger(slot) && slot >= 0 ? balances[slot] ?? 0 : 0;
  }

  function changeBalance(
    slot: number,
    proposedBalance: number,
    reason: string,
    source: TttBalanceChangeSource,
    applyMultipliers = true,
  ): void {
    const previousBalance = balanceOf(slot);
    if (previousBalance === proposedBalance) return;
    let newBalance = proposedBalance;
    if (
      applyMultipliers
      && (source === "add" || source === "set")
      && proposedBalance > previousBalance
    ) {
      let multiplier = 1;
      for (const value of balanceGainMultipliers.values()) multiplier *= value;
      newBalance = previousBalance + Math.trunc((proposedBalance - previousBalance) * multiplier);
    }
    balances[slot] = newBalance;
    options.emitForward?.("balanceChanged", {
      slot,
      previousBalance,
      newBalance,
      delta: newBalance - previousBalance,
      reason,
      source,
    });
  }

  function clearSlot(slot: number, reason = "player_leave"): void {
    changeBalance(slot, 0, reason, "clear", false);
    for (const counts of purchaseCounts.values()) counts.delete(slot);
  }

  function validBuyer(slot: number): boolean {
    if (!Number.isInteger(slot) || slot < 0) return false;
    const player = core.player(slot);
    return player !== null && player.connected && player.participating && player.alive &&
      core.isParticipating(slot) && core.isAlive(slot);
  }

  function canPurchase(slot: number, itemId: string): TttPurchaseResult {
    const item = items.get(itemId);
    if (item === undefined) return "not_found";
    if (!enabled() || !item.enabled || core.gameState().state !== "in_progress" || !validBuyer(slot)) {
      return "not_purchasable";
    }

    const role = core.roleOf(slot);
    if (item.allowedRoles?.includes(role) === false) return "wrong_role";
    if (item.allowedTeams?.includes(core.teamOfRole(role)) === false) return "wrong_role";
    if (item.price > balanceOf(slot)) return "insufficient_funds";
    if (item.limit !== undefined && (purchaseCounts.get(itemId)?.get(slot) ?? 0) >= item.limit) {
      return "limit_reached";
    }

    return item.canPurchase?.(slot) ?? "success";
  }

  function deliver(slot: number, item: TttShopItemDefinition): boolean {
    if (item.onPurchase === undefined) return true;
    try {
      return item.onPurchase(slot) !== false;
    } catch {
      return false;
    }
  }

  return {
    registerItem(item) {
      registerItemDefinition(item);
    },
    registerItemDefinition,
    itemById(id) {
      const item = items.get(id);
      return item === undefined ? null : cloneDescriptor(item);
    },
    allItems() {
      return [...items.values()].map(cloneDescriptor);
    },
    balanceOf,
    addBalance(slot, amount, reason = "") {
      changeBalance(slot, balanceOf(slot) + amount, reason, "add");
    },
    setBalance(slot, amount, reason = "") {
      changeBalance(slot, amount, reason, "set");
    },
    clearSlot,
    resetRound() {
      for (let slot = 0; slot < balances.length; slot += 1) {
        changeBalance(slot, 0, "round_reset", "reset", false);
      }
      purchaseCounts.clear();
    },
    canPurchase,
    tryPurchase(slot, itemId) {
      const result = canPurchase(slot, itemId);
      if (result !== "success") return result;
      if (purchaseBlocks.size > 0) return "canceled";

      const item = items.get(itemId)!;
      const balanceBeforePurchase = balanceOf(slot);
      changeBalance(slot, balanceBeforePurchase - item.price, item.name, "purchase");

      const delivered = deliver(slot, item);
      if (!delivered) {
        changeBalance(slot, balanceBeforePurchase, `${item.name} refund`, "refund", false);
        core.log({
          kind: "shop.purchase.delivery_failed",
          message: `${item.name} delivery failed; the purchase was refunded.`,
          actorSlot: slot,
          data: { itemId, itemName: item.name, price: item.price },
        });
        return "delivery_failed";
      }

      const countsForItem = purchaseCounts.get(itemId) ?? new Map<number, number>();
      const purchaseCount = (countsForItem.get(slot) ?? 0) + 1;
      countsForItem.set(slot, purchaseCount);
      purchaseCounts.set(itemId, countsForItem);
      const committed = {
        slot,
        itemId,
        price: item.price,
        balance: balanceOf(slot),
        purchaseCount,
      };
      options.emitForward?.("purchaseCommitted", committed);
      core.log({
        kind: "shop.purchase.committed",
        message: `${core.player(slot)?.name ?? `Slot ${String(slot)}`} purchased ${item.name} for ${String(item.price)} credits.`,
        actorSlot: slot,
        data: { itemId, itemName: item.name, price: item.price, balance: committed.balance, purchaseCount },
      });
      return "success";
    },
    grantItem(slot, itemId) {
      const item = items.get(itemId);
      return item !== undefined && deliver(slot, item);
    },
    setPurchaseBlock(name, reason = "") {
      if (name.trim() === "") throw new Error("purchase block name must not be empty");
      purchaseBlocks.set(name, reason);
    },
    clearPurchaseBlock(name) {
      purchaseBlocks.delete(name);
    },
    setBalanceGainMultiplier(name, multiplier) {
      if (name.trim() === "") throw new Error("balance gain multiplier name must not be empty");
      if (!Number.isFinite(multiplier) || multiplier < 0) {
        throw new Error("balance gain multiplier must be a finite non-negative number");
      }
      balanceGainMultipliers.set(name, multiplier);
    },
    clearBalanceGainMultiplier(name) {
      balanceGainMultipliers.delete(name);
    },
  };
}
