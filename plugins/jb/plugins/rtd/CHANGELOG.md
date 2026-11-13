# @edgegamers/jailbreak-rtd

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

## 1.1.8

### Patch Changes

- 6ea6d76: Rebuild against jailbreak-core 1.2.0. The last release moved their core dependency to `^1.2.0` without a version bump, so the server kept builds compiled against the old core types and refused to load them.

## 1.1.7

### Patch Changes

- 59e2c25: Dedicated Supporter perks now default to the donator tier flags, and guards priority caps can match admin flags.

## 1.1.6

### Patch Changes

- b776776: Stop the CanAcquire handlers from throwing on every pickup. `@s2script/cs2` only declares the `AcquireMethod`/`AcquireResult` enums in its types and does not export them at runtime, so Last Request, RTD and Special Days crashed with "Cannot read properties of undefined (reading 'PickUp')" and their pickup restrictions never applied. They now use the engine values directly.

## 1.1.5

### Patch Changes

- 91c2c1b: Write reserve ammo for real. One in the Chamber now holds the day weapon to exactly the bullets a player has earned in the magazine and zero reserve, re-enforced every frame, so reloads and refills can no longer add bullets. Gun Toss gives the prisoner's deagle its 7 reserve, Bullet for Bullet guns carry no reserve, and RTD ammo rewards set their reserve count.
- Updated dependencies [91c2c1b]
  - @edgegamers/jailbreak-shared@1.0.3

## 1.1.4

### Patch Changes

- 6900c80: Enforce guard queue rules through native team requests and default to three prisoners per guard.
  Account for both teams changing size when filling and trimming guards, preventing overfilled
  queues and unnecessary transfers on round end. Clear rebel model and screen tints on death and
  round end, and prevent post-round damage from reapplying red before the next round.

  Clear special-treatment green model/screen tint and no-warden blue at round boundaries.
  Expire RTD and special-day colors/transparency without requiring respawn, restoring only
  the pawns tinted by those effects.

## 1.1.3

### Patch Changes

- 6432f80: Add native English phrase coverage and recipient-localized output across chat, console, menus, HUD and disconnect wrappers. Standardize complete chat/console messages as `Feature » Message`, preserve plain UI labels and authored content, and update Hide Russian translations.
- Updated dependencies [6432f80]
  - @edgegamers/jailbreak-shared@1.0.2

## 1.1.2

### Patch Changes

- 05b5e04: Add Decluttr, an independently configurable cleanup plugin for messages, HUD, sounds, advertising and chat, with persisted default-hidden `/legs` preferences. Cooperate through optional interfaces with TTT private chat/killfeeds, Jailbreak GunGame/spy chat and MAUL managed names while preserving owner privacy and desired names. Requires s2script runtime v0.10.1 or newer.

## 1.1.1

### Patch Changes

- fef064a: Import the maintained plugins into the shared edgegamers workspace, preserve bundle membership and restricted MAUL distribution, and publish the SurfTimer core/HUD bundle under edgegamers.
- Updated dependencies [fef064a]
  - @edgegamers/jailbreak-shared@1.0.1
