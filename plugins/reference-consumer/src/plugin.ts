import type { ReferenceGreetingApi } from "@edgegamers/reference-api";
import { plugin } from "@s2script/sdk/plugin";

export default plugin((ctx) => {
  const greetingApi = ctx.use<ReferenceGreetingApi>(
    "@edgegamers/reference-api",
  );
  console.log(greetingApi.greet("EdgeGamers"));
});
