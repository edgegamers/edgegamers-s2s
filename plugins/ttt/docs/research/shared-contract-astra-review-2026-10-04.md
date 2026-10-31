# Archived Astra review of shared contract metadata

This archives the independent read-only review supplied on October 4, 2026. The review below describes an uncommitted diff at review time. Its four source-file hashes match the subsequently frozen framework commit `10379521277a9100117104baa4f27b2012af62af`, based on `98a005d396d66d4c83ec67bed59060f732f87e8d`. The source files and all seven test-log hashes were checked again when archiving this document. This does not mean Astra reran the suite or reviewed live server performance after the commit.

Original review SHA-256: `9db24e8f57d8ee9b6176d80041c761b1021fc5df9a6c76fddacca0d3d1c0b576`. Source, allocation, local JS, helper, completed native build/deployment and baseline/candidate measurements are recorded in [the staging report](../evidence/staging/shared-contract-performance-2026-10-04.md). The historical review below preceded those live results and is preserved as written; remaining slow-frame attribution and receiving-client acceptance are open.

---

# Independent Astra review: immutable interop metadata

Reviewed October 4, 2026. Source: `/Users/ghirakawa/projects/s2script-output-adapter-fix`, branch `codex/immutable-interface-metadata`, uncommitted diff against `98a005d396d66d4c83ec67bed59060f732f87e8d`.

**No blocking correctness findings in the reviewed production change.** It directly removes the previously demonstrated contract-size-dependent copy cost without weakening the wire or lifetime policy. Proceed to the planned exact-candidate Linux gates and matched native experiment; this review does not establish live frame-time improvement or justify declaring the entire lag problem solved.

Review was read-only. I inspected production and test diffs, surrounding call/forward/admission paths, allocator implementation and test receipts. I independently verified SHA-256 of all four changed/new files and every RED/GREEN log in `/tmp/s2script-shared-contract-tdd-receipt-20261004.json`; all match. I did not independently rerun the suite or access the server.

## Production ownership and lifetime

Paths below are relative to the framework source root.

- `core/src/v8host.rs:1532–1585`: `AdmittedPublish` owns `Option<Rc<Contract>>`; both runtime stores are thread-local. `set_plugin_publishes` and `set_plugin_interop` still accept owned loader types and convert at admission. `core/src/loader.rs:234–239` still hands owned manifest copies into these setters. No `Rc` was added to loader/worker manifests, prepared work, queues or Send payloads. The worker/thread boundary therefore remains unchanged.
- `core/src/v8host/interop_wire.rs:78–109`: `published_contract` clones an Rc while its short store borrow is active and returns that owned handle. `checked_contract` similarly snapshots consumer metadata; it still tests producer liveness, presence on both sides, SHA equality and verified import. No registry borrow escapes these closures.
- `core/src/v8host.rs:2062–2064`: the method schema now borrows from the call's owned contract snapshot. That Rc remains alive through argument validation, provider invocation, result validation and unwind. Replacement/removal of either store during JavaScript cannot invalidate the schema reference. No `Rc::get_mut`, `make_mut` or raw-pointer shortcut was introduced. Contracts contain no V8 globals or native handles.
- `core/src/v8host.rs:2192–2200`: consumer generation, provider generation and exact current provider tuple are rechecked after invocation, as before. Keeping immutable old metadata alive does not keep an old provider semantically available. Ordinary error and void-return behavior is unchanged.
- The forward path retains its own publisher Rc and borrows the selected forward from it. `v8host.rs:2443–2461` preserves provider replacement, live subscriber and consumer contract checks before delivery. Callback/transform/thenable validation remains in the unchanged following code. The patch does not broaden the pre-existing same-generation admission semantics or introduce new caching across calls.
- Publication still validates the full admitted contract and exact implementation method set. Argument/result/forward schemas, strict property/proxy checks, EntityRef copying/revival and recursion guard remain unchanged. Legacy interfaces still have `None` metadata and take their existing carrier path. Optional attachments retain their independent token checks; their watcher merely receives cheap immutable metadata snapshots from the same helper.

This is the appropriate ownership design: retain immutable metadata across reentry, release store borrows before JavaScript, and retain separate current-generation checks. There is no reason to add a lock, move JavaScript to a worker, or relax actor/entity fences for this optimization.

## Test quality and remaining limits

The three new allocation tests at `core/src/v8host/tests.rs:2184–2245` exercise actual `__s2_iface_call`/`__s2_iface_emit` in V8. They pad unrelated contract forwards or an unused optional argument schema, so selected runtime values stay constant while metadata size grows. Admission and four warmups are excluded; twelve measured calls are checked against sixteen total numeric results/listener deliveries. This is a meaningful regression test rather than a clone-shaped mock.

The optional-argument case is particularly useful: it fails if somebody removes full-contract clones but leaves a selected `Method::clone`. The small/large budgets (64 allocations and 8 KiB) are well below even one copy of the padded selected schema. RED receipts fail for all three, then GREEN counts are exactly size-independent: method 276 allocations/4,536 requested bytes; notification 288/11,124; selected unused optional schema 276/4,536 over twelve calls.

`tests/allocations.rs` is test-only and delegates to `System`; counters are thread-local and enabled only inside measurement, with RAII reset. It counts allocation requests and requested bytes, not live heap, peak memory, deallocation cost or V8 allocations. It also includes fixed Rust harness/evaluation costs. Those limitations do not undermine the within-harness scaling assertion, but forbid treating these numbers as complete bridge allocation or latency measurements. Tiny timing claims still require the separate benchmark.

The new metadata-replacement test (`tests.rs:2765` onward) proves the outer call uses its stable original schema after nested metadata replacement, and the next call observes updated schema/hash state. It is deliberately synthetic: the native test seam swaps admission maps without advancing participant generations. Do not present it as a real reload test by itself. Existing `final_review_method_return_rechecks_removed_consumer`, `...removed_provider`, and `...replaced_generations_and_live_control` cover actual liveness rejection for both ordinary and void returns; optional watch churn/disposal/incompatible providers and stale forward listeners also remain in the passing full receipt. EntityRef wire tests pass too.

Optional nonblocking hardening: a forward-specific metadata replacement test during the first of two listeners would make immutable forward snapshot behavior explicit, including a transform response using the old selected schema. Current forward ownership is sound by inspection and existing reentry/disposal tests provide coverage, so this is not a reason to delay the narrowly scoped measurement.

## Full-suite receipt and ignored cases

The hash-verified full log reports **1,040 passed, zero failed, five ignored**. These are reported execution results, not newly rerun by this reviewer.

Two ignored tests need the real stock-provider helper (`busy_caller_stock_provider_spike`, `production_registry_outer_frame`). Three require isolated async-limit policies (40,000-byte capacity, tiny policy, six-poll policy). These are existing environment-specific skips, not newly disabled metadata tests. They do not weaken the demonstrated clone regression or Rc lifetime argument. Still run the exact candidate's required native/stock-provider gates before live acceptance: the two stock-provider tests are relevant integration evidence for the complete native binary, even though the changed metadata path is distinct. The policy-isolation tests belong to their established isolated gate rather than an ad hoc full-suite run with conflicting settings.

## Recommended next step and interpretation

The planned same-helper actual Core/World bridge measurement, full Shop path and matched normal moving-bot/Bodies-enabled 600-second arms with unchanged accepted 619 archives/ABI are appropriate. Keep baseline/candidate helper versions, native output repair, archives, bot workload and configuration identical. Count actual method invocations/results and gameplay effects; separate microbridge self cost from inclusive Shop/native work. The latter contains engine work and nested callbacks, so a large bridge speedup need not yield the same whole-frame speedup.

No ABI migration, narrow-contract deployment, Metamod/KHook modification, private export or actor/pawn fence reduction is needed for this repair. Cross-plugin overhead was **a reason** for additional cost; this patch removes one confirmed component. Whether it explains most remaining spikes is a question for the matched native results.
