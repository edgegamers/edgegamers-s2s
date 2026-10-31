# World owner extraction

Implemented `@edgegamers/ttt-world` 2.0.0 as a separate owner with a hard Core 2.0 dependency. Scope was only `plugins/world/**` and `packages/contracts/world-{types.ts,wire.d.ts}`. Root owns Core wiring, workspace metadata, ordered owner labels, independent review, commits and deployment. No runtime, supplier, native API, asset or deployment edits were made.

## Frozen candidate

- Stable archive: `.review/world-candidate.s2sp`
- Archive SHA256: `0b00c0db400441aa9e6cb85043ae1a2b99a2f0d60de73b7fc2b103c44faddbc7`
- `plugin.js`: `238985b57204b9926a7178aec077b379b790d63ca2f72eb99e20ea1fad87f07f`
- `manifest.json`: `82317942441eb90c2a78b0a4efa776ffc946ba4eeae4ce3bf86373d37bd4d358`
- API/types: `805f9b2f3c3c6ee83ff5594d4424b1bdf0dd9e86ad3ec8e22219a8058608fd21`
- Both World contract fragments: `7cfd18422701b9e200319a1249244f6e5314ca83c65cc3bc5297cdc5fdf6d494`

Full source and payload hashes are retained in ignored `test/hashes.json`. Stable ZIP bytes do not change when another CLI build updates `dist`.

## Baseline and scope parity

The source baseline is `de5d786:plugins/core/src/cs2/icons.ts`, with the model writer/cache from `cs2/pawn.ts` and global PRE queue semantics from `core/preframe.ts`. Exact original input hashes are in `test/baseline.json`; the mechanical icons diff is retained in `.review/icons-extraction.diff`. This is the existing-port migration, not the superseded Bara expansion.

The copied icons class/body keeps the native creation, spawn keyvalues, inputs, field assignments and ordering. Stock Phoenix/FBI uniforms, renderMode 1, two-prop FollowEntity chain, traitor glow fields, optional two worldtext panels, localised role-letter selection, Stickers, three PRE retries, forced model reassignment and all six original handlers remain. Pure stock constants come from Root's `packages/contracts/role-model.ts`; only World holds the mutable applied-model record.

Six ordered rows remain exactly `icons.roleAssigned`, `icons.death`, `icons.bodyIdentify`, `icons.damage`, `icons.gameState`, `icons.leave`. Their priorities, cancellation flags and installation/local positions are unchanged. Root changes only their owner label to `world`.

The original source has inconsistent historical comments about parking versus destroying markers. Executed behavior was retained: assignment destroys existing markers before spawning; death and leave destroy; countdown destroys; Finished only reveals tags. No pooling or new lifecycle mechanics were introduced. The existing external-marker transmit failure resets its rule and sends Kill; that path remains unchanged.

## Finite owner boundary

Core supplies copied `getWorldPlayers()`, `getWorldSettings()`, and `matchesActor(PlayerActor)` plus its existing finite domain/phrase/game methods. `PlayerActor` uses the existing slot, SteamID, generation and round epoch fields. Genuine SDK EntityRefs remain supported framework values. There are no imported mutable Core registry/pawn objects and no callback-valued wire fields.

World publishes actor-scoped `applyRoleModel`, `appliedModelOf`, `armStickers`, `revealIconToAll`, plus `clearAppliedModels`, pure `roleModel`, `restrictToTraitors`, `hideIcons`, `resetIcons`, `runPreFrame` and the finite ordered handler adapter. Public model readback only returns the recorded value when the genuine current native pawn matches both cached index and host liveness id. This is the old successful-write record, not a newly invented engine model getter.

World does **not** register a frame callback or maintain an independent drain. `Core.scheduleWorldPreFrame(ticket, actor)` enters the original shared Core PRE queue; World privately retains the matching closure and runs it once through `runPreFrame(ticket)`. This preserves mixed Core/World enqueue order, next-frame retry behavior, and the original global 256 waiting / 128 per-frame limits. Refused tickets are dropped; stale private entries are pruned when scheduling, and reset/unload discard all entries. Timers remain SDK POST callbacks that only enqueue their native work onto PRE.

Independent OnEnd discards jobs and handlers, hides every retained marker before child-first Kill, restores original names through retained live Client/controller handles, clears its model cache and precache scope, then releases Core. It does not require a final Core query to restore retained names or clean entities. No global transmit reset is used.

## Explicit lifetime adaptations

Core actor checks and genuine native controller/pawn matching fence actor-scoped operations. Timers retain their scheduling actor/map/round/provider/reset identity, so a late callback cannot reacquire a successor from its slot. Tag restoration retains the original connection and controller instead of looking up a replacement by slot.

Self-review found that **cached tag names also needed that owner identity**: a replacement generation before its old leave notification was tagged with the previous occupant's name. A permanent actual-archive case first failed on that wrong name; cached-name admission now discards the old name when the retained connection/generation is no longer the new owner's. This narrowly documented ownership correction is separate from the unchanged visual recipes.

## Verification and evidence

Fresh final commands, all exit 0:

```
node_modules/.bin/s2s build plugins/world
node_modules/.bin/tsc --project plugins/world/tsconfig.json
node --test plugins/world/test/archive.test.mjs
```

- Initial CLI-compiled empty owner: **15 failing / 1 passing** archive outcomes (`.review/red-build.log`, `.review/red.log`). Failures covered missing real recipes, registrations, deferred models, reveal, cleanup and timers.
- First implementation: **17/17** archive outcomes passed, including the shared Core ticket order/capacity fixture.
- Tag-cache ownership regression against that real archive: **18 passing / 1 failing**, specifically successor name admission (`.review/tag-owner-red.log`).
- Final corrected archive: **19/19 passing**, no skips (`.review/final-tests.log`). Build and strict logs are `.review/final-build.log` and `.review/final-strict.log`.

The archive fixture executes the real CLI-generated JavaScript and manifest. SDK/native operations are controlled test doubles, with exact observable creation/input/field/transmit/name/model outcomes asserted. Coverage includes stock precache, unchanged six handlers, optional panels, glow chain, cache identity and failed writes, staged retry count, expired timer fences, cancelled taser-only Stickers, viewer removal, hide-before-Kill teardown, detached-Core cleanup, map/round/provider/connection invalidation and new-connection tag identity.

These results prove package/type/JavaScript behavior under the modeled SDK boundary. They do not prove actual engine rendering, current native function availability, client networking stability or current live visual acceptance. No live effects were run. Root's Core facade/global queue integration has separate tests and review; it was not independently certified by this producer report.
