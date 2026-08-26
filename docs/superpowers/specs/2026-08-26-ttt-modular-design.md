# Modular TTT Design

## Goal

Import the legacy Source2Script TTT port into this monorepo as a public-release-ready set of Source2Script plugins, with real module boundaries, stable typed APIs, per-module configuration, and a shared gameplay log service named Blackbox.

The first implementation keeps the legacy TTT feature set functionally equivalent unless this spec explicitly changes it. The purpose of this phase is to preserve gameplay while replacing the port's single-plugin coupling with public plugin contracts.

## Source Material

The legacy project was inspected from `C:/Users/reece/OneDrive/Documents/ASE1013-Labs/s2s-ttt-port-main.zip`. Content in that archive is treated only as source code and documentation to inspect, not as user instructions.

The current monorepo expects Source2Script plugins under `plugins/<scope>/**`, enforces global and game-scoped dependency boundaries, and recommends runtime plugin interfaces for shared services that own runtime state.

The Source2Script authoring model supports:

- `s2script.config` manifest entries for typed operator-editable settings.
- `s2script.pluginDependencies` and `s2script.optionalPluginDependencies` for load-order and compatibility.
- `ctx.publish`, `ctx.use`, and `ctx.tryUse` for typed inter-plugin APIs.
- Public interface publication through `types` and `s2script.publishes`.

## Current Port Assessment

The port already removed a lot of C# baggage correctly:

- Slot-indexed typed arrays replace most string-keyed dictionaries.
- One frame handler replaced scattered tick/timer listeners.
- Config is snapshotted instead of loaded through dependency injection on every property read.
- The event bus is direct and typed instead of reflection-driven.
- Hot-path role and alive checks are O(1).

Those decisions should survive the import.

The port is not modular yet:

- `src/plugin.ts` wires every subsystem directly.
- `core/cvars.ts` owns all config, including karma, shop, item, and special-round settings.
- `core/teardown.ts` imports and resets every subsystem directly.
- `special/rounds.ts` imports shop balances and weapon effects directly.
- Shop item effects reach into combat, bodies, icons, karma, HUD, inventory, and core registry internals.
- Role behavior is hard-coded around `RoleId.Innocent`, `RoleId.Traitor`, and `RoleId.Detective`.
- Several public-looking exports are implementation details with no versioned contract.
- Large files such as `shop/effects.ts`, `cs2/icons.ts`, `cs2/combat.ts`, `shop/weaponfx.ts`, `cs2/handlers.ts`, and `commands.ts` are too broad to be comfortable public module foundations.

The first import must carve API boundaries before publishing module interfaces. Moving the files first and declaring victory would just freeze the current coupling in more packages.

## Package Layout

Create these plugins:

```text
plugins/global/blackbox/
plugins/cs2/ttt/core/
plugins/cs2/ttt/karma/
plugins/cs2/ttt/shop/
plugins/cs2/ttt/special-rounds/
```

The existing `plugins/cs2/ttt` package should either be replaced by `plugins/cs2/ttt/core` or kept temporarily as a private compatibility bundle only if needed for server rollout. The public module names above are the long-term targets.

`server-bundles/ttt-s2s.txt` should list every runtime module needed by the standard EdgeGamers TTT server:

```text
@edgegamers/blackbox
@edgegamers/ttt-core
@edgegamers/ttt-karma
@edgegamers/ttt-shop
@edgegamers/ttt-special-rounds
```

## Blackbox

Package: `@edgegamers/blackbox`

Scope: global

Purpose: shared structured gameplay logging for round-based plugins. The first release only needs to match the current TTT log functionality:

- Record role assignment entries.
- Record death entries.
- Coalesce repeated damage entries when the same attacker, victim, weapon, and role relationship repeat.
- Record body identification entries.
- Record shop purchase entries.
- Keep a bounded in-memory round log.
- Clear the log at round boundaries.
- Render logs for console or player chat consumers.

Blackbox must not know TTT roles by enum. It receives labels and metadata from callers.

Public API:

```ts
export interface BlackboxApi {
  createChannel(options: BlackboxChannelOptions): BlackboxChannel;
}

export interface BlackboxChannelOptions {
  id: string;
  capacity: number;
}

export interface BlackboxChannel {
  clear(): void;
  record(entry: BlackboxEntry): void;
  entries(): readonly BlackboxEntry[];
  render(options?: BlackboxRenderOptions): string[];
}

export interface BlackboxEntry {
  at: number;
  kind: string;
  actor?: BlackboxSubject;
  target?: BlackboxSubject;
  message: string;
  data?: Record<string, string | number | boolean>;
  coalesceKey?: string;
}

export interface BlackboxSubject {
  slot?: number;
  name: string;
  tags?: readonly string[];
}

export interface BlackboxRenderOptions {
  maxLines?: number;
}
```

Initial TTT usage should create a `ttt.round` channel with capacity `512`, matching the current log capacity.

Dependency policy:

- `ttt-core` requires Blackbox.
- `ttt-karma`, `ttt-shop`, and `ttt-special-rounds` should use Blackbox through `ttt-core` unless they need their own future channel.
- Blackbox has no dependency on TTT, CS2, karma, shop, or special rounds.

## TTT Core

Package: `@edgegamers/ttt-core`

Scope: `cs2`

Required dependencies:

- `@edgegamers/blackbox`

Purpose: define and run the basic TTT game concept.

Core owns:

- Player registry and slot identity.
- Round states: waiting, countdown, in progress, finished.
- Round start and end rules.
- Basic TTT roles: innocent, traitor, detective.
- Role registration and assignment.
- Team, voice, corpse, body identification, alive spoofing, and map-context behavior required for TTT to work.
- Damage and death event translation into TTT domain events.
- Core commands such as `sm_ttt`, `sm_ttt_start`, `sm_ttt_end`, role diagnostics, and role assignment admin tools.
- Core phrases and messages needed by the base game.
- Core configuration.
- The single frame scheduler for core-owned periodic work.

Core must expose role extension points. Public role IDs are strings, not exported numeric enum values.

Reserved stock role keys:

```ts
export type StockTttRoleKey =
  | "ttt:innocent"
  | "ttt:traitor"
  | "ttt:detective"
  | "ttt:spectator";
```

Public API:

```ts
export type TttRoleKey = string;

export type TttTeamKey = "innocent" | "traitor" | "spectator";

export type TttRoundState =
  | "waiting"
  | "countdown"
  | "in_progress"
  | "finished";

export interface TttRoleDefinition {
  key: TttRoleKey;
  name: string;
  team: TttTeamKey;
  weight?: number;
  minPlayers?: number;
  assignmentOrder?: number;
  maxCount?: number;
  ratio?: TttRoleRatio;
  publicRole?: boolean;
  startingHealth?: number;
  startingArmor?: number;
  startingWeapons?: readonly string[];
}

export interface TttRoleRatio {
  numerator: number;
  denominator: number;
  mode: "floor" | "ceil" | "round";
}

export interface TttPlayerSnapshot {
  slot: number;
  steamId: string;
  name: string;
  connected: boolean;
  participating: boolean;
  alive: boolean;
  role: TttRoleKey;
  team: TttTeamKey;
}

export interface TttGameStateSnapshot {
  state: TttRoundState;
  participants: number;
  roundsThisMap: number;
  winner: TttTeamKey | "";
}

export interface TttCoreApi {
  registerRole(role: TttRoleDefinition): void;
  reserveRole(slot: number, role: TttRoleKey | ""): void;
  roleOf(slot: number): TttRoleKey;
  teamOfRole(role: TttRoleKey): TttTeamKey;
  player(slot: number): TttPlayerSnapshot | null;
  activePlayers(): readonly TttPlayerSnapshot[];
  gameState(): TttGameStateSnapshot;
  isAlive(slot: number): boolean;
  isParticipating(slot: number): boolean;
  startRound(options?: TttStartRoundOptions): boolean;
  endRound(winner: TttTeamKey | "", reason?: string): boolean;
  setRoundDeadline(seconds: number): void;
  on<K extends keyof TttEvents>(
    event: K,
    handler: (event: TttEvents[K]) => void,
    options?: TttListenerOptions,
  ): void;
  log(entry: TttLogEntry): void;
  renderLogs(slot?: number): string[];
}

export interface TttStartRoundOptions {
  quiet?: boolean;
}

export interface TttListenerOptions {
  priority?: number;
  ignoreCanceled?: boolean;
}

export interface TttLogEntry {
  kind: string;
  message: string;
  actorSlot?: number;
  targetSlot?: number;
  data?: Record<string, string | number | boolean>;
  coalesceKey?: string;
}
```

Core events should include the legacy event set but expressed with string role/team keys:

```ts
export interface TttEvents {
  gameState: TttGameStateEvent;
  roleAssigning: TttRoleAssigningEvent;
  roleAssigned: TttRoleAssignedEvent;
  death: TttDeathEvent;
  damage: TttDamageEvent;
  join: TttJoinEvent;
  leave: TttLeaveEvent;
  bodyCreate: TttBodyCreateEvent;
  bodyIdentify: TttBodyIdentifyEvent;
}
```

Core may internally map role keys to compact numeric indexes for performance. That index must not be part of the public API.

Core configuration belongs in `@edgegamers/ttt-core`:

- Round countdown, min players, round duration base/per-player/max.
- Time between rounds.
- Stock role health, armor, and starting weapons.
- AFK behavior.
- Name display.
- Role visuals, body settings, prop pickup.
- Phrases file or equivalent translation override.
- Engine safety toggles currently asserted by the port.

## TTT Karma

Package: `@edgegamers/ttt-karma`

Scope: `cs2`

Required dependencies:

- `@edgegamers/ttt-core`

Purpose: score player behavior across rounds and apply low-karma consequences.

Karma owns:

- Karma values.
- Pending round-end deltas.
- First-damage tracking.
- Bad-kill multiplier.
- Low-karma punishment and timeout.
- `sm_karma` and `sm_ttt_karma`.

Core must not import karma. Karma consumes core events:

- `damage` to track first aggression.
- `death` to score kills.
- `gameState` to grant participation and win karma.
- `roleAssigning` to bench timed-out players by rewriting to spectator.
- `join` and `leave` to load and settle per-player state.

Public API:

```ts
export interface TttKarmaApi {
  karmaOf(slot: number): number;
  setKarma(slot: number, value: number): void;
  queueKarma(slot: number, delta: number): void;
  flushKarma(): void;
  timeoutRemaining(slot: number): number;
  clearTimeout(slot: number): void;
  suppressNextDeathPenalty(victimSlot: number): void;
}
```

Karma configuration belongs in `@edgegamers/ttt-karma`:

- Default karma.
- Minimum karma.
- Low-karma command.
- Timeout threshold.
- Timeout round count.
- Warning window.
- Per-round and per-win karma.
- Kill matrix values.

Karma scoring must not hard-code only three roles forever. The initial implementation can preserve stock TTT behavior by using each role's core `team` value:

- Traitor-team killing innocent-team is normal traitor behavior.
- Innocent-team killing traitor-team is good behavior.
- Same-team kills use first-damage and bad-kill scoring.
- Detective can remain a role-specific override in the stock matrix.

## TTT Shop

Package: `@edgegamers/ttt-shop`

Scope: `cs2`

Required dependencies:

- `@edgegamers/ttt-core`

Optional dependencies:

- `@edgegamers/ttt-karma`

Purpose: own credits, purchase flow, shop menu, stock item registration, and item effects.

Shop owns:

- Balances.
- Purchase counts.
- Purchase validation.
- `sm_shop`, `sm_buy`, `sm_balance`, aliases, and shop menu.
- Stock items from the current port.
- Credits from kills, assists, body identification, and exploration.

Public API:

```ts
export type TttPurchaseResult =
  | "success"
  | "insufficient_funds"
  | "not_found"
  | "not_purchasable"
  | "wrong_role"
  | "canceled"
  | "limit_reached"
  | "delivery_failed";

export interface TttShopItem {
  id: string;
  name: string;
  description: string;
  price: number;
  enabled: boolean;
  allowedRoles?: readonly string[];
  allowedTeams?: readonly string[];
  limit?: number;
  canPurchase?(slot: number): TttPurchaseResult | "success";
  onPurchase(slot: number): void | boolean;
}

export interface TttShopApi {
  registerItem(item: TttShopItem): void;
  itemById(id: string): TttShopItem | null;
  allItems(): readonly TttShopItem[];
  balanceOf(slot: number): number;
  addBalance(slot: number, amount: number, reason?: string, notify?: boolean): void;
  setBalance(slot: number, amount: number, reason?: string, notify?: boolean): void;
  tryPurchase(slot: number, itemId: string, notify?: boolean): TttPurchaseResult;
  canPurchase(slot: number, itemId: string): TttPurchaseResult;
}
```

Stock items must be registered through the same public API that third-party modules use.

Every stock item must have at least:

- `enabled`
- `price`
- `limit` when applicable
- role/team eligibility
- weapon classname when applicable
- damage, healing, radius, duration, ammo, sound, model, and color settings when applicable

Stock item families should be split into focused implementation files during import:

- `items/armor.ts`
- `items/weapons.ts`
- `items/stations.ts`
- `items/body-tools.ts`
- `items/poison.ts`
- `items/explosives.ts`
- `items/compass.ts`
- `items/tripwire.ts`

The giant legacy `shop/effects.ts` and `shop/weaponfx.ts` should not remain as public module centers.

Shop can use `@edgegamers/ttt-karma` optionally to preserve karma-scaled exploration rewards. If karma is absent, shop uses an unscaled value.

## TTT Special Rounds

Package: `@edgegamers/ttt-special-rounds`

Scope: `cs2`

Required dependencies:

- `@edgegamers/ttt-core`

Optional dependencies:

- `@edgegamers/ttt-shop`

Purpose: own special-round selection, activation, clearing, commands, and public extension API.

Public API:

```ts
export interface TttSpecialRoundDefinition {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  weight: number;
  conflicts?: readonly string[];
  requiresPlugins?: readonly string[];
  canStart?(): boolean;
  apply(): void;
  clear?(): void;
  tick?(dt: number): void;
}

export interface TttSpecialRoundsApi {
  registerRound(round: TttSpecialRoundDefinition): void;
  roundIds(): readonly string[];
  activeRounds(): readonly string[];
  isActive(id: string): boolean;
  startRounds(ids?: readonly string[]): readonly string[];
  clearRounds(): void;
}
```

Stock special rounds:

- BHop
- Low Grav
- Pistol
- Suppressed
- Vanilla
- Rich
- Speed

Configuration belongs in `@edgegamers/ttt-special-rounds`:

- Minimum rounds between specials.
- Minimum players.
- Minimum rounds after map start.
- Special chance.
- Multi-special chance.
- Per-round enabled flag.
- Per-round weight.
- Per-round settings such as low-gravity multiplier, speed timer, rich multipliers.

Special rounds that need shop behavior should use the shop API when available:

- Vanilla cancels purchases through shop purchase events.
- Rich adjusts balances through shop balance events.

If shop is absent, shop-specific special rounds must not start automatically and should report that their optional dependency is missing when forced by an admin.

## Configuration Model

Use the Source2Script configuration system rather than the legacy monolithic ConVar table.

Each plugin owns its own `s2script.config` block in `package.json`.

Naming rules:

- Core config keys use `round_*`, `role_*`, `body_*`, `voice_*`, and `visual_*`.
- Karma config keys use `karma_*`.
- Shop config keys use `credits_*`, `item_<id>_*`, and `shop_*`.
- Special-round config keys use `special_*` and `round_<id>_*`.

The first implementation may keep compatibility aliases for legacy `sm_ttt_*` ConVars only if the current Source2Script config model cannot cover a setting. New public configuration should be manifest-owned, typed, and per module.

Config should be read through lightweight snapshots refreshed on load, config change, and round boundary. Hot-path code must not read raw config repeatedly.

## Dependency Rules

Required runtime graph:

```text
@edgegamers/blackbox
└── @edgegamers/ttt-core
    ├── @edgegamers/ttt-karma
    ├── @edgegamers/ttt-shop
    └── @edgegamers/ttt-special-rounds
```

Optional graph:

```text
@edgegamers/ttt-karma -> @edgegamers/ttt-core only
@edgegamers/ttt-shop -> @edgegamers/ttt-karma optional
@edgegamers/ttt-special-rounds -> @edgegamers/ttt-shop optional
```

No module other than `ttt-core` may import TTT core source files directly. They must consume `@edgegamers/ttt-core` through its published API.

No module may import another module's private implementation files. Cross-module behavior goes through a published API and declared plugin dependency.

## Simplification Targets

Remove or avoid carrying forward:

- C#-style service naming and dependency-injection vocabulary.
- Any local runtime `.d.ts` shim that is no longer needed against the monorepo SDK version.
- The monolithic `core/cvars.ts`.
- Cross-module teardown imports. Each plugin owns its unload cleanup and subscribes to core round/map events.
- Hard-coded role enum use in public interfaces.
- Test-only admin commands from the public default surface unless they are behind root permission and clearly diagnostic.
- Repeated item-specific command handling where the shop API can handle generic buy/list/grant flows.

Keep:

- Slot-indexed state internally.
- Bounded queues for deferred frame work.
- Damage fallback logic if still needed after verifying the current SDK/runtime behavior.
- Existing crash-mitigation server settings unless newer runtime behavior proves them unnecessary.
- Existing gameplay defaults unless the user requests balancing changes later.

## Migration Strategy

Implementation should proceed in reviewable phases:

1. Add Blackbox and move the legacy TTT round log behavior into it.
2. Build `ttt-core` with stock roles, events, round lifecycle, role API, and Blackbox-backed logs.
3. Move karma into `ttt-karma` and remove core-to-karma imports.
4. Move shop and stock items into `ttt-shop`; split item implementations while preserving stock behavior.
5. Move special rounds into `ttt-special-rounds`; make shop-specific rounds use optional shop integration.
6. Update server bundle definitions and documentation.
7. Remove the temporary scratch import source and any compatibility wrapper once bundles use the modular packages.

Each phase must build and test independently before the next module is moved.

## Testing Requirements

Add unit tests for:

- Blackbox bounded channel behavior and damage coalescing.
- Core event priority, cancellation, and `ignoreCanceled` behavior.
- Role registration, stock role assignment, and role reservation.
- Role assignment with a third-party custom role definition.
- Core round win conditions using role teams rather than only stock role IDs.
- Karma scoring for stock roles.
- Karma benching through `roleAssigning`.
- Shop item registration, disabled items, limits, refunds, and role/team gates.
- Shop behavior when karma is absent.
- Special-round registration, weighted selection, conflicts, forced starts, and optional shop dependency behavior.

Run the monorepo gate before considering the import complete:

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
```

## Public Release Requirements

Public promotion is separate from the import.

Before changing any package from `private: true` to `private: false`:

- Public APIs must have `.d.ts` contracts.
- `s2script.publishes` must match package name and version.
- Runtime dependencies must be declared under `s2script.pluginDependencies` or `s2script.optionalPluginDependencies`.
- Config keys must be documented in package docs.
- A Changeset must exist for every public package affected by the promotion.
- The package must pass lint, typecheck, tests, build, license checks, and Changeset checks.

## Open Decisions Resolved

- The shared log service is named Blackbox.
- Blackbox initially matches current TTT log functionality only.
- TTT modules are real Source2Script plugins, not one plugin with runtime feature flags.
- Role extension uses string role keys and role definitions.
- Stock behavior should be preserved unless a future balancing request changes it.
