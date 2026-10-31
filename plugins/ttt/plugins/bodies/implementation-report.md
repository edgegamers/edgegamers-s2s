# Bodies 2 owner extraction

The approved existing-port canonical store and USE interaction implementation is ready for independent review. No Core, shared ordered-plan, runtime, framework, lockfile, deployment or commit changes were made by this producer author. Core integration is separately owned and is not certified by this report.

## Frozen review boundary

- Candidate: `plugins/bodies/.review/bodies-candidate.s2sp`
- ZIP SHA256: `db69930fee510725517d2300e7ce097e9d4dd90c9289d55b9c20308908ae5d24`
- plugin.js SHA256: `50e1e79fb5e4b224f54ab17d1067245578f17c9e298860567c3ee982517ad740`
- manifest SHA256: `dd3c9d49e50ef6248edb10bb3e12df57ae451ef766336cc5da6a7bc7f844f3dc`
- API SHA256: `b00d85670c32c0afbe8792199301f77d9d780386601ed8f2186270ec74bbb04d`
- Identical body types/wire fragments SHA256: `e86127a34bf09a0aa0e9e3cf77b4503212ef0e3d76d06c3759ed7efd7d593f94`
- Complete source/test/payload inventory: `.review/hashes.json`.
- Original source hashes: `test/baseline.json`; original bodies/interact source snapshots: `.review/baseline-{bodies,interact}.ts`.

The production package publishes only `@edgegamers/ttt-bodies` 2.0.0 with Protocol 2 and hard dependency Core ^2.0.0. Public declarations are the approved finite contract. No callback-valued field, raw native address, new BodyKey, draft or second mutable Body store was introduced.

## Scope and original ordering

`src/bodies.ts` mechanically retains the original native recipe and private array/by-index/by-owner authority: create prop_ragdoll, clear staging bit, set model, spawn, collision group 5/solid 6/VPhysics, teleport to feet+8, then insert before returning. Model selection uses Core's World-applied record followed by the unchanged pure stock role fallback. This is the existing model-writer cache behavior, not an arbitrary native current-model query.

Public views are fresh plain records; genuine SDK EntityRef identity remains the reference value. Full id+index lookup rejects recycled entities. Native liveness is required for native writes; stale metadata still reads and accepts the exact canonical DNA flag mutation. Kill-only cancellation never unindexes. One-owner replacement and clear(true/false) preserve the prior behavior.

`src/interact.ts` retains DNA-first reads, own/identified gates, Gloves inspect refusal, USE spend/carry, paint bridge before identification, and identified assignment only after uncanceled Core observers return. The original two ordered rows remain interact.gameState and interact.leave with unchanged options. It preserves multi-carrier holding, 80–150 hold distance, 120 proximity/200 pickup/210 body traces, original pose/offset, feet+48 beam/feet+64 hold point, cached center updates and actor-null delayed release-zero. Physics membership now retains id+index rather than index alone, as explicitly approved.

`src/preframe.ts` holds ticket closures only. Core's existing global queue owns enqueue order and the 256/128 limits. No second frame/drain subscription is installed. Owner unload closes admission before native cleanup, removes beams/releases retained props, kills corpses, clears indexes and retires all tickets without requiring one final Core callback.

`src/runtime.ts` uses copied Core observations and current genuine Player/Client/pawn refs. Connection retention is keyed by registry generation. Scoped actor invocations restore correctly across nested callbacks; actions do not acquire successor connection authority midway. Ref/current-connection and canonical-record fences surround the new external Core calls. These fences deliberately reject stale operations while preserving the ordinary source sequence and existing multicarrer policy.

## Verification and RED/GREEN

Fresh commands from the workspace root all exited 0:

```
node_modules/.bin/s2s build plugins/bodies
node_modules/.bin/tsc --project plugins/bodies/tsconfig.json
node --test plugins/bodies/test/bodies.test.mjs
```

25 actual ZIP plugin.js outcomes pass. Final output is `.review/green.log`. Initial inert producer archive failed all three meaningful canonical/inspection cases (`.review/red.log`), followed by the implemented archive passing. Further self-review regressions demonstrated failures before fixes:

- Native connection revoked from Core's trailing actor validation still created a corpse: `.review/fence-red.log`; fixed with trailing retained native identity verification.
- Gloves capability callback removed the canonical body yet still spent a charge: `.review/canonical-red.log`; fixed with same-record fencing before spend/carry.
- Nested body replacement initially failed because actor admission incorrectly inherited the outer slot's invocation; scoped admission now permits valid nested actors, restores the outer invocation and prevents its old body from marking the replacement identified.

Coverage includes recipe ordering, native create/model/spawn failures, model selection, settle, owner replacement, exact-reference mutation rejection, clear variants, canceled stale records, DNA/Gloves/paint/identify sequencing, multicarrer release, global queue interleaving/cap/drain, carry pose/center/beam, defuse precedence, physics-ref recycle, connection/body replacement during Core calls, disconnect/reload/map/round cleanup, independent unload and shutdown reentry.

The actual pinned runtime EntityRef constructor/isValid and wire replacer/reviver excerpts are checked into `test/entity-wire-reference.js`, with source commit and SHA metadata adjacent. A test executes these excerpts and the real candidate archive together: stale host-id refs survive copied transport and select the same canonical metadata, with no getters in the resulting wire record. This establishes runtime-JS source plus archive behavior with a stub native validity reader; it is not a live Rust interop/native engine claim.

## Remaining independent gates

Root must separately verify its actual canonical bodyCreate insertion/dead/spoof/event ordering, per-observer write-through DNA after throws, cancellation retention/settle skip, copied event serialization without accessors, finite item gateways and same global queue integration. Producer-side simulated gateway tests do not replace those production Core tests.

No live CS2/client acceptance was performed. Actual ragdoll appearance/collision, carry/drop, corpse networking, paint/DNA visuals and round/reload behavior still require the controlled acceptance gate after independent source review. No supplier/native patch dependency is introduced.
