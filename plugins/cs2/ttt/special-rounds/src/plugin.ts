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
import { Server } from "@s2script/sdk/server";
import type { TttCoreApi } from "@edgegamers/ttt-core";
import type { TttShopApi } from "@edgegamers/ttt-shop";
import type { TttSpecialRoundsApi } from "../api.d.ts";
import { registerSpecialRoundCommands } from "./commands.ts";
import { createSpecialRoundsConfigSnapshot } from "./config.ts";
import { createSpecialRoundLifecycle } from "./lifecycle.ts";
import { createSpecialRoundsApi } from "./special-rounds.ts";
import { registerStockSpecialRounds } from "./stock.ts";

export default plugin((ctx) => {
  const core = ctx.use<TttCoreApi>("@edgegamers/ttt-core");
  const shop = ctx.tryUse<TttShopApi>("@edgegamers/ttt-shop");
  const settings = createSpecialRoundsConfigSnapshot(config);
  const lifecycle = createSpecialRoundLifecycle({ core, config: settings });
  const specials = createSpecialRoundsApi({
    availablePlugins: new Set(shop === null ? [] : ["@edgegamers/ttt-shop"]),
    onRoundStarted: lifecycle.onRoundStarted,
  });
  registerStockSpecialRounds({
    specials,
    core,
    shop,
    config: settings,
    runtime: {
      command: (command) => { Server.command(command); },
      getCvar: (name) => Server.getCvar(name),
      setCvar: (name, value) => { Server.setCvar(name, value); },
    },
  });
  lifecycle.install(specials);
  registerSpecialRoundCommands(ctx.commands, specials);
  ctx.server.onGameFrame(() => { specials.tickActiveRounds(0); });
  ctx.publish<TttSpecialRoundsApi>("@edgegamers/ttt-special-rounds", specials);
  console.log("[ttt-special-rounds] loaded");

  return {
    onUnload: () => { specials.clearRounds(); },
  };
});
