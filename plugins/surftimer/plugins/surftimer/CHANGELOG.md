# @edgegamers/surftimer-core

## 0.2.0

### Minor Changes

- 0ae6976: Rename translation keys to owner.feature.function and apply the shared semantic chat colors. Migrate operator phrase overrides to the new keys, including Hide's Russian locale. Preserve per-recipient translations, literal custom prefixes, staff-chat audiences and plain console/menu output.

### Patch Changes

- 0ae6976: Make SurfTimer and remaining TTT chat messages editable through translation phrases. Resolve broadcasts, nested role and track names, shop reasons and command replies for their recipients while retaining the existing English text and colors.
- 0ae6976: Use arrow separators for existing system chat prefixes while preserving console output, translated labels, configured prefixes and literal message text.

## 0.1.2

### Patch Changes

- 6432f80: Add native English phrase coverage and recipient-localized output across chat, console, menus, HUD and disconnect wrappers. Standardize complete chat/console messages as `Feature » Message`, preserve plain UI labels and authored content, and update Hide Russian translations.

## 0.1.1

### Patch Changes

- fef064a: Import the maintained plugins into the shared edgegamers workspace, preserve bundle membership and restricted MAUL distribution, and publish the SurfTimer core/HUD bundle under edgegamers.
- Updated dependencies [fef064a]
  - @edgegamers/surftimer-shared@0.1.1
