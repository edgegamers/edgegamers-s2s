# Corpse carry: local calls versus typed transport

Source-only review of current production HEAD f99ba860de242f0276b9e8625393b068c9d6fd16 and old monolith bd2c38273c57fac2356982c64b5329087fc147f5. No code edits, build, new test run or server action. Counts below describe a successful steady tick with eight valid rows, one already-acquired canonical corpse, one USE carrier, retained warm connections, live beam, no reentry/refusal and no unrelated pending work. They are not timings or complete native-FFI counts.

## Exact steady typed call inventory

| Direction / method | Calls | Arguments | Result | Work inside owner |
|---|---:|---|---|---|
| Core → Bodies `tickInteract` |1|`dt:number`|`void` (undefined)|Entire input/carry path below; Core gates it on InProgress in plugin PRE.|
| Bodies → Core `activeSlots` |1|none|copied `number[]`|Copies registry slots; no native player lookup in this method. Input hint only.|
| Bodies → Core `getBodyPlayers` |1|none (optional slot omitted)|`BodyPlayer[]`: actor, name, role, alive, participating, `pawn:EntityRef|null`|Runs getWorldPlayers over current slots, captures native connections/pawns and seals each actor/round, then copies rows/actors.|
| Bodies → Core `matchesActor` |11|same full `{slot,steamId,generation,roundEpoch}` value|boolean|Validates shape, captures current native controller/retained Client, compares registry connection and round again.|

Total14 typed invocations. There is NO steady `getGame`, World, Items, Shop, DNA, bodyByEntity RPC, settings RPC, PRE schedule RPC or timer. `bodyByEntity(prop)` and `canonical(body)` here are local canonical Bodies store calls. `n('sm_ttt_carry_body_offset')` reads local canonical settings. Successful existing-carry branch returns before defuse/identify/item actions.

The11 matchesActor calls are mechanically reachable as: withActor initial1; capturePlayer initial1 and nativePlayerCurrent1; withActor post-pawn nativePlayerCurrent1 and explicit matchesActor1; withActor entry actionCurrent1; tickOne pawnOf's two actionCurrent checks2; carry pawnOf's two checks2; final pre-teleport actionCurrent1. Each nativePlayerCurrent additionally performs nativePlayerLive before AND after its Core callback. This count is conditional on the successful path, not a license to coalesce authority checks across native calls. Stale carried-owner reconciliation, first connection admission and nested/rejected branches change counts.

## What the no-ref transport proposal can remove

Framework author confirms independent argument/result eligibility; void already uses Outcome::Void and has no result serialization. Therefore14 calls currently have27 serialized directions:14 arguments +13 non-void results. **26/27 directions qualify**:12 complete argument/result exchanges (activeSlots plus11 matchesActor), plus tickInteract's argument and getBodyPlayers' argument. The EntityRef-capable roster result remains on JSON/reviver even if a particular row's pawn is null. Do not report28 directions or serialize void as null.

This is an estimate of eligible string-JSON transport directions, not a claim of26 literal JSON.stringify calls or a native gain. Existing schema validation, descriptor-safe copying, owned values, target-context materialization, nested dispatch, error handling and all receiver/generation/final-write guards must remain. The proposed path does not remove cross-context invocations or native identity work. Full contracts are unchanged. Prototype correctness/acceptance remains with its author and peer reviewers.

With no USE and no held resources the current path is only tickInteract + activeSlots: three serialized directions, all eligible. With K independently successful carriers and an unchanged roster, the normal branch has `3 + 11K` calls and `5 + 22K` serialized directions; all but the one ref-bearing roster result qualify. Reentry and other USE actions are outside that formula.

## Native work and old local behavior

Old `src/cs2/interact.ts:131` obtains local reg.activeSlots, then local pawnOf/buttons per active row. It goes directly to carry for an existing live prop. There is no typed inter-plugin exchange. Old pawnOf is Player.fromSlot(slot)?.pawn. In the stated eight-row/one-carrier case this means nine high-level Player.fromSlot/pawn lookups (eight scan plus one inside carry), eight button reads, one origin/eyeAngles pair and one Trace.line/prop.teleport/beam.update. Local body lookup and the carry-offset read stay local.

Current input precheck uses copied activeSlots and direct native lookups until it finds USE; after that it obtains the complete copied roster and reads each row's input. It then enters the carrier's retained-native invocation, including two additional pawnOf calls and the final actionCurrent seal. Prior actual-archive count fixtures for this unchanged successful path recorded10 Bodies Player.fromSlot calls for carrier0 or17 for carrier7, plus35 inside Core (24 for the eight-row roster capture,11 for matchesActor). The four Core producer recipes still hash-identically to those fixtures; this review did not rerun them. The prior native-boundary counts exclude wrapper-internal operations and are distinct from native elapsed time. See existing production evidence `docs/evidence/staging/scan-carry-20261004/steady-carry-counts.md`.

Both implementations read native pawn buttons; neither uses an onRunCmd subscription or writes input in this production path. Both retain the same steady world operations: WorldOnly line trace ignoring the carried prop; wall-distance clamp; canonical corpse test; carry-offset math; rigid corpse angles `[90,eyeYaw,90]` (prop `[0,0,0]`); zero-velocity teleport; cached corpse-centre update; beam endpoints at feet+48 and hold point. Current code adds owner/actor/native/canonical fences around this recipe. Do not remove those to imitate the monolith's smaller count.

## Acquisition/release are different paths

Acquisition can call Core readBodyDna/hasBodyGloves/spendBodyGlove/hasBodyPaint/spendBodyPaint/emitBodyIdentify/tryDefuseTripwire/tryPlaceHeldTripwire, with actor DTOs and, where declared, genuine body refs; Core may then route Items/domain/Body projections. They are NOT costs paid on a successful steady carry tick. Pickup uses native DisableMotion and creates the beam once; Beam.draw is not repeated each tick.

Release removes the beam, clears only owned carrying state, checks genuine full held identity against other carriers, then requests EnableMotion. It schedules one next-PRE zero-velocity teleport after the input can be serviced. Old code queues a local closure. Current code captures owner/map/round and uses `getGame()` twice at fresh empty-queue admission, plus another getGame per pending job pruned; `scheduleBodyPreFrame(ticket, null)->boolean` enters Core's same global queue. Later Core calls `Bodies.runPreFrame(ticket)->void`, and World-independent Bodies stamp validation calls getGame once before the local dropped-ref check/teleport. These are all no-ref transport directions, with void still unserialized. Queue refusal, stale stamps, detach/unload or a second carrier can skip this work. No repeating carry timer exists. Release's actor-null ticket is deliberate so cleanup does not require the departed player's connection; captured entity and map/round/owner guards still apply.

Safety scope: retain provider/generation pins around the slot hint and roster; full actor/retained Client/controller/pawn identity; actionCurrent after native trace and before teleport; canonical body identity; captured-owner comparisons during release; nested successor protection; shared PRE snapshot/caps and unload cleanup. None of this review proposes an API, scheduling, body model/physics or lifetime change. Human carry jitter and74ms reports remain unresolved.
