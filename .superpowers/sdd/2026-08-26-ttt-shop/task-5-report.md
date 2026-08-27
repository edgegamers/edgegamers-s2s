# Task 5 Report: TTT Shop Commands and Menu

## Status

Implementation was committed on the existing `dev` branch. The task-local sandboxed build was access-denied, and the subsequent controller validation reran the same command with elevated filesystem access successfully.

## Commit

`feat: add ttt shop commands`

## Files Changed

- `plugins/cs2/ttt/shop/src/commands.ts`
  - Adds player shop, purchase, balance, list, menu, and admin item-grant commands.
  - Uses the SDK chat menu runtime when available and cleanly falls back to the text list for a runtime without that binding.
  - Rechecks `core.gameState().state === "in_progress"` and `core.isAlive(slot) === true` before every direct or menu-driven player purchase.
  - Uses only public `TttCoreApi`, `TttShopApi`, and public `TttShopItem` values returned by `itemById`/`allItems`.
- `plugins/cs2/ttt/shop/src/plugin.ts`
  - Wires `registerShopCommands(ctx.commands, core, shop)`.
- `plugins/cs2/ttt/shop/test/commands.test.ts`
  - Adds focused command coverage for aliases, direct purchase gates, role-visible listing, menu selection revalidation, and target-resolved admin grants.

`plugins/cs2/ttt/shop/package.json` remains private and ESM. No `s2script.apiVersion` field was added, and `.codex-scratch-s2s-ttt-port-main/` was left unmodified and untracked.

## TDD Evidence

1. RED: Added `test/commands.test.ts`, then ran `npm.cmd test -- plugins/cs2/ttt/shop/test/commands.test.ts` before implementation. It failed as expected because `src/commands.ts` did not yet exist: 0 passing, 1 failing test file (`ERR_MODULE_NOT_FOUND`).
2. GREEN: Implemented `src/commands.ts` and ran the same focused command test. It passed: 6 tests, 0 failures.
3. A later typecheck identified a test-double contract gap (`registerServer` missing from the `CtxCommands` fixture). The fixture was brought into line with the public SDK interface, then the focused test and typecheck were rerun successfully.

## Validation

| Command | Result |
| --- | --- |
| `npm.cmd test -- plugins/cs2/ttt/shop/test/commands.test.ts` | PASS: 6 tests, 0 failures. |
| `npm.cmd test -- plugins/cs2/ttt/shop/test/shop.test.ts plugins/cs2/ttt/shop/test/economy.test.ts` | PASS: 14 tests, 0 failures. |
| `npm.cmd run typecheck` | PASS: `tsc --noEmit -p tsconfig.base.json` completed with 0 errors. |
| `npm.cmd run build -- --filter @edgegamers/ttt-shop` | PASS on the controller's elevated retry; the initial sandboxed attempt was access-denied before artifact resolution. |
| `git diff --check` | PASS: no whitespace errors. |

## Self-Review

- Confirmed `sm_shop`, `sm_buy`, `sm_balance`, legacy aliases, `sm_list`, `sm_menu`, and generic-admin `sm_ttt_give` are registered.
- Confirmed both direct buys and menu selections refuse before calling `tryPurchase` unless the round is in progress and the player is alive.
- Confirmed item lists hide `wrong_role` entries but keep temporarily unavailable eligible items visible and disabled, matching legacy behavior.
- Confirmed menu selection resolves the item through `shop.itemById()` and performs a fresh purchase attempt, so balances, limits, liveness, and state cannot be trusted from display time.
- Confirmed admin grants resolve only connected active players by exact slot/name or a unique partial name, and report a delivery failure instead of claiming a failed grant succeeded.
- No menu limitation applies to the target SDK: `Menu` supports chat interaction and is used with its chat renderer. The fallback exists only for a runtime missing the SDK menu binding.

## Concern

None. The controller's elevated rerun verified artifact compilation after the task-local sandbox denial.

## Review Fix: Public SDK Menu Runtime

### Finding Addressed

The original command module imported `Menu` and `MenuStyle` as types, so Source2Script could not inject the public runtime binding. It then consulted the private `globalThis.__s2pkg_menu` property and silently used the text list when that property was absent.

### Fix

- Replaced the type-only menu import with `import { Menu, MenuStyle } from "@s2script/sdk/menu"`.
- Removed the private global lookup and its player-menu fallback. Player `sm_shop` and `sm_menu` commands now always construct the public SDK chat menu; server-console callers still receive the normal text listing.
- Reworked the focused command test to install a temporary Node module hook for the public SDK menu module, then dynamically load `commands.ts`. It asserts that `sm_shop` displays a `Menu` with `MenuStyle.Chat` before exercising the existing stale-state/dead-player selection gate. The test no longer defines or injects `__s2pkg_menu`.

### TDD and Validation Evidence

1. RED: The revised focused test failed with `AssertionError: sm_shop should display a public SDK menu` under the previous private-global implementation (5 passing, 1 failing).
2. GREEN: After the value import change, `npm.cmd test -- plugins/cs2/ttt/shop/test/commands.test.ts` passed: 6 tests, 0 failures.
3. `npm.cmd run typecheck` passed with 0 errors.
4. `npm.cmd run build -- --filter @edgegamers/ttt-shop` passed in the controller's elevated validation after the task-local sandbox attempt was access-denied.

### Review

The direct and menu selection paths still require both an in-progress round and a live player before `tryPurchase` is called. Failure reporting, role-filtered catalog entries, and the admin grant path are unchanged.
