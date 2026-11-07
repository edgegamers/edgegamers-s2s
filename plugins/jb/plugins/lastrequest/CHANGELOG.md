# @edgegamers/jailbreak-lastrequest

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
