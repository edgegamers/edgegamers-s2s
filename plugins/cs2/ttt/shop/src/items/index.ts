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
import type { TttShopApi } from "../../api.d.ts";
import type { ShopConfig } from "../config.ts";
import { createIntendedEffectDelivery, type ShopItemDelivery } from "../delivery.ts";
import { registerArmorItems } from "./armor.ts";
import { registerDetectiveBodyTools, registerTraitorBodyTools } from "./body-tools.ts";
import { registerBodyCompassItems, registerPlayerCompassItems } from "./compass.ts";
import { registerC4Items, registerClusterGrenadeItems } from "./explosives.ts";
import { registerPoisonItems } from "./poison.ts";
import { registerDetectiveStationItems, registerTraitorStationItems } from "./stations.ts";
import { registerTripwireItems } from "./tripwire.ts";
import {
  registerDetectiveWeaponItems,
  registerTraitorWeaponItems,
  registerUniversalWeaponItems,
} from "./weapons.ts";

export interface StockItemDependencies {
  core: TttCoreApi;
  shop: TttShopApi;
  config: ShopConfig;
  delivery?: ShopItemDelivery;
}

export function registerStockItems(deps: StockItemDependencies): void {
  const familyDeps = {
    shop: deps.shop,
    config: deps.config,
    delivery: deps.delivery ?? createIntendedEffectDelivery(deps.core),
  };
  registerArmorItems(familyDeps);
  registerUniversalWeaponItems(familyDeps);
  registerDetectiveWeaponItems(familyDeps);
  registerDetectiveBodyTools(familyDeps);
  registerDetectiveStationItems(familyDeps);
  registerBodyCompassItems(familyDeps);
  registerC4Items(familyDeps);
  registerTraitorBodyTools(familyDeps);
  registerTraitorWeaponItems(familyDeps);
  registerPoisonItems(familyDeps);
  registerClusterGrenadeItems(familyDeps);
  registerTraitorStationItems(familyDeps);
  registerPlayerCompassItems(familyDeps);
  registerTripwireItems(familyDeps);
}
