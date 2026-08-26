import { plugin } from "@s2script/sdk/plugin";
import type { BlackboxApi } from "@edgegamers/blackbox";

export default plugin((ctx) => {
  ctx.use<BlackboxApi>("@edgegamers/blackbox");
  console.log("[ttt-core] loaded");
});
