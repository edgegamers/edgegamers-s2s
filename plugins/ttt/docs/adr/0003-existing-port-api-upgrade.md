# ADR0003 — Upgrade the existing port through public s2script APIs

Accepted October2,2026 by the user. Supersedes ADR0002 and the earlier Bara-first implementation scope wherever they conflict.

## Decision

Use s2s-ttt-port-old revisionbd2c38273c57fac2356982c64b5329087fc147f5 as the implementation and behavior baseline. Update it to current s2script APIs/KHooks, then split its owners into independently configurable plugins. Preserve existing gameplay and visuals; Bara is a reference for deliberate comparisons, not an exhaustive module/item mandate.

Use official Metamod and the supported framework interfaces. Do not patch Metamod/KHook, require private admission exports or introduce a custom native lifecycle framework to perform the migration. Root restored the prior official supplier and verified actual server plugin discovery. The previous modified-supplier approach is withdrawn.

## Reason

The user explicitly rejected Metamod patches and redirected the work to the existing port's API upgrade. The old port already uses SDKHook and contains the requested CS2 mechanics; its current-API migration is substantially smaller than the reconstructed Bara expansion.

## Consequences

Preserve the prior work as history, start a clean upgrade branch, remove obsolete API shims, migrate the existing HE engine descriptor and retain old event ordering during modular extraction. Keep native/client acceptance meaningful without adding unrelated framework prerequisites or catalog/assets. The current spec records operational/UI requirements that still apply.
