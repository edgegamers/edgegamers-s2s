# TTT Core Runtime Parity

`@edgegamers/ttt-core` currently publishes a logical TTT runtime on top of the
Source2Script SDK. It does not yet control enough of the CS2 world to claim
that every logical transition has restarted, respawned, moved, armed, or
visually updated a player in the engine.

## Safe downstream assumptions

- `startRound()` is an explicit request. Core never starts a round merely
  because enough clients are connected.
- A successful start enters `countdown`. The configured `round_countdown`
  elapses before Core commits `in_progress` and assigns roles.
- `gameStateChanging` is the cancelable pre-transition event. `gameState` is
  emitted only after the transition and its related Core state are committed.
  Its winner and reason match `gameState()` at notification time.
- `quiet` is forwarded on countdown/live notifications so presentation
  modules can suppress start announcements. Core itself has no broadcast UI.
- `endRound(..., reason)` persists the reason in the game-state snapshot and
  committed notification.
- `renderLogs(slot)` currently returns the same administrator-facing render
  for every slot. The slot parameter is reserved for a future permission-aware
  renderer; callers must enforce access before invoking it.
- Role keys are strings. `roleDefinition()`, `roleDefinitions()`,
  `startingLoadout()`, and `loadoutOf()` return defensive snapshots safe for
  downstream reads.
- Automatic role candidates are shuffled. When two roles share an
  `assignmentOrder` and both have quota remaining, positive `weight` values
  determine their relative selection probability. Omitted weight is `1`;
  non-positive or non-finite weight disables automatic selection for that
  role, while a valid reservation can still consume its quota.

## Engine parity matrix

| Operation | Current behavior | Unavailable engine effect / fallback | Affected surface |
| --- | --- | --- | --- |
| Round start | Explicit API/admin start commits `countdown`, then logical `in_progress` after the configured timer. | Core does not issue an engine round restart, force respawns, or wait for a matching engine round identity. There is no connection-count auto-start. | `round_countdown`, `round_min_players`, `startRound`, `gameStateChanging`, `gameState` |
| Player life | Spawn and death events update the observed alive flag. A role assignment never changes a dead/unobserved player to alive. | Core cannot query authoritative pawn life for clients seeded after plugin load until a spawn/death event is observed. | `player`, `activePlayers`, `isAlive`, death handling |
| Participation and teams | Core assigns logical roles and participation flags. | Core does not move players to CS2 teams or guarantee that engine team state matches `teamOfRole`. | `roleAssigned`, `roleOf`, `teamOfRole`, player snapshots |
| Starting health and armor | Core resolves stock config or custom-role metadata and records the intended per-player loadout in its inventory boundary. `startingLoadout()` exposes role defaults and `loadoutOf()` exposes the assigned intent. | The shipped adapter does not mutate pawn health or armor because the current package has no supported pawn mutation integration. | `role_*_health`, `role_*_armor`, `startingHealth`, `startingArmor` |
| Starting weapons | Core resolves stock config or custom `startingWeapons` and records them in the same intended-loadout boundary. | The shipped adapter does not strip or grant CS2 weapons. Downstream code must not infer delivery from `roleAssigned` or `loadoutOf`. | `role_*_weapons`, `role_strip_on_assign`, `startingWeapons` |
| Public role presentation | `publicRole` is retained in public role-definition snapshots. | Core has no role reveal UI or visibility engine; presentation modules decide how to use the flag. | `publicRole`, `roleDefinition`, `roleDefinitions` |
| Bodies | Deaths create logical body snapshots. `identifyBody(ownerSlot, identifier)` is a transactional, testable API path that emits `bodyIdentify` and records a `body_identify` Blackbox entry on success. | Core does not spawn ragdoll entities, trace player use, hide pawns, settle props, or support physical body pickup. | `body_*`, `bodyCreate`, `bodyIdentify`, `body`, `identifyBody` |
| Damage cancellation | Core publishes damage/death observations and maintains logical death state. | The current event path does not provide a pre-damage engine hook, so canceling `damage` cannot prevent physical CS2 damage. | `damage`, `death` |
| Visuals and interaction | Configuration is parsed and retained. | Name display, role icons, and prop pickup have no engine implementation in Core yet. | `visual_show_names`, `visual_role_icons`, `body_prop_pickup` |
| Round deadline | `setRoundDeadline()` and duration config drive the logical timeout and committed innocent win. | Core does not update an engine timer or terminate an engine round. | `round_duration_*`, `setRoundDeadline`, `gameState` |

Downstream modules may consume committed Core events, logical role/team state,
definition/loadout metadata, and Blackbox logs. They must not treat those
surfaces as proof that a corresponding CS2 pawn or entity mutation occurred.
