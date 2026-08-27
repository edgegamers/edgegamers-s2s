# Final Architecture Fix Report

Date: 2026-08-27

## Status

Complete. The Core, Karma, Shop, and Special Rounds plugin boundaries now use structured-copy-safe methods and producer forwards. All twelve review findings are resolved or explicitly represented as unavailable where the public engine API cannot implement the feature.

## Commits Created

- `bbe895d5c95fbcbc3f319ae8846f61ac9a6f3793` - `fix: harden TTT plugin interface boundaries`
- This report is committed separately after generation; its hash is recorded in the final task response.

## Finding Dispositions

1. **Third-party Special Rounds extension boundary: resolved.** `TttSpecialRoundDefinition` is data-only. Public `registerRound` accepts structured descriptors, while behavior runs in an owning plugin through `roundStarted`, `roundTick`, and `roundCleared` producer forwards. Built-in callbacks remain package-internal through `registerLocalRound`. Public API declarations contain no function-valued fields, and the new README documents the extension model.

2. **Core lifecycle and Shop event boundaries: resolved.** Core and Shop retain their `PublishHandle`s and emit copied observations. Karma, Shop, and Special Rounds subscribe through the reserved `.on(event, handler)` on consumer interface handles. No published API exposes a callback-registration method or relies on copied payload mutation.

3. **Mutable Shop callbacks used by Vanilla/Rich: resolved.** Shop now owns named purchase blocks and named positive-gain multipliers through set/clear methods. Vanilla and Rich install and remove namespaced policies during apply/clear. Shop applies those policies internally in `tryPurchase` and balance mutation while keeping refunds, resets, debits, and slot cleanup authoritative. Balance and purchase forwards are observational only.

4. **Karma role-assignment mutation: resolved.** Karma consumes timeouts when Core emits the committed countdown state and calls `core.reserveRole(slot, "ttt:spectator")` before assignment. Core role assignment explicitly honors spectator reservations before quota selection. Focused tests verify reservation timing and consumption.

5. **Speed round deadline extension: resolved.** Core publishes `extendRoundDeadline(seconds, maxRemaining)`, backed by its authoritative runtime deadline. Speed death handling calls it for qualifying kills, extending actual remaining time without shortening it or exceeding the configured cap.

6. **Frame delta time: resolved.** Special Rounds computes frame `dt` from `Server.gameTime`, emits `0` on the first frame or a backward clock jump, and emits elapsed time thereafter. Plugin wiring tests verify `0` followed by `1.5` seconds.

7. **Live Special Rounds config: resolved.** The plugin refreshes its settings snapshot on `ctx.config.onChange`, clears active rounds before replacing settings, and updates every stock descriptor's enabled/weight state. Runtime settings are read through a live getter.

8. **Map-start cleanup: resolved.** `ctx.server.onMapStart` clears active rounds with reason `map_start`, resets automatic-selection spacing, and resets the frame clock. Round-finished and unload cleanup remain in place.

9. **Generic `requiresPlugins`: resolved.** The public API exposes sorted available markers plus `setPluginAvailable(id, available)`. External modules can publish arbitrary namespaced markers; requirements are no longer satisfiable only through the hard-coded Shop probe.

10. **Forced-start diagnostics and unsupported defaults: resolved.** `startRound` returns structured results for unknown, disabled, missing dependency, conflict, already active, and unavailable cases, including details. `sm_ttt_special` renders a distinct response for each refusal. Pistol and Suppressed are named/described as unavailable and default to disabled with zero weight.

11. **BHop cvar restoration: resolved.** BHop captures both prior cvar strings on apply and restores those exact values on clear instead of forcing zero.

12. **Cleanup failure reporting: resolved.** `clearRounds` attempts every active cleanup, returns structured failures, emits clear forwards, and reports callback errors through the Core log hook as `special_round.callback_failed` instead of silently swallowing them.

## Verification

- `npm.cmd test --workspace @edgegamers/ttt-core` - passed, 54/54.
- `npm.cmd test --workspace @edgegamers/ttt-karma` - passed, 30/30.
- `npm.cmd test --workspace @edgegamers/ttt-shop` - passed, 40/40.
- `npm.cmd test --workspace @edgegamers/ttt-special-rounds` - passed, 43/43.
- `npm.cmd run typecheck` - passed.
- `npm.cmd run lint` - passed; workspace boundaries valid.
- `npm.cmd test` - final run passed, 257/257. An earlier final run exposed an ambient-randomness Core fixture; the fixture now injects deterministic randomness and both focused/full reruns pass.
- `npm.cmd run build -- --filter @edgegamers/ttt-core` - passed after the expected elevated retry for sandbox-denied esbuild filesystem access.
- `npm.cmd run build -- --filter @edgegamers/ttt-karma` - passed.
- `npm.cmd run build -- --filter @edgegamers/ttt-shop` - passed.
- `npm.cmd run build -- --filter @edgegamers/ttt-special-rounds` - passed. The first production build exposed an unsupported `Array.prototype.at` use; index access replaced it before the successful rerun.
- `git diff --check` and `git diff --cached --check` - passed.
- Reverse-dependency scans - passed: Core has no Karma/Shop/Special dependency, and Karma/Shop have no Special Rounds dependency.
- Import scans - passed: no private TTT package subpaths, relative private cross-package imports, or `@s2script/cs2` imports.
- Public declaration scan - passed: no function-valued fields in the four published `api.d.ts` files.
- Manifest scan - passed: all four packages remain private ESM packages and none declares ignored `s2script.apiVersion` metadata.

## Remaining Concerns And Parked Limitations

- Pistol and Suppressed remain intentionally unavailable until public inventory/weapon-effect APIs exist.
- Third-party Special Rounds behavior is intentionally owned by the subscribing plugin. Producer forwards cannot report a consumer's apply failure back into the Special Rounds transaction, so extensions must make cleanup idempotent and restore all state they own.
- There is no multi-process Source2Script integration harness in this repository. Boundary behavior is covered with structured clones, simulated interface handles/producer forwards, focused plugin wiring tests, and successful production builds.
- Existing stock Shop physical-effect limitations remain unchanged; descriptors stay honest about unavailable delivery where public runtime capabilities do not exist.
