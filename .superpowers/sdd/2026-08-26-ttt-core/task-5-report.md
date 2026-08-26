# Task 5 Report: Port Legacy Core Runtime Behavior

Status: `DONE_WITH_CONCERNS`

## Runtime behavior ported

- Added `createTttCoreApi` backed by Blackbox channel `ttt.round` with capacity `512`.
- Published `@edgegamers/ttt-core` from `src/plugin.ts` after wiring Blackbox, the typed event bus, role registry, round controller, player registry, runtime, body registry, commands, and current-SDK handlers.
- Replaced temporary API player and round callbacks with live slot-indexed player snapshots, alive/participation checks, runtime start/end/deadline operations, and Blackbox log rendering.
- Added a 64-slot player registry with sorted active slots, cached Steam IDs/names, connection generations, map cleanup, participation, and alive state.
- Added runtime round start, minimum-player gating, role assignment events, round deadlines, team-based end checks, intermission return to waiting, and cleanup of per-round player state.
- Extended role assignment to honor stock and third-party ratio definitions while preserving one-shot reservations and string role IDs.
- Added core-owned configuration snapshots and manifest settings using the approved `round_*`, `role_*`, `body_*`, and `visual_*` naming rules and legacy default values.
- Added current-SDK client lifecycle, spawn, death, damage, map, round-start, and frame handlers.
- Added core commands for status/logs, admin round start/end, role diagnostics, one-shot role reservation, and direct role diagnostics.
- Added bounded pre-frame work, body bookkeeping/identification primitives, damage/death event translation, starting-loadout lookup, basic team mapping, HUD chat output, and alive-spoof state foundations.
- Reapplied the legacy core server safety settings for friendly fire, teams, voice, and entity packing.
- Added tests for API delegation/log mapping, player state, config duration, runtime lifecycle, canceled corpse creation, map cleanup, stock ratios, and third-party role ratios.
- Added `"type": "module"` and included package tests in the package TypeScript project, removing the prior module-format warning and package lint project-service failure.

## Legacy source used

The following archive files were consulted as behavior source and adapted to the modular contracts:

- `src/core/registry.ts`
- `src/core/preframe.ts`
- `src/core/msgs.ts`
- `src/core/phrases.ts`
- Core-owned defaults from `src/core/cvars.ts`
- `src/game/game.ts`
- `src/game/roles.ts`
- `src/game/teams.ts`
- `src/cs2/pawn.ts`
- `src/cs2/bodies.ts`
- `src/cs2/combat.ts`
- `src/cs2/handlers.ts`
- `src/cs2/hud.ts`
- `src/cs2/interact.ts`
- `src/cs2/inventory.ts`
- `src/cs2/spoof.ts`
- Core command behavior from `src/commands.ts`
- Runtime wiring and safety settings from `src/plugin.ts`

The following were intentionally not copied:

- All `src/karma`, `src/shop`, and `src/special` content.
- `src/core/teardown.ts`, because it directly couples all legacy subsystems.
- `src/core/enums.ts`, because public roles remain string IDs and the Task 1-4 contracts are authoritative.
- `src/core/bus.ts` and `src/core/events.ts`, because the Task 2 typed event bus and public event declarations were preserved.
- The monolithic `src/core/cvars.ts`; only core-owned defaults were adapted into the package manifest and snapshot.
- Legacy entity helpers requiring the unavailable archive dependency `@s2script/cs2` 0.11.1 were not copied verbatim into the current `@s2script/sdk` 0.21.x package.

## Validation

- `npm.cmd test -- plugins/cs2/ttt/core/test/events.test.ts plugins/cs2/ttt/core/test/roles.test.ts plugins/cs2/ttt/core/test/round.test.ts`: PASS, 11 tests.
- `npm.cmd test -- plugins/cs2/ttt/core/test/*.test.ts`: PASS, 21 tests.
- `npm.cmd run typecheck`: PASS.
- `rg -n '"../karma|../shop|../special|./karma|./shop|./special"' plugins/cs2/ttt/core/src`: no matches. Ripgrep returned exit code 1 because the result set was empty.
- `npm.cmd run build -- --filter @edgegamers/ttt-core`: BLOCKED in the root prebuild license check. The existing workspace layout rejects `plugins/cs2/ttt/core/package.json` because it is nested inside the pre-existing `plugins/cs2/ttt` package.
- `npm.cmd run build --workspace @edgegamers/ttt-core`: PASS with approved elevated filesystem access. Produced `plugins/cs2/ttt/core/dist/_edgegamers_ttt-core.s2sp`.
- `git diff --check`: PASS.

## Files changed

- `plugins/cs2/ttt/core/api.d.ts`
- `plugins/cs2/ttt/core/package.json`
- `plugins/cs2/ttt/core/tsconfig.json`
- `plugins/cs2/ttt/core/src/api.ts`
- `plugins/cs2/ttt/core/src/commands.ts`
- `plugins/cs2/ttt/core/src/config.ts`
- `plugins/cs2/ttt/core/src/messages.ts`
- `plugins/cs2/ttt/core/src/players.ts`
- `plugins/cs2/ttt/core/src/plugin.ts`
- `plugins/cs2/ttt/core/src/preframe.ts`
- `plugins/cs2/ttt/core/src/roles.ts`
- `plugins/cs2/ttt/core/src/round.ts`
- `plugins/cs2/ttt/core/src/runtime.ts`
- `plugins/cs2/ttt/core/src/cs2/bodies.ts`
- `plugins/cs2/ttt/core/src/cs2/combat.ts`
- `plugins/cs2/ttt/core/src/cs2/handlers.ts`
- `plugins/cs2/ttt/core/src/cs2/hud.ts`
- `plugins/cs2/ttt/core/src/cs2/interact.ts`
- `plugins/cs2/ttt/core/src/cs2/inventory.ts`
- `plugins/cs2/ttt/core/src/cs2/pawn.ts`
- `plugins/cs2/ttt/core/src/cs2/spoof.ts`
- `plugins/cs2/ttt/core/src/cs2/teams.ts`
- `plugins/cs2/ttt/core/test/api.test.ts`
- `plugins/cs2/ttt/core/test/config.test.ts`
- `plugins/cs2/ttt/core/test/players.test.ts`
- `plugins/cs2/ttt/core/test/roles.test.ts`
- `plugins/cs2/ttt/core/test/runtime.test.ts`
- `.superpowers/sdd/2026-08-26-ttt-core/task-5-report.md`

## Remaining parity gaps and concerns

- The archive's concrete pawn/entity runtime depends on `@s2script/cs2` 0.11.1, which is not installed in this monorepo. Current SDK 0.21.x exposes generic clients/events but not the pawn APIs used by the archive.
- The runtime does not yet apply health, armor, starting weapons, inventory stripping, physical team switches, role map contexts, voice masks, corpse entities/models/physics, body-use traces, prop carrying, role icons/glows, look-at-name HUD, or scoreboard alive netvar spoofing.
- Damage currently translates from post-event `player_hurt`; canceled `damage` events cannot prevent engine damage without a complete current-SDK damage/pawn adapter.
- The configured countdown is not yet driven through a timed `countdown` state; eligible servers begin the core round immediately.
- AFK behavior and phrase-file overrides are represented by configuration/message foundations but are not fully wired.
- Assignment honors the Task 3 public ratio definitions, which intentionally remain authoritative; those definitions differ from the archive's stock `ceil((n - 1) / 5)` Traitor and `ceil(floor(n / 8) / 1.5)` Detective formulas. Assignment is deterministic and does not yet port previous-role rotation/random candidate selection.
- A canceled or rewritten `roleAssigning` result does not refill the original role quota as the archive did.
- The exact root filtered build cannot pass until the controller resolves the nested `plugins/cs2/ttt` workspace layout. The core package itself typechecks, lints, builds, and emits an artifact in isolation.
