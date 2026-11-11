# @edgegamers/ttt-shop

## 2.1.0

### Minor Changes

- c5734f5: TTT stats reach the CS portal. Core's `OnRoundEnd` now carries the round's action log (`log`, one line per entry as `!logs` shows it), and Shop publishes `OnBalanceChanged` for each committed credit change. The portal bridge sends TTT round start and end (roster, winner, credits earned, playtime, log), kills, bodies found, purchases and special rounds.
- b9a7b67: Publish stats forwards so another plugin can observe a TTT round. Core sends `OnRoundStart`, `OnRoundEnd` (winner, reason, duration, roster), `OnRoleAssigned`, `OnPlayerKilled` (both roles, weapon, and whether the kill was correct for the killer's role) and `OnBodyFound`. Shop sends `OnPurchase` for delivered purchases, Karma sends `OnKarmaChanged` for committed writes, and Special sends `OnSpecialRoundStarted`. Payloads are copied, with SteamIDs as decimal strings, and every round-scoped event carries Core's round identity. Gameplay is unchanged with or without a listener.

## 2.0.8

### Patch Changes

- 6432f80: Add native English phrase coverage and recipient-localized output across chat, console, menus, HUD and disconnect wrappers. Standardize complete chat/console messages as `Feature » Message`, preserve plain UI labels and authored content, and update Hide Russian translations.
- Updated dependencies [6432f80]
  - @edgegamers/ttt-contracts@1.0.3

## 2.0.7

### Patch Changes

- Updated dependencies [05b5e04]
  - @edgegamers/ttt-contracts@1.0.2

## 2.0.6

### Patch Changes

- fef064a: Import the maintained plugins into the shared edgegamers workspace, preserve bundle membership and restricted MAUL distribution, and publish the SurfTimer core/HUD bundle under edgegamers.
- Updated dependencies [fef064a]
  - @edgegamers/ttt-contracts@1.0.1
