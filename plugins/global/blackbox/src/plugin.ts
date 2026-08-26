import { plugin } from "@s2script/sdk/plugin";
import { createBlackboxApi } from "./channel.ts";
import type { BlackboxApi } from "../api";

export default plugin((ctx) => {
  ctx.publish<BlackboxApi>("@edgegamers/blackbox", createBlackboxApi());
  console.log("[blackbox] loaded");
});
