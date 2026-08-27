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
import { plugin } from "@s2script/sdk/plugin";
import { config } from "@s2script/sdk/config";
import type { TttCoreApi } from "@edgegamers/ttt-core";
import type { TttKarmaApi } from "@edgegamers/ttt-karma";
import type { TttShopApi } from "../api.d.ts";
import { registerShopCommands } from "./commands.ts";
import { createShopConfigSnapshot } from "./config.ts";
import { createIntendedEffectDelivery } from "./delivery.ts";
import { createStartingCredits, installEconomy, logExplorationAvailability } from "./economy.ts";
import { registerStockItems } from "./items/index.ts";
import { createShopApi } from "./shop.ts";

export default plugin((ctx) => {
  const core = ctx.use<TttCoreApi>("@edgegamers/ttt-core");
  const karma = ctx.tryUse<TttKarmaApi>("@edgegamers/ttt-karma");
  let shopConfig = createShopConfigSnapshot(config);
  let startingCredits = createStartingCredits(config);
  const delivery = createIntendedEffectDelivery(core);
  const shop = createShopApi(core, { karma, enabled: () => shopConfig.shopEnabled });
  registerStockItems({ core, shop, config: shopConfig, delivery });
  installEconomy({
    core,
    shop,
    karma,
    startingCredits: () => startingCredits,
    enabled: () => shopConfig.shopEnabled,
    explorationIncomeEnabled: shopConfig.explorationIncomeEnabled,
  });
  registerShopCommands(ctx.commands, core, shop, { enabled: () => shopConfig.shopEnabled });
  ctx.config.onChange(() => {
    const previousExplorationSetting = shopConfig.explorationIncomeEnabled;
    shopConfig = createShopConfigSnapshot(config);
    startingCredits = createStartingCredits(config);
    registerStockItems({ core, shop, config: shopConfig, delivery });
    if (!previousExplorationSetting && shopConfig.explorationIncomeEnabled) {
      logExplorationAvailability(core, true);
    }
  });
  ctx.publish<TttShopApi>("@edgegamers/ttt-shop", shop);
  console.log("[ttt-shop] loaded");
});
