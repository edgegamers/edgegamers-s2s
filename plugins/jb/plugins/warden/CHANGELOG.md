# @edgegamers/jailbreak-warden

## 1.2.0

### Minor Changes

- 0ae6976: Rename Jailbreak phrases to descriptive jailbreak.member.function keys and apply semantic chat colors. Expand the complete native palette and legacy lightblue alias before nested translation, retain clean menu/HUD text, and preserve external Gangs chat routing. Existing locale overrides must migrate their phrase keys.

### Patch Changes

- 0ae6976: Render existing Jailbreak system prefixes as `Name » message` only in chat, including translated Gangs and Spy labels. Preserve console, HUD, menu and log presentation, player markers, literal message bodies and external Gangs prefix ownership.
- 0ae6976: Move Jailbreak player chat, command replies, and displayed game metadata into editable phrase files with recipient language resolution and preserved chat colors.
- Updated dependencies [0ae6976]
- Updated dependencies [0ae6976]
- Updated dependencies [0ae6976]
  - @edgegamers/jailbreak-shared@1.1.0

## 1.1.2

### Patch Changes

- 1038ce6: Jailbreak round timelines for the CS portal. Core's `OnCellsOpened` now names the player who opened the cells (`player`, and `openCells` takes an optional `slot`, which the warden's `!open` passes), and `OnRoundEnd` says whether an admin ended the round (`adminEnded`). The portal bridge now sends the whole round: live, mode changes, cells, rebels, jihad C4s, warden terms, LR availability, LRs and last guard, special days, deaths (with whether the victim and killer were rebels at that moment), prisoner-on-guard damage, round log lines, and the roster at round start and end.

## 1.1.1

### Patch Changes

- 8380b31: `!st` now finds prisoners by their full name (names with spaces or clan tags work), matches names among living prisoners only so a dead player or guard with the same name no longer blocks it, and shows usage when given no target.

## 1.1.0

### Minor Changes

- d035e48: Peace now mutes admins too unless they use the new `!speaktoall`, dead players and spectators can talk to each other without the living hearing them, and the new `prisoner_mute_min_players` setting (off by default) keeps prisoners muted until last request on full servers.

## 1.0.5

### Patch Changes

- 59e2c25: Dedicated Supporter perks now default to the donator tier flags, and guards priority caps can match admin flags.

## 1.0.4

### Patch Changes

- Updated dependencies [91c2c1b]
  - @edgegamers/jailbreak-shared@1.0.3

## 1.0.3

### Patch Changes

- 6900c80: Enforce guard queue rules through native team requests and default to three prisoners per guard.
  Account for both teams changing size when filling and trimming guards, preventing overfilled
  queues and unnecessary transfers on round end. Clear rebel model and screen tints on death and
  round end, and prevent post-round damage from reapplying red before the next round.

  Clear special-treatment green model/screen tint and no-warden blue at round boundaries.
  Expire RTD and special-day colors/transparency without requiring respawn, restoring only
  the pawns tinted by those effects.

## 1.0.2

### Patch Changes

- 6432f80: Add native English phrase coverage and recipient-localized output across chat, console, menus, HUD and disconnect wrappers. Standardize complete chat/console messages as `Feature » Message`, preserve plain UI labels and authored content, and update Hide Russian translations.
- Updated dependencies [6432f80]
  - @edgegamers/jailbreak-shared@1.0.2

## 1.0.1

### Patch Changes

- fef064a: Import the maintained plugins into the shared edgegamers workspace, preserve bundle membership and restricted MAUL distribution, and publish the SurfTimer core/HUD bundle under edgegamers.
- Updated dependencies [fef064a]
  - @edgegamers/jailbreak-shared@1.0.1
