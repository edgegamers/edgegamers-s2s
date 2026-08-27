import { plugin } from "@s2script/sdk/plugin";
import type { TttCoreApi } from "@edgegamers/ttt-core";
import type { TttKarmaApi } from "@edgegamers/ttt-karma";

export default plugin((ctx) => {
  ctx.use<TttCoreApi>("@edgegamers/ttt-core");
  ctx.tryUse<TttKarmaApi>("@edgegamers/ttt-karma");
  console.log("[ttt-shop] loaded");
});
