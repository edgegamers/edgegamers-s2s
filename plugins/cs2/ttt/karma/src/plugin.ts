import { plugin } from "@s2script/sdk/plugin";
import type { TttCoreApi } from "@edgegamers/ttt-core";

export default plugin((ctx) => {
  ctx.use<TttCoreApi>("@edgegamers/ttt-core");
  console.log("[ttt-karma] loaded");
});
