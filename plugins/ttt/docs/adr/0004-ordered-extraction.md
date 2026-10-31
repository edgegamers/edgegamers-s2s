# ADR0004 — Preserve old handler order while extracting owners

Proposed implementation, October 2, 2026. Follows ADR0003 and the upgraded existing port.

## Decision

Core owns the registry, game state, and the ordered domain coordinator. Every cross-plugin domain callback is one of the existing 43 registrations in `packages/contracts/ordered-plan.ts`. Sort by old priority first, installation ordinal second, and local registration ordinal third. Plugin load/watch order does not change ties. Do not introduce a shared mutable bus or registry library.

Existing Core installation functions receive `coordinator.forModule(module)` as an actual EventBus subclass. Each registered callback still runs inside a local EventBus, retaining its existing exception behavior. The unscoped `coordinator.bus` provides emit/has/clear; registrations must identify their old module. A row is either local or attached from its owner, never both.

An extracted feature calls `createFeatureAdapter(module, options)` and installs its old callbacks on the returned local bus. It merges `getHandlers` and `handleDomain` into its single finite Protocol2 publication. Core watches that publication and owns the attachment disposer. Shared helpers are factories, immutable metadata, and pure types; all callback registrations and gameplay state belong to one owner instance.

The public declarations must inline `packages/contracts/wire.d.ts`: the pinned SDK rejects external type imports in producer contracts except its supported SDK types. This fragment imports only the supported EntityRef type. The shared implementation types are checked against the fragment in tests. Root owns the exact Core/feature publication names, manifest associations and generated contract metadata.

## Semantics retained

Each dispatch snapshots its callable rows. Cancellation skips only callbacks marked `ignoreCanceled`; other callbacks still observe and may change the payload. A provider replacement during a walk participates starting at the next walk. Detach disposal cannot accidentally remove a later replacement.

Only existing mutable event fields cross back. Feature adapters catch callback exceptions locally and return mutations made before the throw, matching the old bus. Body DNA suppression is copied into the original body object, preserving its owner alias. No body key, native lifecycle model, asynchronous event queue or general command bus is introduced.

The owner retains its original commit point: game state, role, karma, balance, purchase and identification changes still occur in their existing order around dispatch. Synchronous nested dispatch preserves precommit reads. Core retains local EventBus code unchanged for direct baseline comparisons and existing tests.

## Why this seam

SDK notifications/transforms cannot directly encode the old priority/tie order; their subscriber method has no priority parameter. A Stop result also differs from canceled events whose non-opted-in observers must continue. One coarse semantic method per feature would combine callbacks at different priorities. The finite coordinator preserves the old callback bodies with two feature methods and one Core dispatch method. Normal queries and actions remain named semantic methods, outside this ordering bridge.

## Extraction direction

First move Karma, then Shop economy, Bodies/interact, Communication, Reports, UI, Special rounds, and the existing 21 items. Core continues to own registry/round/role/combat state. Mixed Core handler rows can call owner methods without changing their statement order. Break runtime import cycles by replacing mutable cross-owner source imports with copied queries and named owner operations. Pure model selection, enums, math and formatting may be shared; caches, queues, attribution, wallet and item state may not be duplicated.

Keep the one logical effects damage row while extracting item implementations: Taser precedes the canceled guard, then Revolver, Knife and Poison Shots retain their original early returns. An item branch ending that row must not stop the whole event walk. Use the existing item set and gameplay rules; Bara expansion and custom native prerequisites are outside this migration.

## Validation and limits

Differential tests compare the new mixed local/copied-provider walk with the original EventBus, including priority ties, canceled observers, mutations before exceptions, nested emits, body alias copyback, and replacement snapshots. Unknown/duplicate/wrong-owner rows and changed registration options are rejected atomically. These tests simulate a copied boundary; root's actual archive and Protocol2 publication tests remain required for the composed Core/Karma extraction. Live engine/client behavior is not claimed by the unit tests.

Cost if wrong: order drift can change rewards, scans, guilt, roles or precommit state. The fixed old registration inventory and differential tests target those failures while keeping extraction incremental.
