# TTT Shop

`@edgegamers/ttt-shop` provides the TTT credit economy, item registry, purchase API, and Shop commands. The plugin requires `@edgegamers/ttt-core`; `@edgegamers/ttt-karma` remains optional.

## Public Interface Boundary

Source2Script copies published interface arguments and return values as structured JSON. Public item descriptors therefore contain data only; delivery callbacks remain private to this package. External plugins can register descriptors and observe a committed purchase through the consumer interface handle:

```ts
const shop = ctx.use<TttShopApi>("@edgegamers/ttt-shop");

shop.on("purchaseCommitted", ({ slot, itemId }: TttShopForwards["purchaseCommitted"]) => {
  // Apply the external plugin's effect for itemId.
});
```

`balanceChanged` and `purchaseCommitted` are copied observational forwards. Mutating their payloads has no effect on Shop state.

Policy changes use named structured methods instead of mutable callback events. `setPurchaseBlock` and `clearPurchaseBlock` add or remove a purchase gate. `setBalanceGainMultiplier` and `clearBalanceGainMultiplier` adjust positive balance gains; debits, refunds, resets, and lifecycle cleanup remain authoritative. Names should be stable and scoped to the calling plugin so every applied policy can be removed during cleanup.

A successful purchase validates the player, item, funds, limits, and active named blocks; debits the balance; performs package-internal delivery when one exists; commits the purchase count; emits the two observational forwards; and logs `shop.purchase.committed`. Failed internal delivery restores the exact pre-purchase balance and does not emit `purchaseCommitted`.

## Runtime Availability

The current public Core/SDK surface does not expose inventory, armor, player-pawn mutation, or the world-effect operations required by the 21 stock items. Their configured descriptors remain registered, but the fallback delivery adapter makes `canPurchase` return `not_purchasable`; menus therefore show them as unavailable and no physical effect is reported as delivered. The plugin logs `shop.stock.delivery_unavailable` at startup.

Movement-based exploration income also remains unavailable because the public APIs do not expose an authoritative mapping from player slots to world positions. `credits_exploration_enabled` defaults to `false`. Enabling it does not invent input-based movement rewards; it logs `shop.exploration.unavailable` with `active: false` until a real public position adapter exists.

`shop_enabled` gates commands, purchase APIs, and economy awards. Round resets and player-leave cleanup still run while disabled so stale slot state cannot survive a disable/enable cycle.
