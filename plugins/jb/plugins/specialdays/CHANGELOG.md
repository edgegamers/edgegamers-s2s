# @edgegamers/jailbreak-specialdays

## 1.0.6

### Patch Changes

- b776776: Stop the CanAcquire handlers from throwing on every pickup. `@s2script/cs2` only declares the `AcquireMethod`/`AcquireResult` enums in its types and does not export them at runtime, so Last Request, RTD and Special Days crashed with "Cannot read properties of undefined (reading 'PickUp')" and their pickup restrictions never applied. They now use the engine values directly.
- 340eec9: Special days with a weapon list (HE Only, One in the Chamber, Speedrunners, No Scope, Hide and Seek, Infection, Gun Game) now really hold players to it. The pickup gate also covers walking over guns on the ground (map-placed and dropped weapons), it is armed from the moment the day is picked instead of only once it begins, and players are only handed a knife when the day's list allows one, so HE Only is grenades only. Bayonets are no longer let through on lists without a knife.

## 1.0.5

### Patch Changes

- 91c2c1b: Write reserve ammo for real. One in the Chamber now holds the day weapon to exactly the bullets a player has earned in the magazine and zero reserve, re-enforced every frame, so reloads and refills can no longer add bullets. Gun Toss gives the prisoner's deagle its 7 reserve, Bullet for Bullet guns carry no reserve, and RTD ammo rewards set their reserve count.
- Updated dependencies [91c2c1b]
  - @edgegamers/jailbreak-shared@1.0.3

## 1.0.4

### Patch Changes

- 6900c80: Enforce guard queue rules through native team requests and default to three prisoners per guard.
  Account for both teams changing size when filling and trimming guards, preventing overfilled
  queues and unnecessary transfers on round end. Clear rebel model and screen tints on death and
  round end, and prevent post-round damage from reapplying red before the next round.

  Clear special-treatment green model/screen tint and no-warden blue at round boundaries.
  Expire RTD and special-day colors/transparency without requiring respawn, restoring only
  the pawns tinted by those effects.

## 1.0.3

### Patch Changes

- 6432f80: Add native English phrase coverage and recipient-localized output across chat, console, menus, HUD and disconnect wrappers. Standardize complete chat/console messages as `Feature » Message`, preserve plain UI labels and authored content, and update Hide Russian translations.
- Updated dependencies [6432f80]
  - @edgegamers/jailbreak-shared@1.0.2

## 1.0.2

### Patch Changes

- 05b5e04: Add Decluttr, an independently configurable cleanup plugin for messages, HUD, sounds, advertising and chat, with persisted default-hidden `/legs` preferences. Cooperate through optional interfaces with TTT private chat/killfeeds, Jailbreak GunGame/spy chat and MAUL managed names while preserving owner privacy and desired names. Requires s2script runtime v0.10.1 or newer.

## 1.0.1

### Patch Changes

- fef064a: Import the maintained plugins into the shared edgegamers workspace, preserve bundle membership and restricted MAUL distribution, and publish the SurfTimer core/HUD bundle under edgegamers.
- Updated dependencies [fef064a]
  - @edgegamers/jailbreak-shared@1.0.1
