# @edgegamers/ttt-items

## 2.0.10

### Patch Changes

- dabeb67: Republish TTT under a fresh version. `@edgegamers/ttt@2.0.9` was already taken on the registry with different members, so this release moves the bundle and its changed members past it. No gameplay change.

## 2.0.9

### Patch Changes

- 1a38d41: Fix the Silent AWP being audible to other players: the fire-bullets hook read `weapon_id` (an entity handle in CS2) instead of `item_def_index`, so the shot was never suppressed. The shooter is now resolved from the message's pawn handle, so crouched or moving shots are also silenced. This also restores pistol silencing for the Suppressed round and Poison Shots.

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
