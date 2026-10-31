# Bodies producer fix round 1

Closed independent P2 in-flight native spawn/shutdown race. Original immutable candidate and hashes remain unchanged in `.review/bodies-candidate.s2sp` and `.review/hashes.json`.

New candidate: `.review/bodies-fix1-candidate.s2sp`, SHA256 `827d59aa7a1423616342af8481ba15b17dc9e62fbd4104fe60347520059aeace`.
Payload plugin.js: `ea608279b62170f49546936ae40bd93d24f7f3531373550c1053df9d8cb169b4`.
Full source/payload inventory: `.review/fix1-hashes.json`.
API and manifest bytes are unchanged.

The spawning invocation now captures owner generation and map, retaining the existing actor/native-pawn invocation guard. It checks admission after previous-body removal, native create, staging flags, model, spawn, each physics stage and teleport, before insertion. On lost admission it sends Kill only to the captured full native ref if still valid; no replacement lookup occurs. The ordinary successful create→clear flags→model→spawn→physics→teleport→index recipe remains in the same order.

Permanent tests reproduced two failures against the original ZIP (`.review/fix1-red.log`), then passed against the corrected archive: shutdown at create/clear flags/model/spawn/teleport; connection, pawn and map replacement during spawn. Scoped CLI build and raw strict check exited0, all27 archive outcomes pass (`.review/fix1-green.log`). The independent reviewer's exact reproduction also passes against the new frozen candidate, reporting returnedBody=false, trackedAfterEnd=0 and liveCreated=0.

No Core/config/runtime/framework edits, commit or deployment. Parent-owned Core integration and live engine acceptance remain separate gates.
