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

export type ShopDeliverySetting = string | number | boolean;

export interface ShopDeliveryRequest {
  itemId: string;
  effect: string;
  settings: Readonly<Record<string, ShopDeliverySetting>>;
}

export interface ShopItemDelivery {
  supports(request: ShopDeliveryRequest): boolean;
  deliver(slot: number, request: ShopDeliveryRequest): boolean;
}

const ITEM_NAMES: Readonly<Record<string, string>> = {
  armor: "Armor",
  healthshot: "Healthshot",
  m4a1: "M4A1",
  taser: "Taser",
  deagle: "One-Shot Revolver",
  stickers: "Stickers",
  dna: "DNA Scanner",
  healthstation: "Health Station",
  compass_body: "Body Compass",
  c4: "C4",
  gloves: "Gloves",
  camo: "Camouflage",
  bodypaint: "Body Paint",
  onehitknife: "One-Hit Knife",
  silentawp: "Silent AWP",
  poisonsmoke: "Poison Smoke",
  poisonshots: "Poison Shots",
  clustergrenade: "Cluster Grenade",
  damagestation: "Hurt Station",
  compass_player: "Player Compass",
  tripwire: "Tripwire",
};

/**
 * Current published Core/SDK APIs expose no player inventory, armor, pawn mutation, or world-effect
 * operations. Record the complete configured intent and fail delivery so the Shop refunds the buyer.
 */
export function createIntendedEffectDelivery(core: Pick<TttCoreApi, "log">): ShopItemDelivery {
  core.log({
    kind: "shop.stock.delivery_unavailable",
    message: "Stock Shop items are configured but unavailable because the public Core/SDK APIs cannot deliver their physical effects.",
    data: { configured: true, purchasable: false },
  });
  return {
    supports() {
      return false;
    },
    deliver(slot, request) {
      const name = ITEM_NAMES[request.itemId] ?? request.itemId;
      core.log({
        kind: "shop.item.delivery_unsupported",
        message: `${name} delivery was attempted, but its physical effect is unavailable through the public Core/SDK APIs.`,
        actorSlot: slot,
        data: {
          itemId: request.itemId,
          effect: request.effect,
          settings: JSON.stringify(request.settings),
        },
      });
      return false;
    },
  };
}
