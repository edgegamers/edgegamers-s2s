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

import type { TttShopApi, TttShopItem } from "../../api.d.ts";
import type { ShopConfig } from "../config.ts";
import type { ShopDeliveryRequest, ShopItemDelivery } from "../delivery.ts";

export interface StockItemFamilyDependencies {
  shop: TttShopApi;
  config: ShopConfig;
  delivery: ShopItemDelivery;
}

export function registerDeliveredItem(
  deps: StockItemFamilyDependencies,
  item: Omit<TttShopItem, "onPurchase">,
  request: ShopDeliveryRequest,
): void {
  const configuredGate = item.canPurchase;
  deps.shop.registerItem({
    ...item,
    canPurchase(slot) {
      const configuredResult = configuredGate?.(slot) ?? "success";
      if (configuredResult !== "success") return configuredResult;
      return deps.delivery.supports(request) ? "success" : "not_purchasable";
    },
    onPurchase(slot) {
      return deps.delivery.deliver(slot, request);
    },
  });
}

export function configuredLimit(maxPurchases: number): number | undefined {
  return maxPurchases > 0 ? maxPurchases : undefined;
}
