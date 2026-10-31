# ADR0010 — Bound frame work and use worker-backed I/O

Accepted October 2, 2026, from the user's requirement to use s2script's asynchronous and multithreaded capabilities wherever game-thread execution is unnecessary. Follows ADR0003's public-API restriction and ADR0004's ordered gameplay semantics.

## Decision

Use published, worker-backed s2script APIs for database and network I/O. Pass copied values across the asynchronous boundary. Keep native entity references, borrowed hook payloads, player/schema access, traces, engine operations, and immediate ordered gameplay decisions on the game thread. Entity mutation retains the existing PRE execution policy and its execution-time fences.

Bound submissions, retained inputs/results, retries, and completion work. Handle admission rejection and database/network failure explicitly. Coalesce replaceable presentation updates and suppress work with no consumer or effect to advance. Do not create an unbounded Promise, timer, or native-call loop to hide a long frame.

Capture provider generation, operation identity, connection identity, and round identity where the operation depends on them. Before applying a completion, revalidate the relevant owner, SteamID, connection generation, round, authority, and current pawn. Framework owner-generation cancellation supplements these checks; it does not replace them. A durable write already accepted for a captured SteamID may finish after disconnect, while a UI/native side effect must never target the successor occupying that slot. Sanctions need idempotent accounting rather than blindly replaying an uncertain completion.

Treat timers, `await`, and modal invalidation as scheduling tools. They do not move JavaScript callbacks or subsequent native operations to a worker. A callback delayed to POST must not bypass PRE requirements. A successful synchronous repaint may fulfill pending invalidation, so immediate opening and action feedback can coexist with batched background updates.

Measure the actual critical path and native-call count before choosing an optimization. Prefer eliminating duplicate roster capture, repeated actor queries, unnecessary native writes, and duplicate paints before moving small arithmetic or formatting work. Validate changes with runtime behavior tests and native staging measurements; a worker-backed producer does not guarantee a cheap completion callback.

## Current framework capabilities

The October 2 audit checked current official main and release v0.7.0 at `be0a3e33041e921ec113203d4e14a22c996deab7`, matching SDK 0.27.1 and CS2 0.19.1. Built-in SQL and networking perform their I/O off the game thread and deliver callbacks/Promise continuations on it. The checked public API exposes no general JavaScript worker or compute-callback executor. `threadSleep` offloads only the sleep. Raw configuration file operations remain synchronous. These are findings about that version, not restrictions on future framework releases.

Use the [source-linked execution audit](../evidence/staging/async-execution-audit-2026-10-02.md) when selecting APIs or planning further changes. Recheck current official exports and their guarantees when upgrading. No framework or Metamod patch is introduced by this decision.

## Consequences

The UI batches non-immediate report repaint requests and uses hudkit's existing row-click repaint. Initial opens and explicit action feedback remain synchronous. Shared MySQL durability and CSS data migration remain separate deliverables; current map-lifetime Karma and Reports stores are not described as asynchronous database persistence. Cold configuration writes and synchronous ban persistence need measured follow-up if their cost becomes material.

The soft framework async-drain budget cannot preempt an individual callback or V8 microtask checkpoint. Application completion work must remain bounded even when the producing I/O ran on workers.

## Measured recurring-work follow-up

The October 3 [Communication pair](../evidence/staging/communication-preflight-performance-2026-10-03.md) supports a pure registry preflight followed by the owner's revision/closing/owned-rule check: all-alive native snapshots can be skipped, while dead-player, chat and release work keeps its original execution-time identity checks. It reduces measured Communication mean 1.857→0.426 ms in the bounded bot pair. It does not offload native work or replace game-thread authority.

The October 7 extension applies the same registry preflight after the first death. Core's `getCommunicationKey()` encodes round epoch, game state and each logically dead player's slot/generation/SteamID without native reads. While that key and the owner revision are unchanged since a full pass that left nothing to do, Communication skips the native snapshot; a full native pass still runs at least once per second to sweep natively retired tokens the registry has not yet observed. Chat, voice application, release and failure retry keep their execution-time identity checks. This is a static change with fixture counts, not a staging measurement.

Native evidence also rejects call-count-only acceptance. An additional Body→Core roster-query crossing worsened interaction timing despite fewer SDK reads. [Empty DNA/cloud guards](../evidence/staging/items-idle-preflight-performance-2026-10-03.md) produced no material targeted native gain and are excluded for now. Preserve the original Body and Items implementations in the coherent candidate. A copied-input Body experiment remains separately reviewed and unaccepted until its own native pair. Keep production handback, restart attribution and receiving-client acceptance distinct from isolated measurements.

The forwarded-slot alternative also failed to establish a net native gain against original production. Its scan-only comparison improved, but the full feature did not beat the original contract/caller. Keep original Bodies and record the [three-arm comparison](../evidence/staging/body-forwarded-input-performance-2026-10-03.md); smaller SDK counts alone justify no API expansion.

The [natural restart capture](../evidence/staging/restart-aggregate-performance-2026-10-03.md) measures expensive end/deal queue transitions separately from ordinary preparation ticks. Its 135.36 ms restart includes measured spawn/round-start roots with nested team callbacks, while the remaining cost stays unassigned. Preserve PRE ordering and execution-time fences. Identify the actual queued closure before changing cadence or attributing a burst to deferred model/loadout jobs.

The [deeper closure capture](../evidence/staging/restart-drain-performance-2026-10-03.md) attributes the end/deal drains to endGame and beginRound. EndGame's 66 ms includes 47 ms in state dispatch; beginRound's 63 ms includes 4 ms in state dispatch. Deferred loadout and World ticket labels cover their queued branches only. The separate 121.43 ms restart remains partly unassigned. Do not change role commitment, execution cadence or native thread ownership based on these inclusive scopes alone.

The [Economy pair](../evidence/staging/economy-phase-performance-2026-10-03.md) supports carrying a copied primitive phase on the existing synchronous tick. Skip redundant authority queries only while neither sampling nor reward is due; retain the original authoritative path at every due boundary and for omitted or invalid inputs. Equal native payouts and actual-archive reentry tests accompany the measured Economy reduction of 0.57745→0.24092 ms. This removes main-thread work without claiming JavaScript worker execution or restart parity.

The October4 [connected-slot correction](../evidence/staging/connected-slot-role-start-2026-10-04.md) adopts an existing-contract occupancy hint to remove Bodies' newly introduced eager64-slot native input enumeration. It restores the old port's connected-player enumeration while retaining every mutation fence. This is acceptance of independently verified unnecessary work, not acceptance of the scheduler-confounded idle pair or a claim that the74ms human carry stall is fixed. One adjacent duplicate Core round-entry resync is also removed; the duplicate existed in the old port. Direct role-start timing and receiving-client carry acceptance remain separate.

The same follow-up rejects an impossible role-tag prefix locally before World resolves phrases through Core. Plain names cannot match a generated prefix beginning with `[`. This removes four futile crossings per ordinary Detective tag without caching translations or removing the final native identity fence. Actual-archive localized/tag/reentry cases retain native effect order; native elapsed gain is a separate measurement.

The October 7 deal change keeps every deal-frame entity effect in the deal frame and the role uniform on the following PRE. Two pieces of per-player bulk work are bounded instead: Core's `nextPreFrameSpread` lets at most four dealt players' loadouts run per PRE frame, in order, each stamped at request time and dropped on the ordinary map/round/slot-identity checks; and World restricts each Traitor marker once during the Countdown deal, re-pushing the complete Traitor list once at the InProgress transition in the same frame instead of after every Traitor. These are fixture counts, not staging measurements.
