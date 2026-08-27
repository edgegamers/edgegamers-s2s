# TTT Special Rounds

`@edgegamers/ttt-special-rounds` selects weighted round descriptors and coordinates built-in and third-party special-round behavior.

## Extension Boundary

Published interface values cross the Source2Script plugin boundary as structured JSON. `registerRound` therefore accepts data only. An external plugin implements behavior by registering a descriptor and subscribing to copied forwards on its consumer interface handle:

```ts
const specials = ctx.use<TttSpecialRoundsApi>("@edgegamers/ttt-special-rounds");

specials.registerRound({
  id: "example:lights-out",
  name: "Lights Out",
  description: "An example extension round.",
  enabled: true,
  weight: 1,
  requiresPlugins: ["example:lighting"],
});
specials.setPluginAvailable("example:lighting", true);

specials.on("roundStarted", ({ id }: TttSpecialRoundsForwards["roundStarted"]) => {
  if (id === "example:lights-out") {
    // Apply this plugin's effect.
  }
});
specials.on("roundTick", ({ id, dt }: TttSpecialRoundsForwards["roundTick"]) => {
  if (id === "example:lights-out") {
    // Advance this plugin's effect by dt seconds.
  }
});
specials.on("roundCleared", ({ id }: TttSpecialRoundsForwards["roundCleared"]) => {
  if (id === "example:lights-out") {
    // Restore all state owned by this plugin.
  }
});
```

Forward payloads are observational copies and cannot mutate producer state. Module authors should use a stable namespaced round ID, publish dependency markers with `setPluginAvailable`, and make `roundCleared` cleanup idempotent.

`startRound` returns a structured refusal reason for unknown, disabled, dependency-blocked, conflicting, already-active, and unavailable descriptors. `clearRounds` returns any local cleanup failures; the producer also records them through Core logging.
