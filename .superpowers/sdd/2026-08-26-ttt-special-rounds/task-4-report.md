# Task 4 Report: Commands and Round Lifecycle Wiring

Date: 2026-08-27

Status: Complete

Implemented:
- Added `sm_ttt_special` as a generic-admin command (flag `2`) with list, forced-start, and explicit refusal replies.
- Added Core game-state lifecycle wiring for finished cleanup and gated automatic selection using spacing, player, map-round, and chance requirements.
- Added automatic multi-round selection using `special_multi_chance`; registry eligibility continues to enforce conflicts, disabled rounds, `canStart`, and optional plugin requirements.
- Added one plugin frame subscription and the typed `tickActiveRounds(dt)` API for active definition dispatch. The SDK frame callback supplies no delta, so the plugin dispatches `0`.
- Added Speed death handling that seeds the package-local tracked deadline on Speed start and extends valid innocent-victim kills up to the configured maximum.
- Preserved honest unavailable Pistol/Suppressed definitions and public-only Core/Shop dependencies.

Verification:
- Focused Special Rounds tests: 29 passed, 0 failed.
- Typecheck: passed.
- Lint and workspace boundaries: passed.
- Filtered Special Rounds build: passed after the required elevated retry for sandbox-denied esbuild filesystem access.
- Full repository tests: 238 passed, 0 failed.
- `git diff --check`: passed.
- Forbidden import scan: no private Core/Shop imports and no `@s2script/cs2` import.

Concern:
- Core does not expose remaining round time. Speed therefore follows the approved package-local model and extends its tracked configured deadline value rather than querying an authoritative remaining-time value.
