# @edgegamers/ttt-reports

## 2.1.0

### Minor Changes

- 0ae6976: Rename TTT phrases to descriptive `ttt.feature.function` keys and apply semantic chat colors, including consistent role colors. Keep nested localized phrases colored while stripping chat controls from console, Panorama and HUD text. Existing translation overrides must migrate their keys to the new names.

### Patch Changes

- Updated dependencies [0ae6976]
- Updated dependencies [0ae6976]
  - @edgegamers/ttt-contracts@1.1.0

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
