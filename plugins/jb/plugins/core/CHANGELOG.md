# @edgegamers/jailbreak-core

## 1.2.0

### Minor Changes

- a29229c: Random round-start jihad C4: add `c4_chance` (percent chance it is given at all) and `c4_min_cts` (guards alive needed, default 4).
- 1038ce6: Jailbreak round timelines for the CS portal. Core's `OnCellsOpened` now names the player who opened the cells (`player`, and `openCells` takes an optional `slot`, which the warden's `!open` passes), and `OnRoundEnd` says whether an admin ended the round (`adminEnded`). The portal bridge now sends the whole round: live, mode changes, cells, rebels, jihad C4s, warden terms, LR availability, LRs and last guard, special days, deaths (with whether the victim and killer were rebels at that moment), prisoner-on-guard damage, round log lines, and the roster at round start and end.

## 1.1.6

### Patch Changes

- 18da8c9: When the cells fail to open, the round log now says why: no matching button (with the map's func_buttons listed), only a weak name match, or the game refusing the Press input.

## 1.1.5

### Patch Changes

- 5385343: Give a knife to any prisoner or guard who spawns without one. Respawned players and cell spawns on some maps could come up empty-handed because the engine's default loadout was the only source of the spawn knife. Special days and last requests still control their own loadouts.

## 1.1.4

### Patch Changes

- Updated dependencies [91c2c1b]
  - @edgegamers/jailbreak-shared@1.0.3

## 1.1.3

### Patch Changes

- 6900c80: Enforce guard queue rules through native team requests and default to three prisoners per guard.
  Account for both teams changing size when filling and trimming guards, preventing overfilled
  queues and unnecessary transfers on round end. Clear rebel model and screen tints on death and
  round end, and prevent post-round damage from reapplying red before the next round.

  Clear special-treatment green model/screen tint and no-warden blue at round boundaries.
  Expire RTD and special-day colors/transparency without requiring respawn, restoring only
  the pawns tinted by those effects.

## 1.1.2

### Patch Changes

- 6432f80: Add native English phrase coverage and recipient-localized output across chat, console, menus, HUD and disconnect wrappers. Standardize complete chat/console messages as `Feature » Message`, preserve plain UI labels and authored content, and update Hide Russian translations.
- Updated dependencies [6432f80]
  - @edgegamers/jailbreak-shared@1.0.2

## 1.1.1

### Patch Changes

- fef064a: Import the maintained plugins into the shared edgegamers workspace, preserve bundle membership and restricted MAUL distribution, and publish the SurfTimer core/HUD bundle under edgegamers.
- Updated dependencies [fef064a]
  - @edgegamers/jailbreak-shared@1.0.1
