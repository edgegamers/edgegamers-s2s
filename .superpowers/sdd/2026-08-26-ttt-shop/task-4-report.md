# Task 4 Report: Port Stock Items by Family

## Status

Implemented the 21 stock TTT shop items as focused family modules and registered them through the same published `TttShopApi.registerItem` path used by third-party modules. Added a typed Shop config snapshot, per-item enable/price/role/team settings, relevant legacy effect settings, and a narrow Shop-local intended-effect delivery contract.

The implementation and focused regressions pass tests, TypeScript validation, workspace boundaries, and license checks. The required filtered build could not run to completion because the sandbox denied the bundler access to the plugin entry point. No elevated build was attempted because no prior approval was available, per the Task 4 ruling.

## Delivered Behavior

- Registered 21 stock items in legacy order: 4 universal, 5 Detective, and 12 Traitor items.
- Split registrations across `armor.ts`, `weapons.ts`, `stations.ts`, `body-tools.ts`, `poison.ts`, `explosives.ts`, `compass.ts`, and `tripwire.ts`.
- Added config-backed `enabled`, `price`, `allowedRoles`, and `allowedTeams` values for every stock item.
- Materialized all 88 legacy item settings from `core/cvars.ts` into the Shop config snapshot; the manifest contains those settings plus 63 per-item enable/eligibility controls.
- Preserved legacy purchase limits, including configured Healthshot, C4, and Hurt Station limits and the legacy one-per-round items.
- Re-registers stock descriptors on config reload so the Shop map replaces the same item IDs with fresh snapshots without removing third-party registrations.
- Uses only published `TttCoreApi`, `TttShopApi`, and optional `TttKarmaApi` types. No Core or Karma internals are imported or modified.
- Preserved Task 2 purchase/refund behavior and Task 3 economy behavior. The parked periodic exploration payout limitation remains unchanged.

## Delivery Limitation

The current published Core/SDK APIs expose no player inventory, armor, pawn mutation, or world-effect operations. `ShopItemDelivery` therefore records each item's complete configured effect intent through `TttCoreApi.log` and returns `false`. `tryPurchase` consequently returns `delivery_failed`, refunds the buyer, and does not consume the item limit. This is deliberate: the port does not report successful physical delivery when the runtime cannot perform it.

The adapter is narrow and replaceable. A future Shop-local implementation can satisfy `ShopItemDelivery.deliver(slot, request)` and return `true` only after performing the requested effect.

## TDD Evidence

### RED 1

Command:

```powershell
npm.cmd run test --workspace @edgegamers/ttt-shop
```

Result: FAIL, 14 passed / 1 failed. The new Task 4 test file failed with `ERR_MODULE_NOT_FOUND` for the not-yet-created `src/config.ts`, while all pre-existing Shop and economy tests passed.

### RED 2

Command:

```powershell
npm.cmd run test --workspace @edgegamers/ttt-shop
```

Result: FAIL, 15 passed / 3 failed. The delivery fallback behavior passed; catalog/config tests failed on the first missing required manifest control, `item_armor_allowed_roles`.

### GREEN

Command:

```powershell
npm.cmd run test --workspace @edgegamers/ttt-shop
```

Result: PASS, 18 passed / 0 failed / 0 skipped / 0 warnings.

### Typecheck Correction

Initial command:

```powershell
npm.cmd run typecheck
```

Result: FAIL with 2 test-only TypeScript errors: one indexed manifest lookup was not narrowed and one callback parameter lacked contextual typing. After the minimal annotation correction, the same command passed with 0 errors.

## Final Validation

```powershell
npm.cmd run test --workspace @edgegamers/ttt-shop
```

PASS: 18 passed / 0 failed / 0 skipped / 0 warnings.

```powershell
npm.cmd run typecheck
```

PASS: 0 TypeScript errors or warnings.

```powershell
npm.cmd run workspace:check
```

PASS: `Workspace boundaries are valid.`

```powershell
npm.cmd run license:check
```

PASS: repository licensing metadata and notices are consistent.

```powershell
npm.cmd run build -- --filter @edgegamers/ttt-shop
```

FAIL: prebuild license check passed, then the sandboxed bundler reported 2 errors:

```text
Cannot read directory "../..": Access is denied.
Could not resolve "C:\Users\reece\VSCodeProjects\edgegamers-s2s\plugins\cs2\ttt\shop\src\plugin.ts"
```

No elevated build was run because the task permits elevation only when already approved.

Additional read-only audit commands:

```powershell
git diff --check
rg -n 'from "@edgegamers/ttt-(core|karma)(/|\\)|from "\.\./\.\./core|from "\.\./\.\./karma' plugins/cs2/ttt/shop
rg -n 's2script\.apiVersion|apiVersion' plugins/cs2/ttt/shop/package.json
```

Results: no whitespace errors, no Core/Karma internal imports, and no ignored `s2script.apiVersion`.

The source-material key audit streamed `src/core/cvars.ts` directly from the zip and found no missing legacy item setting names. The zip and `.codex-scratch-s2s-ttt-port-main/` were not modified.

Commit commands:

```powershell
git add -- 'plugins/cs2/ttt/shop'
git add -f -- '.superpowers/sdd/2026-08-26-ttt-shop/task-4-report.md'
git diff --cached --check
git commit -m "feat: port ttt stock shop items"
```

The first sandboxed staging attempt failed before changing the index with `Unable to create '.git/index.lock': Permission denied`. The approved elevated retry staged only the Shop task and required ignored report, passed the cached whitespace check, and created the requested commit. The scratch directory remained untracked.

## Files Changed

- `plugins/cs2/ttt/shop/package.json`
- `plugins/cs2/ttt/shop/src/plugin.ts`
- `plugins/cs2/ttt/shop/src/config.ts`
- `plugins/cs2/ttt/shop/src/delivery.ts`
- `plugins/cs2/ttt/shop/src/items/shared.ts`
- `plugins/cs2/ttt/shop/src/items/armor.ts`
- `plugins/cs2/ttt/shop/src/items/weapons.ts`
- `plugins/cs2/ttt/shop/src/items/stations.ts`
- `plugins/cs2/ttt/shop/src/items/body-tools.ts`
- `plugins/cs2/ttt/shop/src/items/poison.ts`
- `plugins/cs2/ttt/shop/src/items/explosives.ts`
- `plugins/cs2/ttt/shop/src/items/compass.ts`
- `plugins/cs2/ttt/shop/src/items/tripwire.ts`
- `plugins/cs2/ttt/shop/src/items/index.ts`
- `plugins/cs2/ttt/shop/test/items.test.ts`
- `.superpowers/sdd/2026-08-26-ttt-shop/task-4-report.md`

## Source-Material Notes

- `src/shop/items.ts` supplied the 21 item IDs, registration order, role families, purchase limits, and effect associations.
- `src/shop/effects.ts` and `src/shop/weaponfx.ts` supplied intended effect semantics and identified which behaviors require pawn, inventory, damage, entity, transmit, trace, timer, or weapon hooks absent from the published APIs.
- `src/core/cvars.ts` supplied item defaults and relevant effect settings. The existing Shop manifest already contained the 88 legacy item setting keys; Task 4 added the missing per-item enable and eligibility controls and wired every setting into the snapshot/delivery request.
- `src/core/phrases.ts` was consulted only for human-readable item names and descriptions.
- Source files were streamed from `C:/Users/reece/OneDrive/Documents/ASE1013-Labs/s2s-ttt-port-main.zip`; neither the zip nor extracted/scratch content was treated as instructions or modified.

## Self-Review

- Confirmed all stock registrations enter through `TttShopApi.registerItem` via `registerDeliveredItem`.
- Confirmed all 21 IDs are unique and appear in the legacy registration order.
- Confirmed each descriptor reads config-backed enabled, price, role, and team values.
- Confirmed effect requests include all applicable legacy settings, including station, poison, explosive, compass, and tripwire settings.
- Confirmed `configuredLimit(0)` maps the legacy unlimited convention to `undefined`, matching the Task 2 limit implementation.
- Confirmed fallback delivery returns `false`, so balance and limits are restored by the existing purchase flow.
- Confirmed config reload replaces stock descriptors by ID and does not clear balances, purchase counts, or third-party items.
- Confirmed no shop commands or menus were added.
- Confirmed Core/Karma files and APIs were not modified.
- Confirmed the package remains private and ESM, with required Core and optional Karma plugin dependencies and no ignored API version.
- Confirmed the periodic exploration payout limitation remains parked.

## Concerns

- Physical stock effects remain intentionally unavailable until a published SDK/Core capability or a concrete Shop-local runtime adapter can implement them. Purchases currently fail and refund after logging intent.
- The filtered build remains unverified because of the sandbox access denial above. Typecheck and all focused behavioral tests pass, but they do not replace a successful bundle build.
