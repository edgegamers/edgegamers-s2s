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
  TttShopEvents,
  TttShopItem,
  TttShopListenerOptions,
} from "../api.d.ts";

export interface TttShopOptions {
  karma?: TttKarmaApi | null;
  enabled?: () => boolean;
}

interface Listener<T> {
  handler: (event: T) => void;
  priority: number;
  ignoreCanceled: boolean;
}

export function createShopApi(core: TttCoreApi, options: TttShopOptions = {}): TttShopApi {
  const items = new Map<string, TttShopItem>();
  const balances: number[] = [];
  const purchaseCounts = new Map<string, Map<number, number>>();
  const listeners = new Map<keyof TttShopEvents, Listener<never>[]>();
  const enabled = options.enabled ?? (() => true);

  function on<K extends keyof TttShopEvents>(
    event: K,
    handler: (event: TttShopEvents[K]) => void,
    listenerOptions?: TttShopListenerOptions,
  ): void {
    const entry: Listener<TttShopEvents[K]> = {
      handler,
      priority: listenerOptions?.priority ?? 60,
      ignoreCanceled: listenerOptions?.ignoreCanceled ?? false,
    };
    const list = (listeners.get(event) ?? []) as unknown as Listener<TttShopEvents[K]>[];
    let index = list.length;
    while (index > 0 && list[index - 1]!.priority > entry.priority) index -= 1;
    list.splice(index, 0, entry);
    listeners.set(event, list as unknown as Listener<never>[]);
  }

  function emit<K extends keyof TttShopEvents>(event: K, payload: TttShopEvents[K]): TttShopEvents[K] {
    const snapshot = (listeners.get(event) ?? []).slice() as unknown as Listener<TttShopEvents[K]>[];
    const cancelable = "canceled" in payload;
    for (const entry of snapshot) {
      if (cancelable && entry.ignoreCanceled && (payload as { canceled: boolean }).canceled) continue;
      try {
        entry.handler(payload);
      } catch (error) {
        core.log({
          kind: "shop.event.handler_failed",
          message: `Shop ${String(event)} listener failed: ${String(error)}`,
          data: { event: String(event), error: String(error) },
        });
      }
    }
    return payload;
  }

  function balanceOf(slot: number): number {
    return Number.isInteger(slot) && slot >= 0 ? balances[slot] ?? 0 : 0;
  }

  function changeBalance(
    slot: number,
    proposedBalance: number,
    reason: string,
    source: TttBalanceChangeSource,
    mutable = true,
  ): void {
    const previousBalance = balanceOf(slot);
    if (previousBalance === proposedBalance) return;
    const changing = emit("balanceChanging", {
      slot,
      previousBalance,
      newBalance: proposedBalance,
      reason,
      source,
      mutable,
    });
    const newBalance = mutable ? changing.newBalance : proposedBalance;
    balances[slot] = newBalance;
    emit("balanceChanged", {
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

      const item = items.get(itemId)!;
      const attempt = emit("purchaseAttempt", {
        slot,
        itemId,
        price: item.price,
        balance: balanceOf(slot),
        canceled: false,
      });
      if (attempt.canceled) return "canceled";

      const balanceBeforePurchase = balanceOf(slot);
      changeBalance(slot, balanceBeforePurchase - item.price, item.name, "purchase");

      let delivered = false;
      let deliveryError = "";
      try {
        delivered = item.onPurchase(slot) !== false;
      } catch (error) {
        deliveryError = String(error);
      }
      if (!delivered) {
        changeBalance(slot, balanceBeforePurchase, `${item.name} refund`, "refund", false);
        core.log({
          kind: "shop.purchase.delivery_failed",
          message: `${item.name} delivery failed; the purchase was refunded.`,
          actorSlot: slot,
          data: { itemId, itemName: item.name, price: item.price, error: deliveryError },
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
      emit("purchaseCommitted", committed);
      core.log({
        kind: "shop.purchase.committed",
        message: `${core.player(slot)?.name ?? `Slot ${String(slot)}`} purchased ${item.name} for ${String(item.price)} credits.`,
        actorSlot: slot,
        data: { itemId, itemName: item.name, price: item.price, balance: committed.balance, purchaseCount },
      });
      return "success";
    },
    on,
  };
}
