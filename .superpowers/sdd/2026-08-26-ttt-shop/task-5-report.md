# Task 5 Report: TTT Shop Commands and Menu

## Status

Implementation is ready to commit on the existing `dev` branch. The required package build is blocked by the sandbox before Source2Script can resolve the plugin entry; no elevated retry was made because none was already approved.

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
| `npm.cmd run build -- --filter @edgegamers/ttt-shop` | BLOCKED/FAIL (sandbox): `Cannot read directory "../..": Access is denied.` followed by `Could not resolve "C:\\Users\\reece\\VSCodeProjects\\edgegamers-s2s\\plugins\\cs2\\ttt\\shop\\src\\plugin.ts"`. No elevated retry was made. |
| `git diff --check` | PASS: no whitespace errors. |

## Self-Review

- Confirmed `sm_shop`, `sm_buy`, `sm_balance`, legacy aliases, `sm_list`, `sm_menu`, and generic-admin `sm_ttt_give` are registered.
- Confirmed both direct buys and menu selections refuse before calling `tryPurchase` unless the round is in progress and the player is alive.
- Confirmed item lists hide `wrong_role` entries but keep temporarily unavailable eligible items visible and disabled, matching legacy behavior.
- Confirmed menu selection resolves the item through `shop.itemById()` and performs a fresh purchase attempt, so balances, limits, liveness, and state cannot be trusted from display time.
- Confirmed admin grants resolve only connected active players by exact slot/name or a unique partial name, and report a delivery failure instead of claiming a failed grant succeeded.
- No menu limitation applies to the target SDK: `Menu` supports chat interaction and is used with its chat renderer. The fallback exists only for a runtime missing the SDK menu binding.

## Concern

The package build remains unverified because the current sandbox denies the build tool access to the parent directory it reads while resolving the plugin. All unit tests and typechecking pass, but artifact compilation needs a rerun in an approved environment.
