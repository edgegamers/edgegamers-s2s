# Modular TTT API upgrade — implementation brief

Status: user-corrected baseline on October2,2026. This replaces the Bara-first implementation brief; its previous text is retained in docs/history/2026-10-01-bara-implementation-brief.md as historical planning, not the current implementation target.

## Outcome

Upgrade the existing working s2s-ttt-port-old to the current s2script APIs and extract it into independently configurable plugins. Preserve its gameplay, mechanics, existing items, round flow and visual/UX features, including traitor-buddy silhouette outlines. Bara may inform a specific future comparison, but it does not prescribe this migration's catalog, quotas, native prerequisites or acceptance scope. Do not rebuild the mode from the Bara audit.

## Exact baseline and framework

Implementation source is the clean old-port revision bd2c38273c57fac2356982c64b5329087fc147f5. Current upstream HEAD and releasev0.7.0 were reverified on October2,2026 as be0a3e33041e921ec113203d4e14a22c996deab7. Use SDK0.27.1 and CS20.19.1 with the corresponding unmodified framework and official Metamod. No Metamod or KHook patches, private supplier exports or modified supplier deployment are part of this port. The framework owns native hooking; plugins use its published SDKHook, typed game hooks, EntityRefs, Engine.function/plugin-owned gamedata and supported inter-plugin APIs.

The initial copied baseline already builds with the current SDK after only dependency pin changes and passes all47existing tests. This proves a build and existing test outcomes, not live compatibility. Concrete API migration remains: remove obsolete ambient API declarations, use current typed declarations directly and migrate the one legacy HE factory Engine.call declaration to the supported current descriptor with validated target/vector lifetimes. Investigate current API behavior through actual source and staging; do not invent missing framework facilities or new native protocols.

## Modular extraction

Emit separate .s2sp archives for Core, karma, shop/economy, bodies/interactions, communication, reports, UI/presentation and existing item/effect modules. Optional features already in the old port remain independently configurable; no new Bara or CSS catalog expansion is required. Cluster retains its buyer-only charge and real bouncing child grenades; grenade drops/pickups do not transfer the effect. Tripwire retains its existing implementation and explicitly selected, tested improvements.

Core owns the registry, game flow and ordered domain decisions. Feature plugins own their live state, native resources and cleanup. Pure shared packages may hold enums, phrases, algorithms, validation and adapters; importing a mutable registry or event bus into multiple archives must not create duplicate authority. Use finite typed Protocol2 contracts and actual supported notifications/hooks/transforms. Preserve the old bus's priority, tie order, cancellation semantics and pre-commit gameState behavior during extraction; copied IPC notifications alone cannot replace its mutable decision pipeline.

Preserve Waiting→Countdown→InProgress→Finished, warmup gating, bot/roster handling, existing role quotas and rotations, respawn configuration, bounded PRE-frame spawn settling, win branches, next-deal reservation versus admin role assignment, shop and karma formulas, body behavior, reports/sanctions, concealed deaths, private UI and visual recipient policies. Make only deliberate, tested migration fixes; document actual behavior changes. Existing connection generations and map/round guards remain; no new native logical-life framework is a migration prerequisite.

## Existing user requirements

The modular configuration, first-party custom Panorama UI, observable:false for private data, actual buddy outlines, safe reload cleanup and legacy configuration mapping remain goals. Previously agreed operational requirements such as shared MySQL/player-data migration and two-client acceptance remain separate deliverables unless superseded; they must not block or inflate the SDK migration. Staging stays sanctions-disabled and uses the authorized nebula host. The earlier request for a Windows compiler host was tied to the withdrawn Bara item expansion and is not required for this migration.

## Verification

First freeze a verified existing-port API upgrade; then extract owners in reviewable steps with old-behavior fixtures and meaningful real-archive integration checks. Build and strict-check every actual producer/consumer, preserving event order and old source behavior across boundaries. Test supported KHook/SDK behavior on unmodified framework/official Metamod. Use actual receiving clients for Panorama, voice, outlines, corpse rendering and private recipient acceptance. Report source/build/test/native/client evidence separately.

The prior Bara expansion, custom damage/lifecycle prerequisite work and modified Metamod supplier are withdrawn implementation paths. Their work remains preserved on codex/modular-ttt-port for history; it is not automatically carried into this clean migration branch.
