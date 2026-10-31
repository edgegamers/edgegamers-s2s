# Named-output adapter repair design

Status: the user has now authorized the s2script repair, build, staging deployment and retest. Metamod/KHook changes remain outside scope. The implementation, compatible build, deployment, live output smoke and two independent moving-combat retests are complete; [acceptance evidence](../evidence/staging/named-output-repair-2026-10-03.md) records their exact limits. This design does not establish universal stability or latency acceptance.

## Argument roles and their evidence

The matched game ELF establishes six integer/pointer arguments plus one float, with the fourth integer argument an indexed carrier and the sixth integer argument separately variant-shaped. Current primary implementations supply credible names for those roles. [CS2Fixes, pinned bb3be344, detours.h:104](https://github.com/Source2ZE/CS2Fixes/blob/bb3be3449c122bebf2d74e85b61987de408ac339/src/detours.h#L104) declares:

```cpp
void(CEntityIOOutput*, CEntityInstance* activator, CEntityInstance* caller,
     CPulseArgumentPack*, float delay, CPulseInputParamMap*, const CVariant*);
```

| Logical ordinal, including receiver | Proposed role | Linux SysV location | Matching-engine evidence |
| --- | --- | --- | --- |
| 1 | output receiver | RDI | saved and connections/descriptor accessed |
| 2 | activator | RSI | saved in RBX; forwarded to listeners |
| 3 | caller | RDX | saved in R12; forwarded to listeners |
| 4 | Pulse argument pack | RCX | saved at frame −0x78; count and indexed extraction |
| 5 | delay | XMM0 | saved at frame −0x7c |
| 6 | Pulse input parameter map | R8 | saved at frame −0xa8; distinct additional-processing branch |
| 7 | optional variant | R9 | saved at frame −0xa0; union at +0 and discriminator at +8 |

“Sixth integer argument” means **logical argument seven**, because the float consumes a separate register class. Naming the fourth and map objects as Pulse types relies on primary implementations; their complete native layouts are not established by the static audit. The logical declaration is corroborated by [Swiftly's pinned hook](https://github.com/swiftly-solution/swiftlys2/blob/78b4c89a6e21de7b6a4d9485295b6448f58e26d9/managed/src/SwiftlyS2.Core/Modules/GameHooks/Hooks/FireOutput.cs#L12) and [Deadworks' pinned declaration and nullability note](https://github.com/Deadworks-net/deadworks/blob/06d468c3585338c333be868d9ad81da091b097e9/deadworks/src/Core/Hooks/EntityIO.hpp#L33). These are implementation references, not Valve guarantees or substitutes for the matched ELF.

## Why a final-argument pointer swap is insufficient

With the optional variant absent, the matched engine reads the fourth object's leading count, obtains element zero through 0x21c42c0, converts the resulting temporary through 0x2293620, then releases it through 0x21cc730. It therefore retains an ordinary value path when R9 is null. Forwarding only the final variant and otherwise publishing `""` would discard that path. Swiftly and Deadworks forward the final variant but do not reconstruct the pack fallback in the inspected files.

The public s2script [OutputEvent.value contract](https://github.com/s2script/s2script/blob/be0a3e33041e921ec113203d4e14a22c996deab7/packages/sdk/entity.d.ts#L223) requires a string value, and core's dispatch test checks exact value preservation. A single pre-output notification represents the source value; connection-specific override values are applied later in the engine and must not be conflated with it. Clarify that distinction in the repair's API documentation.

## Concrete implementation requirements

1. Replace the misleading fourth-argument `CVariant*` type across `named_hooks.h`, `named_hooks.cpp`, `S2NamedOutputOp`, invocation fixtures and the late-output KHook fixture. Preserve all six pointer/integer slots, XMM0 and original forwarding; Metamod needs no patch.
2. Implement a block-scoped value decoder with explicit precedence: final variant when present; otherwise the verified first Pulse argument when count is positive; otherwise empty value. Never reinterpret the pack as a variant, manually chase its +0x88 backing storage, or use the parameter-map pointer as a value.
3. The subsequent matched-image audit identified a complete wrapper which checks count, extracts argument zero, converts to a destination variant, and destroys its internal temporary. Resolve its unique masked signature through owned gamedata. Initialize the destination to FIELD_VOID and guard null packs. Use CVariantBase with an explicit engine allocator: the wrapper allocates owning strings/vectors through g_pMemAlloc. The SDK default allocator may itself redirect through memdbgon macros, so its behavior must not be described categorically as libc; the explicit allocator makes capture ownership independent of that macro configuration. The CSTRING branch was directly verified to copy length+1 bytes and set CV_FREE. This avoids guessing the opaque Pulse temporary layout.
4. Keep borrowed engine pointers on the game thread inside the callback. Copy all string/vector data before any temporary destruction or entry into plugin user code, then dispatch an owned value string synchronously. Do not dereference engine payload data after plugin callbacks may have changed its owners, and let no pack, map, variant, buffer or output pointer escape or cross an await. Never free engine-owned borrowed variants or shallow-copy an owning variant into a destructible local.
5. Preserve the current supported variant formatting and 256-byte buffer behavior unless an explicit public contract change is made. Direct tier1 `CVariant::ToString`/`AssignTo(CBufferString&)` currently introduces unresolved imported symbols, so simply calling the SDK method is not an established loadable solution. A resolved engine serializer is viable only once its argument layout and ownership are verified.
6. If any required decoder signature/layout fails validation, disable named-output decoding with a precise descriptor reason and allow the original engine call. Do not globally crash, silently report guessed values, or manufacture a plugin-level raw-pointer workaround. Preserve synchronous HookResult collapse and original-call suppression at result ≥2.

## Required regression cases

- Distinct fourth pack, sixth map and final variant sentinels plus delay prove callback/original argument preservation; Continue/Changed run the original once and Handled/Stop suppress it.
- An adversarial pack whose bytes could resemble FIELD_STRING is never interpreted as CVariant. This must exercise the production decoder, unlike the current invocation fixture which only checks non-null pointer forwarding.
- Final variant null with empty pack; one ordinary string/numeric pack argument; multiple pack arguments selecting element zero; final variant present with a differing pack proving precedence; nullable absent values follow validated rules without unsafe access.
- FIELD_STRING/CSTRING, numeric widths including exact 64-bit values, bool/character/vector/QAngle, null pointer-bearing values, unsupported types and long strings preserve established formatting.
- Copies survive source/temporary destruction; no double free or borrowed pointer escapes. Nested outputs keep independent temporary frames; subscriber unload/reload does not retain a value pointer.
- Descriptor-resolution failure falls through safely; wildcard/exact subscribers receive the same copied value and correct activator/caller/delay; real trigger/map outputs preserve zones behavior.
- Loadable compatible core/shim build, targeted ABI/decoder/lifecycle native gates and JS/package gates (exact scopes recorded in acceptance evidence), all stock plus TTT plugins, and guarded normal moving-bot combat with Bodies enabled. No-subscriber outputs must also be safe because the native hook is unconditional. A short clean run cannot establish a universal crash fix.

## Remaining limits and provenance

The wrapper argument order, empty-pack behavior, temporary cleanup, destination variant layout, engine allocation/free slots and CSTRING deep-copy branch have been verified against the matched image. The complete opaque Pulse layout and all variant discriminator cases remain unverified and are not required by the wrapper seam. The primary class names now narrow the search substantially; there is no public Pulse layout in the inspected pinned HL2SDK tree. AddEntityIOEvent's current signature and deep-copy/borrow lifetime are separate unresolved input-path questions and should not be silently changed as part of output extraction. The historical formatter fault remains relevant evidence, not proof that no additional fault exists.

Primary-source capture: `/tmp/s2s-ttt-output-contract-primary-audit-20261003/manifest.json`, SHA256 `e527734cc7a660e53fc0ebe91b3d08bb464b2971523c8d982c7401776850c8ec`; six pinned files totaling 20,621 bytes. Matched engine/static proof directories and independent helper review retain their existing hashes. No crash memory, raw registers, credentials or player data are included here. No upstream issue/message/PR was posted.

Wrapper audit receipt: `/tmp/s2s-ttt-pulse-wrapper-extraction-receipt-20261004.json`, SHA256 `ae77f931e28b04acef720bf6e8f9ed6cb0f45f4e24f26b96a861fb0ba341221f`. Its filename uses the remote UTC date; the local session date is October 3. The 11-file receipt records safe static code evidence, not crash memory.

Allocator wording correction: the archived static proof report described SDK default allocation as necessarily libc. The pinned memdbgon.h macro path can instead redirect it to the engine allocator. The repaired adapter explicitly calls MemAlloc_Alloc/Free; its ownership guarantee does not rely on that SDK macro state. This correction does not change the verified engine wrapper or CSTRING deep-copy branch.
