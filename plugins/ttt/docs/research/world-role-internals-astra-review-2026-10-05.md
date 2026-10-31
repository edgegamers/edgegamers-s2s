# Astra independent review — World role creation capture

Accepted as one bounded diagnostic observation. Independent verification passed 500 checks against completed receipt 81df74e97e0c59ed0aa1dcdfe6ddebb531d9fa39e51f324413aa5df1d83d5344. Reassembled exactly 21 Core, 2 historical Bodies and 7 World parts from the saved single-command RCON replies; snapshots match the receipt. Independently hash-checked and parsed quiet-safe.log, and recomputed all 11 scheduler context reports from the 44,896-row JSONL using the pinned sampler. No server actions or production edits were performed.

The 35-second quiet interval is 04:07:15.010526–04:07:50.010632 UTC. Its sole pool-eight deal is 04:07:28.765857074, leaving 21.244774926 seconds. Every recorded RCON interval lies outside quiet. Exactly one identical-Core reload, World publication, warmup-end, and flush for each of Core/Bodies/World are recorded; no reset. Core 85c844… and Body c75265… remain unchanged; only World changes eeec67…→ce2424…. Framework 10379521277a…, native operators/configs and 13 clean submodule pins agree. Map de_inferno, roster revision 32, epoch 228, roundsThisMap 60, zero humans/eight bots, process PID/start identity, and Countdown→InProgress admission agree. Core and World fresh sample-zero periods are respectively 42.495 and 45.484 seconds, wider than quiet; Bodies remains historical. World normal-path counts match all ten expected rows and all maxima lie within the one Core beginRound.

Measured inclusive wall-clock values:

| Scope | Calls | Sum ms | Maximum ms |
|---|---:|---:|---:|
| Core beginRound | 1 | 53 | 53 |
| Core assignRoles | 1 | 39 | 39 |
| Core Icons observer | 8 | 27 | — |
| World role total | 8 | 26 | 14 |
| Admission | 8 | 4 | 1 |
| Tag | 8 | 2 | 1 |
| Cleanup | 8 | 0 | 0 |
| Synchronous visuals | 8 | 20 | 12 |
| Icons spawn | 3 | 17 | 10 |
| Glow spawn | 2 | 15 | 9 |
| Glow createEntity | 4 | 12 | 4 |
| Glow field setup | 2 | 1 | 1 |
| Model scheduling | 8 | 3 | 2 |

The four existing createEntity calls are the largest measured child operation in glow creation. This is a supported reason to inspect the actual public creation path next. Field wrapping/setup is small in this observation; a claim that cold schema setup explains most of the observed glow cost is unsupported. Creation spans include JS argument preparation, public SDK/native dispatch, keyvalue handling and native create/spawn/model work. The capture does not distinguish these or prove that any particular part is avoidable. The same native recipe existed in the old port; this is not evidence that modularization introduced entity spawning or that entities leaked.

All rows overlap their parents. Do not subtract 26 from 27 to claim exact bridge overhead, subtract child maxima to label a residual engine cost, or add rows into a frame. Integer timing and instrumentation overhead apply; zero cleanup does not mean free. Deferred model execution is excluded from model.schedule and occurs at its existing PRE boundary. Four create calls establish reached operations; the normal count and prior behavior proof support the expected two glow pairs, without proving arbitrary prop_dynamic objects are TTT-owned.

The safe quiet log has three native reports: two single-tick and one four-tick; maximum 58.99 ms, none at least 100 ms. The 58.99 ms single-tick report immediately follows Core's 53 ms beginRound interval. This ties the measured work to the deal-adjacent long frame, but does not attribute the whole frame to World or the create calls. No meaningful improvement or regression versus prior single samples is established, and this bot capture does not resolve human standing/carry jitter.

Scheduler limits remain important despite zero unresolved windows. The pinned sampler validates the fixed process identity, completed 45-second capture, monotonic counters and coverage. Its recomputed reports are only bounds on counter increments published within uncertain wall-clock windows. For the maximum four-ms glow.create span, published runtime increments are bounded at 1.999577–6.000460 ms and published runqueue increments at zero. That is not proof of exclusive callback CPU or physically zero waiting: accounting updates can cover earlier time or omit pending work. Role assignment's published runtime bounds are 36.984817–40.988981 ms and runqueue increment 0.016681 ms, with the same limitation. The wider host endpoints cover 35.214414 seconds, runtime 8092.464545 ms and runqueue delay 60.128141 ms. None may be exactly subtracted from plugin wall-clock spans.

Four redacted warning records occur during Core reload before quiet (and before Core's factory sample, but after World's start). No record is classified as a roleAssigned observer failure, and measured rows show zero throws or clock reversals. This does not establish the cause of the redacted warnings or rule out every caught/logged failure. The safe log is filtered, not a full transcript.

The strongest next step is the source review already assigned for createEntity: look for concrete redundant binding/keyvalue/allocation work while preserving same-frame creation, model-as-spawn-keyvalue, existing native ownership fences and Kill/FollowEntity order. If no falsifiable redundancy exists, the smallest further discriminator is internal fixed aggregate timing across the existing creation stages, without adding SDK reads or shifting required visuals between frames. No native patch or pooling/lifetime change is justified by this capture alone.

Verifier: /tmp/astra-world-native-verify-20261005.py
Receipt: /tmp/astra-world-native-receipt-20261005.json
