# Port research

These reports distinguish source findings, proposed adaptations, and live acceptance. They do not claim the new port exists or has passed CS2 tests. Research was performed October 1, 2026 in America/Los_Angeles; some source timestamps are recorded in UTC on October 2.

Start with the agreed choices in `../port-decisions.md` and the reviewable implementation brief in `../specs/modular-ttt-port.md`.

| Report | Purpose |
| --- | --- |
| [Bara behavior](bara-behavior.md) | Source-derived lifecycle, roles, privacy, combat, economy, bodies, karma and moderation. |
| [Bara shop inventory](bara-shop-inventory.md) | All shop-provider registrations and default prices; registration counts are not unique item counts. |
| [Bara distributed preset](bara-deployment-preset.md) | Enabled/disabled package inventory, feature switches, persistence and sanctions. |
| [Full coverage map](port-coverage-map.md) | All 68 Bara modules mapped to target responsibilities, reuse and remaining behavior work. |
| [Prior port and CSS](prior-port-and-css.md) | Reusable CS2 mechanisms and Cluster/Tripwire behavior and defects. |
| [s2script feasibility](s2script-feasibility.md) | Pinned APIs, deployment/runtime requirements and UI delivery. |
| [Framework assessment](framework-gap-assessment.md) | Corrected distinction between existing capability, CS2 adapter work and unmeasured behavior. |
| [Runtime implementation contract](runtime-implementation-contract.md) | Service authority, synchronous interop, attachment generations, item transactions and adapter gates. |
| [CSS migration](css-data-migration.md) | Historical and current persistence contracts, data scales and import requirements. |
| [Staging preflight](staging-preflight.md) | Authorized host's read-only candidate inventory; no deployment was performed. |

Immutable upstream references identify source revisions; absolute local source links are for this checkout and are not portable deployment instructions.
