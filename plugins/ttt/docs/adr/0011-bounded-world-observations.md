# ADR0011 — Bound synchronous World observations

Accepted October 2, 2026. Follows ADR0003's stock API restriction, ADR0004's ordered gameplay semantics and ADR0010's bounded game-thread work.

## Decision

World takes a copied Core observation once for each synchronous player invocation. It reads role, name, alive and participation fields locally within that invocation. Before a native mutation, it validates its retained SDK connection/controller and exact current pawn, then asks Core to compare the complete primitive stamp against current authority. Core's comparison checks connection generation, SteamID, round epoch, map epoch, phase, role, name, alive and participation, plus an explicit admission gate.

Core closes admission before startup/map/unload cleanup. Startup opens only after first-PRE retained-owner retirement and the following simulation barrier; map start opens only after successful reseeding and settings application. A live hard interface proves registry generation availability, not completion of the producer's unload callback.

Native capture has two independently required seals. Core checks its retained SDK client again after the pawn read. World checks Core's native actor identity after its first SDK connection admission, then validates its retained client/controller before retaining that token. Same-Steam reconnects and bots can replace native objects before lifecycle notifications update Core's generation. Invalid SDK clients return SteamID `0`, so equality alone cannot validate bots.

The observation never survives an asynchronous boundary. Deferred model jobs capture a fresh context at execution. Their complete primitive admission stamp is validated inside the existing queue crossing; execution retains the original fresh native actor check, global PRE ordering and queue/drain limits. Phase at admission does not retire jobs when Countdown becomes active play within the same round.

Same-slot nested invocations retire their caller; different-slot invocations restore their caller. Provider replacement, local reset, map replacement and exact native token/pawn changes invalidate work. A copied observation authorizes no native write by itself. No long-lived registry mirror, notification cache or supplier ABI is introduced.

Finished role-name updates use a copied slot enumeration and a synchronous batch lease captured before enumeration. The lease includes the local owner/reset/map and Core's current round epoch and state. Each slot still enters its own fresh player scope; the batch lease is checked before each slot and inside that scope. A reset, owner replacement, map change or round/state transition during a formatter retires every remaining write from that event. This preserves synchronous observer ordering while avoiding repeated full-roster observations.

## Evidence and release

The actual World recipe remains four entity creations, four FollowEntity inputs, six visibility writes, one Detective name and eight following-PRE model writes for the same eight roles. The context-only fixture reduces checkpoint deal crossings 123→41 on first native connection admission, then 33 with retained tokens, and drain 80→24. High-level SDK reads fall 594→385/305 during the deal and 504→344 during drain. These counts do not measure every Rust FFI operation or old live-server elapsed time.

Actual Core/World archive tests fail before the two late-successor seals and pass with them for human same-Steam and bot-zero connections. Full candidate verification records 557 distinct tests, ten strict checks, ten owner builds plus the probe, and 28 matching dependency crossings across eleven archives. Matched native cold profiles measured median role activation 118→66 ms and World observers 66→28 ms, with all eight actual model writes and outline effects retained. Exact uninstrumented production then ran a command-free 146.54-second sample with no frame above 100 ms or one second (maximum 85.26 ms). Lifecycle/shop work and receiving-client acceptance remain open; this is not measured old-live-server parity. See [activation evidence](../evidence/staging/activation-interop-2026-10-02.md).

Typed contract changes require a coherent release. Stock protocol-2 consumers embed the provider's exact contract; these dependencies form cycles. Installing changed files while old producers run can leave the old live versions retained. Verify all archive type/wire hashes together and cold-load a coordinated set when the contract changes. Reloading an owner with unchanged contracts remains independently supported.

The unchanged-contract Finished extension retains eight ordered role-name writes and reduces the measured boundary calls from 107 to 54. Its 54 World archive tests include whole-loop retirement during enumeration and formatting. The paired native sample measured World Finished 39→19 ms and the full end-game handler 80→70 ms. A separate natural-restart frame still reached 151.85 ms; see [lifecycle evidence](../evidence/staging/lifecycle-performance-2026-10-02.md).

The public role-model entry also enters a fresh synchronous player scope before its existing actor check. Its deferred PRE job retains a separate fresh scope. Force, deduplication, ordering, queue limits and execution-time identity checks remain intact. The paired native lifecycle measurement reduced twenty public model requests from 55 to 31 ms and eight complete spawn callbacks from 29 to 18 ms. Activation and deferred execution did not improve in that pair. The exact uninstrumented release passed a natural restart/deal sample, with one remaining 169.8 ms restart frame; [model-entry evidence](../evidence/staging/model-entry-performance-2026-10-03.md) records the limits. No contract or framework change is required.
