# Astra: failed bot carry acquisition — 2026-10-04

Read-only review; no server/private-export calls, test/build, framework edits or deployment. Framework reviewed at commit10379521277a9100117104baa4f27b2012af62af.

**Verdict: no concrete framework setter defect is established. This run failed the stock-carry admission gate and supplies no carry-performance pair. Proceed to the actual human capture rather than inventing a native fix from this receipt.**

## Evidence

Verified SHA256 of `/tmp/s2s-ttt-scan-carry-phase-b-warmup-recovery-one-rejected-20261004.json`: `09b98903aa89f8c89c671c3b4b60ce7c30174c812c6fd1bec83eabc78aef29a1`. It has `accepted:false`, `quietWindows:[]`, and failure `acquisition has no positive stock-carry observations`. Pre-begin state is InProgress, epoch136, Speed disabled, native remaining152.984375s. Insufficient round time is not the evidenced failure.

Verified acquisition driver receipt SHA256 `007ab5edef37a380290e92a0deb42bda4233cc69ad5dcf1f37e5b6dbdeadc078`. Selected slot2, canonical corpse owner0/index750/id33655;147 selected input callbacks,147 writeAttempts,147 writes, but `pawnUseSeen:false`, no new beam and displacement squared0.0459748842. The driver increments `writes` after a nonthrowing assignment plus its local/session checks (`/tmp/s2s-ttt-bot-carry-driver-20261004/src/plugin.ts:80–81`). It does not read `cmd.buttons` back. These counters must be called assignment attempts/completions, not147 confirmed native bit mutations. Small body drift is not carry proof.

## The concrete source distinction

The framework writes and reads two different representations:

1. `core/js/prelude.js:911–912` forwards the public `cmd.buttons` getter/setter to native operations. `core/src/v8host.rs:2627–2634` converts the bigint to u64 and calls the registered write operation. USE32n is exactly representable; no observed sign/truncation problem exists here.
2. `shim/src/named_hooks.cpp:88–104` sets a scoped current pointer to each command's embedded protobuf, dispatches subscribers, optionally neutralizes commands whose collapsed result is Handled/Stop, then returns Ignore so the original engine function runs. The hook does not itself transfer bits into pawn movement state.
3. `shim/src/s2script_mm.cpp:2417–2453` reads/writes `CSGOUserCmdPB.base.buttons_pb.buttonstate1` via protobuf reflection. The setter returns void and silently does nothing on missing current pointer/descriptors/reflection or wrong scalar type. No post-write success flag is returned. Its getter follows the same protobuf location.
4. `games/cs2/js/pawn.js:570–584` implements `pawn.buttons` by reading `CBasePlayerPawn.m_pMovementServices` → `CPlayer_MovementServices.m_nButtons` → `CInButtonState.m_pButtonStates[0]`, reducing it to low32 bits. It returns0 for unresolved schema offsets/unreadable state. Bodies reads this movement-state accessor in PRE, not the command protobuf.

Therefore zero pawn USE does not distinguish a silently failed protobuf write from a successful protobuf change that the engine did not consume, later replaced/reset, or did not preserve until the next PRE observation. Bot AI/`bot_stop` handling, processing phase, later subscriber overwrite/neutralization, and unreadable pawn input are hypotheses, not observed causes. The driver itself returns void and does not request Handled/Stop. No TTT production input subscriber was found; that search is not an inventory of every loaded archive.

The callback remains synchronous through the guard's public Core/Bodies calls and does not retain its UserCmdView. No evidence in this trace establishes that those crossings expire the command view or corrupt its native pointer.

## Existing validation does not settle this branch

The historical July14 spike documents human protobuf button reads and coarse movement writes taking effect. It does not prove bot USE injection on the current engine. Its coarse-movement/subtick conclusion cannot be generalized to every bot button transition. The current named-hook fixture verifies in-place byte mutation, batching, pointer restoration and original-call delivery using a fake target; it does not exercise real protobuf button writes followed by CS2 movement-state consumption. Core accessor tests include the intentionally silent no-op path. All can pass while this live bot acquisition still fails.

There is no evidenced failing branch from which to construct an honest regression test that is expected to fail current code. A mocked engine-op roundtrip would test plumbing and likely pass; it would not reproduce the missing bot pawn bit. A real protobuf fixture can test setter/readback behavior but also cannot prove engine consumption. Do not treat coverage gaps as proof of a runtime defect.

## Next action

Prefer the already planned human stationary→carry→release capture with the synthetic driver removed, exact actor/native pawn/corpse/map/round/owner checks, existing production action fences, native quiet logs and reviewed callback diagnostics. This directly exercises the reported user problem and avoids making bot control a prerequisite for diagnosis.

If a separate future authorization specifically investigates the SDK input setter, the smallest supported additional observation is callback-scoped readback immediately after setting `cmd.buttons`, recorded only as copied primitive counters and accompanied by later pawn-state observations. Readback32n would establish mutation of the exposed protobuf while leaving downstream engine processing open; readback missing USE would narrow the failure to the public command-view write/read path. Neither result alone permits bypassing the public API, writing pawn offsets, changing Metamod/KHook, clearing arbitrary subtick input, or weakening actor/native pawn/map/round/owner fences. No such probe or retry was run here.

### Parent follow-up: absent submessages and the minimal probe

An absent optional `base` or `buttons_pb` **instance** is not itself a setter refusal: the setter uses protobuf `Reflection::MutableMessage` at both levels, which normally creates/marks those submessages present before `SetUInt64`. The read path uses `GetMessage`, so an absent message can read its default0 without proving setter incapacity. Missing **field descriptors** are different: `GetUsercmdFieldCache` looks up the field names once after obtaining a descriptor and permanently caches even missing entries (`s2script_mm.cpp:2291–2324`). No evidence shows a missing descriptor in this live run.

The public property setter has no success return. A JavaScript assignment expression evaluates to its assigned RHS regardless of the setter's internal no-op; checking that expression also would not prove mutation. Read the property again.

For a separately authorized bounded probe, retain all existing session, callback serial/reentry, native connection/controller/pawn, actor/round/map/body and deadline checks immediately before the one USE assignment. Immediately after assignment, synchronously copy `after = cmd.buttons` while the same callback/serial/session is current. Count exact `after === requested`, USE missing, unrelated-bit differences and invalid readback separately; retain only copied bigint/boolean/count values, never Cmd. Preserve all bits except the intended USE bit. Do not retry writes to chase readback or add frame loops/logging. Stop injection at the original bounded deadline and observe natural clearing using the same existing checks. Relate these counters to selected callbacks and subsequent valid pawn observations; do not call assignment completion a write success.

Exact readback with still-absent later pawn USE rules out a no-op of this exposed protobuf field for those commands, but does not distinguish later subscriber/engine overwrite, ignored command batches, bot-specific processing, or PRE visibility timing. Missing USE on immediate readback narrows the problem to the exposed callback write/read path, with descriptor/dispatch diagnosis still required before a patch. A second native offset write or fake SDK fixture would not answer that question. Human reproduction remains the priority for the actual lag task.
