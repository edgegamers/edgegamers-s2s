# @edgegamers/jailbreak-lastrequest

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

- 60c0ded: Require at least 4 guards alive at round start before last guard can trigger (`lg_min_cts` default raised from 2 to 4).

## 1.1.1

### Patch Changes

- 6d34dad: Shot for Shot and Mag for Mag participants can no longer drop their weapon for the whole last request.

## 1.1.0

### Minor Changes

- 0d9f63d: Gun Toss is limited to Dedicated Supporters of tier 3 and up by default (`lr_gun_toss_min_tier`, 0 = everyone; tier flags set by `lr_donator_tier_flags`).

## 1.0.5

### Patch Changes

- b776776: Stop the CanAcquire handlers from throwing on every pickup. `@s2script/cs2` only declares the `AcquireMethod`/`AcquireResult` enums in its types and does not export them at runtime, so Last Request, RTD and Special Days crashed with "Cannot read properties of undefined (reading 'PickUp')" and their pickup restrictions never applied. They now use the engine values directly.

## 1.0.4

### Patch Changes

- c3a884b: Shot for Shot and Mag for Mag no longer slay the shooter for "cheating" after their own shot. The turn now passes once the shooter's magazine reads empty instead of on the fire event, an out-of-turn fire only counts as cheating when that gun actually holds ammo, and the waiting player's gun is kept empty so only one player holds a bullet at a time.

## 1.0.3

### Patch Changes

- 91c2c1b: Write reserve ammo for real. One in the Chamber now holds the day weapon to exactly the bullets a player has earned in the magazine and zero reserve, re-enforced every frame, so reloads and refills can no longer add bullets. Gun Toss gives the prisoner's deagle its 7 reserve, Bullet for Bullet guns carry no reserve, and RTD ammo rewards set their reserve count.
- Updated dependencies [91c2c1b]
  - @edgegamers/jailbreak-shared@1.0.3

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
