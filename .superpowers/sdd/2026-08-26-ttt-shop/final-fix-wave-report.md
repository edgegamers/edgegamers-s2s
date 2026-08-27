# TTT Shop Final Fix Wave Report

## Status

DONE

## Commits Created

- `c8b9b76` - `fix: complete ttt shop final review`

## Finding Dispositions

1. **Public API / Special Rounds integration - fixed.** `plugins/cs2/ttt/shop/api.d.ts` now publishes typed `balanceChanging`, `balanceChanged`, cancelable `purchaseAttempt`, and `purchaseCommitted` events plus typed priority/cancellation subscription options. `src/shop.ts` implements synchronous priority ordering, mutable ordinary balance changes, observable authoritative refund/reset/clear changes, pre-charge cancellation, post-delivery purchase commits, and `shop.purchase.committed` Core logs. Event and ordering coverage is in `test/shop.test.ts`; `README.md` documents the contract.
2. **Stock delivery availability - fixed with the approved unavailable fallback.** `src/delivery.ts` exposes delivery capability checks and logs that the public Core/SDK surface cannot deliver physical effects. `src/items/shared.ts` keeps all configured descriptors registered but returns `not_purchasable` from their runtime gate when the fallback is active, so commands and menus display them as unavailable. `src/plugin.ts` reuses one fallback adapter across config reloads. `test/items.test.ts` verifies all 21 descriptors remain configured while unavailable and that bypassed delivery attempts fail/log honestly.
3. **Exploration income - explicitly unavailable.** Public SDK review found frame/input hooks and generic entity origins, but no authoritative slot-to-player-position mapping; implementing distance rewards would therefore require private/internal APIs or fake input-based movement. `credits_exploration_enabled` now defaults to `false` in `package.json`, `src/config.ts` snapshots it, and `src/economy.ts` exposes `EXPLORATION_INCOME_AVAILABLE = false` and logs `shop.exploration.unavailable` with `active: false` if requested. `src/plugin.ts` logs startup/config-enable requests. `README.md` and `test/economy.test.ts` document and verify the limitation.
4. **Lifecycle - fixed.** `TttShopApi.clearSlot` removes both balance and per-item purchase counts. `src/economy.ts` calls it on Core `leave` and `join` replacement signals. `test/shop.test.ts` and `test/economy.test.ts` cover leave and replacement-slot cleanup.
5. **Body-identify economy gating - fixed.** `src/economy.ts` now requires `core.gameState().state === "in_progress"` before identifier/killer awards. `test/economy.test.ts` covers the finished-round rejection.
6. **`shop_enabled` - fixed.** `src/config.ts` snapshots `shop_enabled`; `src/plugin.ts` shares the live snapshot with `src/shop.ts`, `src/commands.ts`, and `src/economy.ts`. Commands/admin grants, public purchase checks, and all economy awards are disabled while false, while round/slot cleanup remains active. Coverage is in `test/commands.test.ts`, `test/economy.test.ts`, `test/items.test.ts`, and `test/shop.test.ts`.
7. **Delivery exceptions - fixed.** `src/shop.ts` catches delivery exceptions and handles false returns identically: restore the exact pre-purchase balance with an authoritative refund event, do not consume the limit or emit `purchaseCommitted`, log `shop.purchase.delivery_failed`, and return `delivery_failed`. `test/shop.test.ts` covers false and throwing deliveries, including a Rich-style gain multiplier that must not inflate refunds.
8. **Public purchase slot validation - fixed.** `src/shop.ts` now requires an integer nonnegative slot with a non-null connected, participating, alive Core snapshot plus authoritative `isParticipating` and `isAlive` checks. Both `canPurchase` and `tryPurchase` return `not_purchasable` for invalid, disconnected, non-participating, or dead players. `test/shop.test.ts` covers every rejected state.
9. **Stale Task 5 wording - fixed.** `.superpowers/sdd/2026-08-26-ttt-shop/task-5-report.md` now states that the initial sandbox denial was followed by a successful elevated controller build and removes the contradictory unverified-build concern.

## Verification

| Command | Result |
| --- | --- |
| `npm.cmd test --workspace @edgegamers/ttt-shop` | PASS: 38 tests, 4 suites, 0 failures. |
| `npm.cmd run typecheck` | PASS: TypeScript completed with 0 errors. |
| `npm.cmd run lint` | PASS: workspace boundaries valid and ESLint completed with 0 errors. |
| `npm.cmd test` | PASS: 209 tests, 21 suites, 0 failures. |
| `npm.cmd run build -- --filter @edgegamers/ttt-shop` | Initial sandboxed run was access-denied before esbuild resolution. Required elevated retry PASS: emitted `plugins/cs2/ttt/shop/dist/_edgegamers_ttt-shop.s2sp`; license artifact check passed. |
| `git diff --check` | PASS: no whitespace errors. |
| `rg -n "@edgegamers/ttt-shop|ttt/shop" plugins/cs2/ttt/core plugins/cs2/ttt/karma` | PASS: no matches (expected `rg` exit 1), so Core and Karma do not import/depend on Shop. |

## Remaining Concerns

No release-blocking concerns remain. Stock physical effects and movement-based exploration income remain intentionally unavailable until public SDK/Core capabilities can implement them; configuration, runtime availability, and logs now state that limitation without faking success.
