# Bodies producer fix round 1, completed creation ownership boundary

Supersedes fix1 for review; both earlier immutable ZIPs/inventories are preserved. Adds the independent reviewer's second manifestation of the same P2: Beam.draw could return after shutdown and install an unowned beam into cleared carry state.

Candidate `.review/bodies-fix1b-candidate.s2sp` SHA256 `ffb4752f67720994255ec3f8394e93697fb5d1780736be0f24e9098fec4c1786`.
Payload plugin.js SHA256 `26188c33830712cba4ddcb77d2bbf42441a45b49cba3666dc26f601751bd7e1c`.
Inventory `.review/fix1b-hashes.json`; API/manifest unchanged.

Includes all fix1 ragdoll admission checks. Carry start now retains its exact actor object/native prop and map ownership across DisableMotion and Beam.draw. If the callback invalidates admission or replaces the carry slot, the newly returned beam is removed before assignment; immediate prop release applies only when this invocation still owns the slot. It never clears a successor carry. Ordinary multicarrer behavior and physics/beam recipe remain unchanged.

Permanent actual archive regression failed against preserved fix1 (`.review/fix1b-red.log`) and now passes for shutdown, connection revocation and map change during beam creation. Full28 archive outcomes pass (`.review/fix1b-green.log`), raw source strict and scoped CLI build exit0. No Core/config/runtime/framework edits, commit or deployment. Root integration/native acceptance limits from the initial report remain unchanged.
