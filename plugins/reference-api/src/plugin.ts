import { plugin } from "@s2script/sdk/plugin";
import type { ReferenceGreetingApi } from "../api";
import { formatGreeting } from "./greeting.ts";

export default plugin((ctx) => {
  ctx.publish<ReferenceGreetingApi>("@edgegamers/reference-api", {
    greet: formatGreeting,
  });
});
