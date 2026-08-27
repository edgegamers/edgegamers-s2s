# TTT Shop

`@edgegamers/ttt-shop` provides the TTT credit economy, item registry, purchase API, and Shop commands. The plugin requires `@edgegamers/ttt-core`; `@edgegamers/ttt-karma` remains optional.

## Public Events

Consumers subscribe through `TttShopApi.on`. Lower numeric priorities run first, and equal priorities retain registration order.

A successful purchase follows this order:

1. `canPurchase` validates the module setting, round, player snapshot, liveness, participation, item gates, funds, and limit.
2. `purchaseAttempt` runs. Setting `canceled` returns `canceled` without charging, delivery, or count changes.
3. The debit emits `balanceChanging`, commits the possibly adjusted balance, then emits `balanceChanged`.
4. The item delivery runs.
5. Successful delivery commits the purchase count, emits `purchaseCommitted`, and writes `shop.purchase.committed` through Core logging.

False or throwing delivery restores the exact pre-purchase balance, logs `shop.purchase.delivery_failed`, and returns `delivery_failed` without a committed event or count. `balanceChanging.newBalance` is mutable when `mutable` is true; refund, reset, and leave-clear writes set `mutable` to false so transactional and lifecycle cleanup remains authoritative. Every committed set, add, purchase, refund, reset, and clear balance write emits `balanceChanged`.

## Runtime Availability

The current public Core/SDK surface does not expose inventory, armor, player-pawn mutation, or the world-effect operations required by the 21 stock items. Their configured descriptors remain registered, but the fallback delivery adapter makes `canPurchase` return `not_purchasable`; menus therefore show them as unavailable and no physical effect is reported as delivered. The plugin logs `shop.stock.delivery_unavailable` at startup.

Movement-based exploration income also remains unavailable because the public APIs do not expose an authoritative mapping from player slots to world positions. `credits_exploration_enabled` defaults to `false`. Enabling it does not invent input-based movement rewards; it logs `shop.exploration.unavailable` with `active: false` until a real public position adapter exists.

`shop_enabled` gates commands, purchase APIs, and economy awards. Round resets and player-leave cleanup still run while disabled so stale slot state cannot survive a disable/enable cycle.
