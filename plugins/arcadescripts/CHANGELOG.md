# @edgegamers/s2s-arcadescripts

## 0.2.0

### Minor Changes

- 0ae6976: Rename translation keys to owner.feature.function and apply the shared semantic chat colors. Migrate operator phrase overrides to the new keys, including Hide's Russian locale. Preserve per-recipient translations, literal custom prefixes, staff-chat audiences and plain console/menu output.

### Patch Changes

- 0ae6976: Move remaining standalone plugin chat wrappers, default formats and command replies into editable translation phrases. Resolve broadcasts per recipient while preserving authored chat, map text, colors and routing.

## 0.1.0

### Minor Changes

- 7691cfa: Add ArcadeScripts, an s2script port of supergosciu/ArcadeScripts-CSS. On jb_arcade_b6 it replaces the map's 29 VScript logic_scripts (Bee, Blob, Colors, Light Duel, Rogue, Tapper, Surf, Decathlon, the secret items and the rest) with TypeScript ports and answers the map's RunScriptCode inputs, so the arcade minigames work again on CS2.
