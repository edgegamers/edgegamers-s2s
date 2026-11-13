# @edgegamers/jailbreak-gangperks

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

## 1.1.4

### Patch Changes

- 6ea6d76: Rebuild against jailbreak-core 1.2.0. The last release moved their core dependency to `^1.2.0` without a version bump, so the server kept builds compiled against the old core types and refused to load them.

## 1.1.3

### Patch Changes

- Updated dependencies [91c2c1b]
  - @edgegamers/jailbreak-shared@1.0.3

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
