# TTT cross-plugin review — October 3, 2026 (Denver)

**Finding:** cross-plugin communication is a demonstrated contributor to TTT's synchronous frame cost. The exact framework deep-clones two complete wire contracts on every typed method call; TTT amplifies that fixed cost through synchronous feature dispatch and repeated authority queries. This is a good repair target, but the evidence does **not** establish it as the sole cause of the remaining 100–197 ms native reports or the historical second-long stalls.

Review was read-only for both source repositories, with a local isolated Rust benchmark under `/tmp/s2s-ttt-bridge-bench`. No server access, source modifications, deployments, or GitHub actions were performed. The unrelated dirty framework checkout was not used.

## Evidence identity and current acceptance

TTT root (`T` below): `/Users/ghirakawa/.codex/worktrees/old-port-api-upgrade/s2s-ttt`, HEAD `ae4cdcaf4d61d1b72c77df0d75113a6b522c246e`, accepted gameplay baseline `9b60c80`. Framework root (`F`): `/Users/ghirakawa/projects/s2script-output-adapter-fix`, HEAD `98a005d396d66d4c83ec67bed59060f732f87e8d`. This is the isolated installed-version source plus named-output repair, not the user's dirty framework repository.

The repaired normal moving-bot, Bodies-enabled first arm ran 606.746808 s from the actual first deal, PID 838409 surviving throughout: nine natural deals, 45 corpse creations, 41 frees, no crash/new dump/runtime error. Applied-damage delta 174 covers the slightly larger command-free interval. It emitted 1,551 native reports, including 1,251 single-tick and 300 multi-tick reports; 19 >=100 ms, zero >=1,000 ms, maximum 196.79 ms. These are emitted reports, not all simulated frames or percentile samples. Receipt: `/tmp/s2s-ttt-output-repair-combat-arm1-accepted-window-result-20261004.json`, SHA-256 `f85d72060795eb3e01b9cf435f8b1b8f7bcea892e75bb8d3a4f905ab4116d1ad`. This arm establishes bounded repaired-runtime survival with real combat; it does not attribute elapsed time or prove resolution of the original stalls. The concurrent second arm was not accessed.

## Ranked findings

### 1. Confirmed avoidable framework cost: full metadata copies per call

`F/core/js/prelude.js:1976` creates typed handles; each invoked method reaches `__s2_iface_call` at line 1982. Optional watched handles additionally check their attachment token at lines 2014–2016. These are synchronous calls.

The exact Rust chain is:

1. `F/core/src/v8host.rs:1991` (`s2_iface_call`) resolves the caller and `IFACES.call_target`; `F/core/src/interfaces.rs:184` checks version, compiled type hash and method membership.
2. `v8host.rs:2023` invokes `checked_contract`. `F/core/src/v8host/interop_wire.rs:78–89` clones the publisher's **entire** `Contract`, then the consumer's **entire** expected `Contract`. `Contract`, `Metadata`, `Method`, `Schema`, and nested `Field` use recursively derived `Clone` (`F/core/src/interop.rs:7–66`); these are owned trees, strings, maps and vectors, not shared pointers.
3. `checked_contract` still checks live producer generation, exact metadata digest equality and verified import (lines 90–108). The expected clone is dropped on return.
4. `v8host.rs:2042–2045` clones the selected method again. Argument copying/selected-schema validation is at lines 2057–2060. Provider invocation occurs through a V8 context switch and `f.call` (lines 2113–2142). Result copying/selected-schema validation is at lines 2151–2154, followed by reentrant-generation checks at lines 2174–2182 and result reconstruction at line 2185.

**Correction to the initial suspicion:** the entire contract is not revalidated or rehashed on every call. Whole-contract `validate()` is at manifest admission (`interop.rs:221–267`) and publication (`v8host.rs:1883`); per-crossing validation applies to the selected arguments/result/payload. The costly hot-path operation demonstrated here is repeated complete metadata cloning and destruction, in addition to wire-value copying.

A generic protocol-2 forward also has amplification: `v8host.rs:2343` clones its publisher contract once; line 2440 runs `checked_contract` for each live subscriber, cloning both full contracts each time. For N subscribers reaching both contract checks this means 1+2N full clones, before nested calls. Checking precedes context lookup, so that count can exceed delivered handlers when later lookup skips a subscriber. **TTT's ordered domain dispatch is primarily method-based `handleDomain`, so this forward formula must not be indiscriminately applied to TTT domain events.**

### 2. Confirmed caller amplification; ordering and authority fences remain necessary

`T/plugins/core/src/core/ordered.ts:17–24` synchronously walks its ordered event snapshot. Each remote entry copies the event and calls `provider.handleDomain` at lines 62–64; `T/packages/contracts/ordered.ts:83–95` invokes the owner callback and returns the mutation reply before the next observer. World exposes this at `T/plugins/world/src/plugin.ts:21`; nested World events return through `core.dispatchDomain` at line 15. Therefore transition cost includes nested owner work and nested crossings, not merely the outer method's carrier.

World's bounded observations already remove many redundant crossings. Remaining intentional chain: `withWorldPlayer` captures `getWorldActionContext` (`T/plugins/world/src/runtime.ts:44–48,159–170`), local reads use the copied view (`151–154`), and native mutation admission reaches the current Core stamp through `nativePawnCurrent` → `actionCurrent` → `contextCurrent` (`139–149,135–137,39–42`). Those small authority checks still pay the whole Core contract clone cost. Preserve the exact controller/pawn, connection and provider checks; optimize the bridge around them.

Core PRE invokes its feature ticks synchronously (`T/plugins/core/src/plugin.ts:605–636`). Communication's all-alive preflight still makes a small Core call (`T/plugins/communication/src/communication.ts:72–79`); dead-player changes use full snapshots before and after native voice writes (`87–100`). Bodies retains repeated actor/native checks (`T/plugins/bodies/src/runtime.ts:16–25,41–69,90–108`). These are credible multiplicative costs, not evidence that any individual check can simply be removed.

Existing accepted native measurements independently support communication cost being material: Shop crossing reduction 360→70 accompanied open median 114→37 ms; World activation 118→66 ms; Finished crossings 107→54 accompanied World 39→19 ms and total end handler 80→70 ms; model-entry 55→31 ms; Communication mean 1.857→0.426 ms; Economy 0.57745→0.24092 ms. These changes also reduced native observations/work, so their gains cannot all be assigned to Rust metadata cloning. Evidence files are under `T/docs/evidence/staging/`, named `shop-performance`, `activation-interop`, `lifecycle-performance`, `model-entry-performance`, `communication-preflight-performance`, and `economy-phase-performance` with their October 2/3 dates.

The rejected Body experiments matter: adding a roster-query crossing made 0.910→1.355 ms; forwarded slots gave full-feature 0.980 versus original 0.969 ms. Fewer SDK reads or a smaller API does not guarantee a faster full path.

### 3. Wire-value copying/validation remains real after metadata repair

`F/core/src/v8host/interop_wire.rs:133–210` inspects values without getters/proxy coercion, builds owned `serde_json::Value`, and serializes to a string. The other context reconstructs a fresh value; the return repeats this. Arrays/objects/EntityRefs therefore cost more than primitive checks, and unions may test multiple variants (`F/core/src/interop.rs:89–115`). This preserves isolation and strict wire semantics. Keep it in the first repair. Broader schema-specialized carrier work should follow measurement, not be bundled with metadata ownership changes.

### 4. Remaining spikes are not attributed by current captures

A fixed per-crossing tax plausibly raises steady PRE and amplifies role/death/end/deal bursts. Prior accepted closure attribution found endGame 66 ms including 47 ms state dispatch, beginRound 63 ms including 4 ms state dispatch, and a separate 121.43 ms restart with remaining time unassigned. State dispatch is inclusive of owner/native work. It is not a direct measure of bridge self time. Team/spawn callback totals can be nested and must not be added as independent costs. There is no present evidence assigning all 196.79 ms to the bridge, all residual time to the engine, or establishing old-monolith performance parity.

## Controlled production-code benchmark

Source: `/tmp/s2s-ttt-bridge-bench/src/main.rs`; final results: `/tmp/s2s-ttt-bridge-bench/results-pinned.jsonl`. It imports **the actual unmodified** `F/core/src/interop.rs` with `#[path]`. Only unrelated enclosing `Manifest`/`HookResult` types are stubbed to compile that module. It deserializes real accepted/narrow `.s2sp` manifest contracts and calls production `Contract::validate()` once before measurement. Measured work uses the actual derived production clones and destructors, `black_box`, release optimization, 11 batches of 10,000 iterations. No hand-written clone substitute and no console work inside the timed loop.

Environment: local ARM64 macOS Darwin 27, Rust 1.98.1; serde 1.0.228, serde_json 1.0.150, sha2 0.10.9 and canonicalizer 0.3.2 pinned to the source lockfile's direct versions. It is **not** the Linux game server, a V8 benchmark, or the complete bridge. Registry/version checks, carrier validation, context switching, JavaScript, engine operations, allocator contention and GC are excluded. Fixed case order and the local machine also limit tiny comparative estimates.

| Actual contract | Compact bytes | Methods | Full clone pair + selected method clone, median µs | Selected-method-only clone, median µs |
|---|---:|---:|---:|---:|
| Accepted Core | 49,312 | 70 | 38.203 | 0.186 |
| Narrow Core | 39,146 | 70 | 30.437 | 0.189 |
| Accepted World | 16,759 | 14 | 14.153 | 0.123 |
| Narrow World | 8,138 | 14 | 6.711 | 0.123 |

Core uses `getGame`; World uses `appliedModelOf`. Narrowing saves approximately 20.3%/52.6% of this isolated allocation sequence. An additional `Rc<Contract>` pair-retain + selected-method lookup control takes ~0.0105/~0.0063 µs. That control illustrates removing deep copying; it is **not a tested bridge patch or predicted whole-bridge speedup**. An initial unpinned exploratory run remains in `results.jsonl`; use the pinned result above.

For scale only, 100 Core crossings at this local clone rate account for ~3.82 ms of metadata allocation; 1,000 account for ~38.2 ms. Actual per-frame counts and server speed are unmeasured here, so this arithmetic cannot explain a specific live frame.

Accepted contract digests: Core `63f90d4530062b4b6ecbcd30955bd52be19b6a9af5eaa6808b8d04b3d075c1e6`; World `d1feff58d0f96c0a7df141df0a3ddbacec9be11e1624eb62b8ab15ff9863014d`. Narrow Core `c09e5ecfe7a3f8fa362c48ee574d0e11105bc9b03f5e45ce5104b9f6fd5c4165`; World `e5e0043c2cbecd6f4ee10c407ff4ef8287f25556ddd481a91cca5e1e77d1052a`.

## Minimal next repair and decisive experiment

Prefer one framework-internal change: keep admitted runtime contracts behind immutable owned shared metadata handles, and snapshot that handle across reentrant JavaScript calls. Borrow the selected method from that owned snapshot. Consumer expected-digest checks need no cloned schema tree. Do not hold a `RefCell` borrow across JavaScript and do not retain a raw pointer into mutable registries. Runtime snapshots may use `Rc` within the thread-local host; worker-to-runtime ownership must respect its existing Send boundary (convert on admission or use a suitable immutable `Arc`). Keep load/publication validation and every live registry/generation/hash check, including post-call replacement checks. This need not change the public ABI or TTT archives.

First reproduce the current overhead using the existing in-isolate interop test harness and these real large contracts with trivial primitive methods, then compare the immutable-metadata candidate. Exercise primitive/structured args and results, nested reentry and fan-out separately. Add regression cases for replacing/unloading either participant during a call, replacing a provider with incompatible metadata, stale optional attachments, handler disposal/replacement during forward dispatch, and strict malformed/accessor/proxy/thenable/EntityRef rejection. The immutable old snapshot must survive memory-safely while semantic liveness still rejects stale success.

After those gates, compare unchanged accepted TTT archives against original/repaired framework under matched moving-bot/Bodies-on workload. Instrument aggregate method/forward counts and exclusive metadata, carrier, and provider execution time by interface; handle nesting so child bridge work is not counted twice. No per-crossing console logging. Record ordinary PRE, transitions, restart and native report distributions separately; then repeat uninstrumented cold arms. Preserve actual damage/deal/corpse activity and all native effect counts. The decisive result is lower full-path elapsed time with unchanged outcomes, not only faster microbenchmarks.

The existing narrow-contract prototype is a useful lower-scope plugin alternative and now has supporting isolated clone-cost evidence. It remains unaccepted natively and requires coherent ABI 3 cold deployment of matching archives. Capability-specific contracts could shrink further, but increase API/release work and do not remove the framework's fundamental O(total-contract-size) cost per tiny call. Do not prioritize that architectural migration solely to compensate for avoidable metadata copies; use capability boundaries later where domain ownership or value payloads justify them.

## Main-thread versus asynchronous work

The host explicitly runs V8 on one dedicated main thread (`F/core/src/v8host.rs:1–8`), and this bridge calls V8 synchronously. TTT's ordered damage decisions, authority comparison, native player/schema/entity access and PRE mutation stay there. Core's queue cap bounds the number of jobs, not the duration of one `job.fn()` (`T/plugins/core/src/core/preframe.ts:154–170`); wrapping an expensive endGame/beginRound closure in a timer or Promise does not parallelize it.

Published database/network facilities can move their I/O to workers. Loader archive/file work is already worker-owned (`F/core/src/loader_worker.rs:1–4`), while callbacks/lifecycle stay on the game thread. `threadSleep` only moves sleeping (`F/core/src/v8host/timers.rs:205–226`). The checked version exposes no general JavaScript compute worker. Independent pure computation could only be moved through an explicitly supported copied-data worker API, with bounded submissions/completions and owner/operation/connection/round fences. It cannot replace immediate synchronous gameplay decisions. No async expansion is needed to remove immutable metadata copies.
