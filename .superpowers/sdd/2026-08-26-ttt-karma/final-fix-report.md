# TTT Karma Final Fix Report

## Status

Implemented all six final-review findings on the existing `dev` checkout from
`8b88dc9502a874a00ab2aafb565bc22bea41e5d2`. No worktree or subagent was used.
The untracked `.codex-scratch-s2s-ttt-port-main/` directory was read only and
was not modified or staged.

## Findings Addressed

1. **Critical: slot-keyed lifecycle state**
   - Added internal `join(slot, steamId)` and `leave(slot, steamId)` service
     methods and subscribed them to Core `join`/`leave` events through the
     injectable event installer.
   - Hydrates players already active when Karma loads using
     `core.activePlayers()`.
   - Uses `core.player(slot)` while the Core player is still connected to obtain
     the Steam ID; Core event contracts were not changed.
   - Persists Karma, timeout rounds, and warning timestamps by Steam ID.
   - Settles a departing player's pending delta before persistence without
     running the connected-player low-Karma command/reset path.
   - Scrubs Karma initialization/value state, pending deltas, timeout state,
     warning timestamps, bad-kill counts, suppression flags, connection/SteamID
     tracking, and both axes of first-damage history before slot reuse.

2. **Important: participation and winner Karma**
   - Added `karma_per_round` and `karma_per_round_win` manifest configuration
     and snapshot fields.
   - On Core `gameState: finished`, queues a grant for each participating Core
     player, using the Core player snapshot team to compare with the winning
     team, then flushes all round deltas.
   - Preserved legacy semantics: winners receive the win grant; other
     participants receive the regular round grant; nonparticipants receive
     neither.

3. **Important: minimum Karma consequences**
   - Added `karma_low_command` and `karma_warning_window_hours` manifest
     configuration and snapshot fields.
   - Connected players written below `minKarma` now dispatch the configured
     command with `{0}` replaced by the SDK client user ID and reset to
     `defaultKarma`.
   - Moved timeout assignment into the consequence path and rate-limited it by
     the warning window. Repeated below-threshold writes preserve the remaining
     timeout until that window expires.
   - Timeout and warning state follow the Steam ID across reconnects. Explicit
     timeout clearing also clears the warning timestamp.
   - Karma remains unclamped, keeping the below-minimum branch reachable.

4. **Important: suppression API no-op**
   - Implemented a one-shot suppression flag per victim slot.
   - Every death now enters the scorer, so the flag is consumed before invalid
     killer, suicide, spectator, or other early returns.
   - Suppression prevents queued killer/victim deltas while preserving the
     bad-kill multiplier update performed by the scoring pass.
   - Round reset, join, and leave clear stale suppression flags.

5. **Important: event wiring tests absent**
   - Extracted `installKarmaEvents(core, karma, firstDamage?)` into
     `src/events.ts`.
   - Added a fake published Core event bus with complete player snapshots.
   - Added focused wiring tests for timeout role rewriting, winner/participation
     grants and flush ordering, join/leave identity lifecycle, and suppression
     including early-exit consumption.

6. **Minor: package metadata**
   - Added `"type": "module"`, removing the Node test warning.
   - Removed ignored `s2script.apiVersion` metadata.
   - Kept `private: true`, package name `@edgegamers/ttt-karma`, and the required
     dependency direction on `@edgegamers/ttt-core`. Core contains no Karma
     import or reference.

## Files Changed

- `plugins/cs2/ttt/karma/package.json`
- `plugins/cs2/ttt/karma/src/config.ts`
- `plugins/cs2/ttt/karma/src/events.ts` (new)
- `plugins/cs2/ttt/karma/src/karma.ts`
- `plugins/cs2/ttt/karma/src/plugin.ts`
- `plugins/cs2/ttt/karma/test/karma.test.ts`
- `.superpowers/sdd/2026-08-26-ttt-karma/final-fix-report.md` (this report)

`plugins/cs2/ttt/karma/api.d.ts` did not require a signature change; the
published `suppressNextDeathPenalty(victimSlot)` method now has its documented
behavior.

## Commands and Results

### Repository and source inspection

```powershell
git branch --show-current
git rev-parse HEAD
git status --short --branch
git log -5 --oneline --decorate
rg --files plugins/cs2/ttt/karma .superpowers/sdd/2026-08-26-ttt-karma docs/superpowers | Sort-Object
Get-Content -Raw -LiteralPath 'docs/superpowers/plans/2026-08-26-ttt-karma.md'
Get-Content -Raw -LiteralPath 'docs/superpowers/specs/2026-08-26-ttt-modular-design.md'
Get-Content -Raw -LiteralPath '.superpowers/sdd/2026-08-26-ttt-karma/progress.md'
Get-Content -Raw -LiteralPath '.superpowers/sdd/2026-08-26-ttt-karma/review-final-566ad4b..8b88dc9.diff'
Get-Content -Raw -LiteralPath 'plugins/cs2/ttt/karma/package.json'
Get-Content -Raw -LiteralPath 'plugins/cs2/ttt/karma/api.d.ts'
Get-Content -Raw -LiteralPath 'plugins/cs2/ttt/karma/src/config.ts'
Get-Content -Raw -LiteralPath 'plugins/cs2/ttt/karma/src/karma.ts'
Get-Content -Raw -LiteralPath 'plugins/cs2/ttt/karma/src/plugin.ts'
Get-Content -Raw -LiteralPath 'plugins/cs2/ttt/karma/src/commands.ts'
Get-Content -Raw -LiteralPath 'plugins/cs2/ttt/karma/test/karma.test.ts'
rg -n "interface TttEvents|join:|leave:|gameState:|roleAssigning:|interface TttPlayerSnapshot|activePlayers\(\)|player\(" plugins/cs2/ttt/core/api.d.ts
rg -n -C 10 'bus\.emit\("join"|bus\.emit\("leave"|onConnect|onDisconnect' plugins/cs2/ttt/core/src
tar -tf 'C:/Users/reece/OneDrive/Documents/ASE1013-Labs/s2s-ttt-port-main.zip' | Select-String -Pattern 'karma|Karma|cvar|config|command'
tar -xOf 'C:/Users/reece/OneDrive/Documents/ASE1013-Labs/s2s-ttt-port-main.zip' 's2s-ttt-port-main/src/karma/karma.ts'
tar -xOf 'C:/Users/reece/OneDrive/Documents/ASE1013-Labs/s2s-ttt-port-main.zip' 's2s-ttt-port-main/src/core/cvars.ts'
tar -xOf 'C:/Users/reece/OneDrive/Documents/ASE1013-Labs/s2s-ttt-port-main.zip' 's2s-ttt-port-main/src/commands.ts'
```

Result: confirmed `dev` at the required starting commit, with only the protected
scratch directory untracked. Source archive and extracted scratch contents were
used read-only.

### TDD focused test cycles

Exact command for every focused run:

```powershell
npm.cmd test -- plugins/cs2/ttt/karma/test/karma.test.ts
```

- Baseline: **19 passed, 0 failed**; Node emitted the package module-type
  warning later fixed by `"type": "module"`.
- Lifecycle red: **19 passed, 2 failed** (`join` and `clearSlot` absent).
- Lifecycle green: **21 passed, 0 failed**.
- Consequence/suppression red: **22 passed, 3 failed** (minimum reset,
  warning-window rate limiting, and suppression absent).
- Consequence/suppression green: **25 passed, 0 failed**.
- Event wiring red: **1 file-level failure** because `src/events.ts` did not
  exist.
- Event wiring green: **29 passed, 0 failed**.
- Post-metadata focused run: **29 passed, 0 failed**, no warnings.

### Typecheck

```powershell
npm.cmd run typecheck
```

- First run: **failed with 1 error**. `TS2307` reported that source could not
  resolve `@s2script/cs2`.
- Switched the adapter to the published `@s2script/sdk/clients` API.
- Final run: **passed, 0 errors**.

### Required package build

```powershell
npm.cmd run build -- --filter @edgegamers/ttt-karma
```

- First run: **failed with 1 TypeScript error**:
  `TS2550: Property 'replaceAll' does not exist on type 'string'`.
  Replaced it with the legacy-compatible single documented placeholder
  replacement.
- Second in-sandbox run: **failed with 2 sandbox access errors**:
  `Cannot read directory "../..": Access is denied.` and
  `Could not resolve "C:\\Users\\reece\\VSCodeProjects\\edgegamers-s2s\\plugins\\cs2\\ttt\\karma\\src\\plugin.ts"`.
- Retried the exact command with approved elevated sandbox access: **passed**;
  1 of 1 plugin built. License metadata and built-artifact notice checks also
  passed.

### Additional repository gates

```powershell
npm.cmd run lint
npm.cmd test
git diff --check
rg -n '@edgegamers/ttt-karma|ttt/karma' plugins/cs2/ttt/core
```

- Lint/workspace boundaries: **passed, 0 errors**.
- Full test suite: **170 passed, 0 failed, 0 skipped**.
- Diff whitespace check: **passed**.
- Core reverse-dependency search: **no matches** (expected `rg` exit 1).

## Warnings and Concerns

- The initial Node module-type warning is resolved by package metadata.
- The full suite prints `[ttt] WARN: bus handler for ping threw: Error: handler
  failure` from an intentional event-bus resilience test; it is expected and
  the suite passes.
- The configured low-Karma command is dispatched through the SDK and was not
  exercised against a live CS2 server in this fix wave. Unit tests cover the
  service consequence contract, and typecheck/build cover the runtime adapter.
- SteamID persistence is in-memory for the Karma plugin instance, matching the
  reviewed source behavior; durable database persistence across plugin/server
  restarts remains outside this fix wave.
