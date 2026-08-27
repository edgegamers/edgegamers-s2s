# TTT Shop Task 3 Report

## Status

Complete. Added the event-driven TTT Shop economy on `dev`, retaining the published Core/Karma boundaries and deferring periodic exploration movement payouts by the Task 3 ruling.

## TDD Evidence

### Red

- `npm.cmd test -- plugins/cs2/ttt/shop/test/economy.test.ts` failed with `ERR_MODULE_NOT_FOUND` for the initial missing `economy.ts`: 0 passed, 1 failed.
- The same command failed after the starting-credit wiring test was added because `installEconomy` was not exported: 0 passed, 1 failed.
- The same command failed after the solo-kill test was added: 3 passed, 1 failed (`0 !== 19`).
- The same command failed after the round-reset test was added: 6 passed, 1 failed (`5 !== 0`).
- The same command failed after the configuration reader test was added because `createStartingCredits` was not exported: 0 passed, 1 failed. Node also emitted `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)` after this expected module-import failure.
- Mutation checks proved the assist and bad-body-kill tests detect missing behavior: assist removal produced 4 passed, 1 failed (`17 !== 13`); penalty removal produced 8 passed, 1 failed (`30 !== 10`).

### Green

- `npm.cmd test -- plugins/cs2/ttt/shop/test/economy.test.ts plugins/cs2/ttt/shop/test/shop.test.ts` passed: 14 passed, 0 failed.
- The economy tests cover config-sourced starting credits, null/present Karma scaling, role assignment, solo kills, assists, loot, good/bad body settlements, and finished-round reset of balances and item limits.
- Existing Task 2 purchase tests remain included in the focused run.

## Files Changed

- `plugins/cs2/ttt/shop/src/economy.ts` (new): Karma scaling, starting-credit reader, event-driven economy installer, and legacy credit matrices.
- `plugins/cs2/ttt/shop/test/economy.test.ts` (new): fake-Core event wiring tests.
- `plugins/cs2/ttt/shop/src/plugin.ts`: installs Economy with Core, optional Karma, and refreshed shop config.
- `plugins/cs2/ttt/shop/src/shop.ts`: adds round-state reset for balances and per-round purchase counts.
- `plugins/cs2/ttt/shop/api.d.ts`: exposes `resetRound()` to let Economy reset Shop state without reaching into Shop internals.
- `.superpowers/sdd/2026-08-26-ttt-shop/task-3-report.md` (new): this report.

## Validation

Commands run:

- `npm.cmd test -- plugins/cs2/ttt/shop/test/economy.test.ts` (multiple red/green cycles; final focused Economy result: 9 passed, 0 failed).
- `npm.cmd test -- plugins/cs2/ttt/shop/test/economy.test.ts plugins/cs2/ttt/shop/test/shop.test.ts` (14 passed, 0 failed).
- `npm.cmd run typecheck` (passed, 0 TypeScript errors).
- `git diff --check` (passed, no whitespace errors).
- `npm.cmd test` (185 passed, 0 failed). Warning: expected `[ttt] WARN: bus handler for ping threw: Error: handler failure` from the event-bus resilience test.
- `npm.cmd run lint` (passed, 0 errors; workspace boundaries valid).

No build was run: the brief requires focused tests and typecheck at minimum, and no build was necessary to validate this scoped source change. Consequently, no sandbox build error or elevated build was used.

## Self-Review

- Economy consumes only published `TttCoreApi` events and methods. It does not import Core internals.
- The optional Karma dependency is nullable and uses only `karmaOf`; null Karma leaves starting rewards unscaled.
- `scaleExplorationReward(base, karma, slot = 0)` matches the brief verbatim.
- Role, kill, assist, loot, and body reward values follow the legacy economy defaults. Custom/unknown roles receive the legacy `any kill` reward.
- `resetRound()` is public Shop API state, allowing event wiring to reset both balances and purchase limits without a private Shop import.
- The Shop package remains private and ESM; no ignored `s2script.apiVersion` was added. Core and Karma were not changed. Stock items and commands were not ported.
- `.codex-scratch-s2s-ttt-port-main/` remains untracked and was not modified.

## Concerns

Periodic exploration reward runtime behavior is intentionally deferred. The published Core API has no position or frame/tick surface, and Task 3 explicitly prohibits reaching into Core internals or inventing a replacement event rule. The pure Karma scaling helper is present for a later Core API extension or Shop-local movement adapter.

## Review Fix: Unscaled Starting Credits

The review found that `roleAssigned` incorrectly reused `scaleExplorationReward` for starting credits. This halved the default Traitor start from 100 to 50 at Karma 50, even though the helper is reserved for deferred exploration payouts.

- Updated the role-assignment test to expect the configured 100 credits while optional Karma reports 50. It failed first with `50 !== 100` (8 passed, 1 failed).
- Updated the handler to award the configured starting-credit value unchanged. The economy suite then passed with 9 passed, 0 failed.
- Kept `scaleExplorationReward` and its null/present Karma tests unchanged for future exploration payout work.
- No Core, Karma, stock item, or command code was changed.
