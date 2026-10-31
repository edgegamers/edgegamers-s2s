# Modular Bara TTT port — implementation brief

Historical planning, superseded by ADR0003 and the current existing-port brief. The grenade-transfer Cluster proposal below was explicitly withdrawn by ADR0009; current Cluster remains buyer-only.

Status: confirmed by the user's "go" on October 1, 2026, America/Los_Angeles. This defines the intended finished port; it does not claim implementation or live acceptance.

## Outcome and baseline

Deliver a complete modular CS2 TTT deployment using s2script, with Bara's round flow, hidden-information game, economy, karma, corpses, shop items, map interactions, and moderation. Preserve audited balance and defaults, fix confirmed defects, and record every deliberate deviation. Use the prior port's useful CS2 mechanisms after checking them against Bara; do not inherit its smaller catalog or CSS gameplay policies.

The reference baseline is Bara `aa9699cbc403023a4947e6d60a263cb3f95919b7`. The old port is `bd2c38273c57fac2356982c64b5329087fc147f5`; CSS additions and migration contracts are audited at `80716fba705a42ea60bfae0095b5a222e9eba7d1`, with historical revisions where persistence changed. Initial SDK pins are `@s2script/sdk` 0.27.1 and `@s2script/cs2` 0.19.1, audited with runtime `be0a3e33041e921ec113203d4e14a22c996deab7`. Revalidate the matched native runtime, CS2 package, gamedata, and server build before deployment.

The coverage ledger must account for all 68 top-level Bara modules and root support behavior. Bara's workflow intends to package 62 non-disabled binaries and six disabled binaries if compilation and packaging succeed; actual historical archive/live enablement was not verified, and a loaded binary can still have individual options disabled. Preserve those distinctions. Build optional modules independently, with an explicit disabled preset entry where Bara disables them. External item wrappers require their underlying gameplay to be investigated and adapted, rather than being represented by an inert catalog entry. CSS contributes only Cluster and Tripwire. Bara tripmines remain a separate item.

## Deployment units and ownership

Use an npm workspace that emits independent `.s2sp` archives. Each feature or item has a package manifest, typed JSONC defaults, a lifecycle owner, and an independently buildable target. Shared packages contain pure domain algorithms, contract declarations, validation, and CS2 helper code. Mutable game state lives in published service providers, never an imported singleton copied into multiple bundles.

| Plugin/service | Owns |
| --- | --- |
| `ttt-core` | Round state, eligibility, role selection and changes, logical life, captured incidents, combat policy order, win conditions, terminal round cleanup. |
| `ttt-storage` | MySQL connection, schema migrations, player loading, versioned durable records, operation IDs/completions, retry and health state. |
| `ttt-karma` | Bara karma policy, damage scaling decisions, round recovery/caps, low-karma sanction requests. |
| `ttt-shop` | Credits, catalog/provider registry, purchase authorization, limits, inventory entitlements, debit/refund and grant coordination. |
| `ttt-bodies` | Corpse entities and evidence, identification/search, loot, body state, body interaction and cleanup. |
| `ttt-communication` | Role/dead chat, voice routing, traitor voice toggle, mute integration, private report-reason capture. |
| `ttt-reports` | Reports, forgiveness and staff verdict workflow, incident-scoped sanctions, durable slay debt, staff authorization. |
| `ttt-ui` | Panorama views, projection and interaction state, HUD/shop/body/report/admin flows and recipient-specific messages. |
| Feature plugins | Bara map tester/secrets, scoreboard/radar concealment, icons/glow, models/loadouts, statistics, spectator and administrative features, according to the coverage ledger. |
| Item plugins | Individually installable item/effect providers; role variants of the same mechanic may share one provider, as Bara does. Cluster and Tripwire each get their own provider. |

Publish narrow versioned Protocol-2 services using synchronous copied records, notifications, hooks, and transforms supported by s2script. Methods that request asynchronous persistence return an operation ID immediately, followed by a completion notification; a Promise never crosses a contract. Define bounded pages for catalogs, bodies, reports, and logs. Private player facts remain authoritative on the server; the UI receives an authorized projection.

Provider registration and item grant use typed methods returning explicit success/failure. An unacknowledged notification or fail-open hook cannot authorize a purchase. The shop revalidates and reserves credits/limits, calls the currently attached item provider, then commits or compensates the transaction. Delayed engine grants use a bounded pending operation with an explicit completion, timeout, and rollback policy. Optional providers are watched through generation-owned attachments; detach withdraws their entries and invalidates pending actions immediately. Required provider absence suspends dependent functionality with an operator-visible reason.

All actions and delayed callbacks validate connection identity, round/map epoch, entity liveness, provider generation, and relevant permission. Captured incidents use stable SteamID64 and historical roles. Reloads invalidate old UI selections and engine handles. Core reload cleanly aborts the current round without winner rewards or RDM enforcement and terminates the engine round locally. Dependent providers clean their own round effects when their core attachment is disposed; teardown cannot rely on a final event after the host has swept subscriptions. Handoff contains metadata and durable references, not live role/weapon/effect state. Durable data survives restart. Feature/item reload removes only its registrations and effects; necessary provider outages prevent new rounds. Apply gameplay/balance config changes to the next round.

## Bara rules and information flow

Preserve Bara's selection weighting and configurable forced-role/banned-role behavior. Defaults are three eligible players, 25% traitors with a minimum of one, 13% detectives with a six-player eligibility threshold, and a configurable minimum of one detective at that threshold. Keep selection finite when forced roles, bans, disconnects, and caps conflict. Preserve 30-second preparation, one-second freeze, five-minute round time, and seven-second end delay unless imported configuration changes them. Logical role and winner are independent of engine CT/T teams.

Preserve Bara's karma and role-versus-role credit tables, 100 starting karma, normal cap 150, VIP cap 300, 800 starting credits, and win/body/kill rewards. Session credits carry across ordinary rounds and maps while the player stays connected, reset to 800 on reconnect, and do not carry across a server restart or another server. Core reload does not reset a surviving shop provider's wallet; shop reload hands off its session balances with connection guards. Default persistent wallets remain off as in Bara; karma, slay debt, reports, and history are durable. Use the full research fixtures for exact policy values rather than reconstructing them from this summary.

Keep deaths concealed as Bara intends: suppressed public killfeed, neutralized scoreboard statistics, and apparent public life until body identification. A victim can receive the killer's role and a killer can receive the victim's role under Bara's defaults. Do not pin the victim's actual pawn alive in a way that breaks spectating. Body finding follows Bara's nearest-body interaction/default radius and permitted disclosure; adding mandatory aim/LOS to ordinary identification would be a separately documented policy change. Silent identification preserves Bara's existing public-found semantics. DNA follows Bara's killer-information behavior, rather than the old port's tracking-only interpretation.

Role chat and voice preserve Bara's live/dead and role boundaries, traitor voice toggle, staff exceptions, and mute precedence. Panorama role/shop/report/admin surfaces use `observable:false` as agreed. Revalidate all UI actions on the server. Report reasons consume the intended reporter's next chat reply privately, with cancel, timeout, disconnect, and reload handling. Views and messages must not accidentally disclose another player's role, hidden death, balance, or report during ordinary spectating, slot reuse, or simultaneous menus.

Carry forward the old port's visual and UX improvements while retaining Bara gameplay unless explicitly changed. Traitor-buddy silhouette outlines are an explicit requirement. Use a CS2 model-following glow renderer with ally visibility, configurable color/range/duration, and safe entity lifetimes. Do not substitute a text marker for this requirement. Verify visibility, model following, death/revive/role-change cleanup, spectator behavior, repeated rounds, and reconnects with receiving clients. Separate visual defaults from mechanical rules when comparing the two codebases.

## Confirmed corrections and additions

Maintain a parity ledger beside the implementation. Proposed corrections under the agreed bug-fix policy include: credit RNG actually selecting the intended configured range; finite role allocation under bans/forced roles; inventory role eligibility and role-variant registration fixes; incident-scoped forgiveness instead of clearing all slays; historical incident roles and offline durable verdicts instead of current-role/online-only decisions; and owned-effect cleanup, transaction rollback, and stale-action rejection. Add regression evidence for each. Preserve ambiguous quirks until evidence resolves intent; do not redesign gameplay merely because the old code looks unusual.

Cluster is bound to the granted physical grenade, transfers on drop/pickup, and creates real bouncing child grenades through a verified CS2 factory. Preserve CSS's substantive effect configuration while fixing charge consumption, owner validity, attribution, and lifecycle bugs. Child entities are tracked through round/map/provider cleanup.

Tripwire is purchased as a held charge and placed with an explicit action/command. Validate both anchors and the connecting segment before consuming the charge. Use two shootable/defusable anchors, a visible beam, an arming delay, and continuous defusing by one eligible player; movement, release, death, disconnect, or invalid range/LOS cancels progress. Blast traces respect walls and configurable fellow-traitor damage. Crossing detection is bounded, and cleanup covers purchase, pending placement, arming, active traps, detonation, defuse, reload, and map end.

Engineering proposal for review: introduce both additions at 9,000 Bara credits, traitor-only, one purchase/charge per round, with all values in their independent JSONC configs. This aligns their initial cost with Bara's C4/tripmine/utility tier; do not copy CSS's 100/45 values directly into Bara's currency. Tune from staging evidence and record resulting defaults.

## Configuration, persistence, and migration

Canonical operator config is typed per-plugin JSONC with schema/version validation, descriptive defaults, named production/staging presets, and dependency checks. Supply a Bara ConVar/config importer and a CSS config mapper that report unmapped/ambiguous keys and never silently translate different mechanics. Keep familiar command aliases. Import role flags, models, map settings, and shop eligibility where supported; do not invent an equivalence for absent CS2 assets.

MySQL is the production default. A storage operation is acknowledged only after its durable effect is confirmed. Use versioned player mutations, incident/sanction provenance, unique idempotency keys, and durable slay consumption so retries, reconnects, and restarts do not duplicate or erase penalties. A shared database does not make local session credits a shared wallet. Optional persistent wallets require explicitly selected semantics and transaction handling.

Engineering proposal for review: a DB outage must not indefinitely stall activation on a round-log insert. MySQL remains canonical, with a small persistent local SQLite outbox owned by storage solely for crash-retained pending writes. Distinguish queue admission, acknowledged local journal commit, and acknowledged MySQL commit. Apply mutations with stable operation IDs and atomically recorded deduplication receipts; pooled MySQL calls must not assume separate BEGIN/COMMIT statements share a connection. Never evict uncommitted journal entries to make room.

An active round can finish from loaded state while the local journal remains healthy. Pause new starts when required player state or durable enforcement cannot be trusted. Default session-wallet purchases do not require a MySQL wallet commit; persistent-wallet purchases do. Defer external punishments until canonical sanction records are committed. Bound journal admission by records/bytes, reserve cleanup capacity, and reject changes requiring persistence if admission fails. If the journal cannot retain combat outcomes, terminate the round cleanly and pause rather than acknowledge records that can vanish. Report outages/backpressure to operators and reconcile before resuming. Preserve the journal volume across restart/redeployment and verify durability with crash/replay tests. A cache update or journal receipt is never reported as a committed MySQL write.

Migrate existing CSS player data through an explicit immutable export/snapshot, validation report, and repeatable import into the new schema. Older CSS versions can store karma through `GET/PATCH user/{SteamID64}`; current main defaults to RAM. Optional stats and historical backend schemas require the actual deployed source/provider or an export to identify their format. CSS `credits_earned` is not a wallet, and no stock durable report/slay store was found. Retain source values, provenance, rejected records, and migration identifiers. The importer does not replay gameplay rewards or moderation effects.

Engineering proposal for review: convert CSS karma into Bara's starting scale with `target = round(source * 2)` (CSS default 50, Bara default 100), while retaining original values. This aligns starting values, not sanction rules: CSS 25 would become Bara 50 and fall below Bara's default ban threshold; CSS 100 would become 200 and exceed the normal 150 cap. The dry-run must list changed/capped players and those entering a sanction range. Resolve caps from target entitlements, never a guessed CSS VIP flag. Require an explicit scale, cap/conflict policy, and treatment of legacy low-karma players in the actual import plan. Import/replay itself never issues punishments. Historical statistics remain historical source records rather than being rewritten as synthetic Bara rounds. Do not import transient balances as durable credits.

## Panorama experience

Use first-party hudkit to establish a real working interface and addon delivery. Target a restrained CS2 visual style: readable typography, consistent spacing, role accents, clear prices/limits, deliberate focus/selection, short confirmations, and useful disabled reasons. Keep the round/role HUD compact. Shop flows use stable categories/items, pagination and detail/actions; body views separate public identity from detective evidence; report and staff views keep reason/verdict state explicit. Support simultaneous surfaces and clean disposal so a shop footer cannot invoke a report action.

Use a custom content addon if hudkit's fixed component layouts/styles cannot meet the finished design. Addon delivery, compilation/publication artifacts, version matching, Workshop identifiers, and fallback behavior belong in the release checklist. A server-side `ready` flag alone does not prove client assets rendered. Human acceptance covers normal receiving clients, observer modes, reconnects, resolution/readability, input interactions, and voice. Missing assets get useful recipient-specific messages/command access while operators see delivery diagnostics.

## CS2 adaptation and acceptance

Implement CS2 entity, schema, native-call, gamedata, and package bindings as needed. Verify actual signatures/layouts against the deployed build. Required adaptations include true weapon drops, reserve ammunition, exact synthetic damage/attribution where generic mechanisms differ, corpses, physical grenades, explosions, beams/markers, map interactions, and asset equivalents. Missing convenience wrappers do not reduce scope. Refuse an unavailable effect before charging rather than shipping a successful inert grant.

Use source-derived pure fixtures for round/role/economy/karma/RDM rules; contract/build checks for all independent archives; integration checks for provider disappearance/reappearance, stale callbacks, transactions, durable restart/readback, and migration replay; live bots for combat/entity/map behavior; and two human receiving clients for Panorama, spectating, hidden-information presentation, and voice. Tests should verify outcomes, not mirror implementation. Do not claim live parity from typechecking or the old port's 47 pure tests.

Stage on the authorized host in an isolated CS2 deployment with a matched current runtime, MySQL, required addon delivery, and real punishments disabled. The read-only preflight identified stopped candidates but did not start or modify them. Record checksums/build identities and bounded cleanup. The user will arrange two clients when the reproducible acceptance script and staging build are ready.

Implementation proceeds in dependency order: workspace/contracts/storage and CS2 capability probes; core/combat/karma/information concealment; bodies/communication/reports/shop/UI vertical flow; full Bara feature/item coverage in parallel provider batches; Cluster/Tripwire; configuration/data import and release presets; integration/visual polish and live acceptance. Every coverage row must end in an implemented and verified behavior, or an explicitly reviewed adaptation with evidence. An intermediate playable build is not completion of the full port.

## Completion evidence

- All required feature/item archives build independently and as a workspace; install, removal, reload, and dependency recovery are exercised.
- Full Bara coverage ledger is resolved with defaults, corrections, CS2 adaptations, and validation links. No silent catalog cuts or placeholder effects.
- MySQL schema/readback, slay/report lifecycle, restart, outage recovery, and CSS dry-run/idempotent migration checks pass.
- Production and staging JSONC presets and legacy import reports are documented and reproducible.
- Two-client HUD, menus, private rendering, hidden deaths, spectators/reconnects, and voice checks pass; combat/corpse/map/item checks pass on the recorded CS2 build.
- Release artifacts include deployment/runbook, addon requirements, configuration reference, parity ledger, licenses/source attributions, and a final evidence record. Preserve Bara GPLv3 and CSS AGPLv3 source notices in adapted code and package provenance.

The user confirmed the agreed decisions and the three explicit engineering proposals above (enhancement pricing, outage behavior, karma-conversion preview). Remaining implementation facts are to be resolved by source/code/probes; identifying the actual migration dataset and providing receiving clients are later deployment inputs.
