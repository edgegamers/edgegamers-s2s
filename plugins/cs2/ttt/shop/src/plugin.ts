import { plugin } from "@s2script/sdk/plugin";
import type { TttCoreApi } from "@edgegamers/ttt-core";
import type { TttKarmaApi } from "@edgegamers/ttt-karma";
import type { TttShopApi } from "../api.d.ts";

export default plugin((ctx) => {
  ctx.use<TttCoreApi>("@edgegamers/ttt-core");
  ctx.tryUse<TttKarmaApi>("@edgegamers/ttt-karma");
  ctx.publish<TttShopApi>("@edgegamers/ttt-shop", {} as TttShopApi);
  console.log("[ttt-shop] loaded");
});
