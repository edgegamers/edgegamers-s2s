# @edgegamers/extracommands

## 0.2.0

### Minor Changes

- 0ae6976: Announce successful admin commands and menu actions with translated native activity feedback, respecting sm_show_activity, caller reply routing, and connection identity. Keep failed actions private and announce oneup only after teleport success. Requires the SDK 0.37 admin activity runtime.
- 0ae6976: Rename translation keys to owner.feature.function and apply the legacy semantic color palette. ExtraCommands uses a blue activity prefix and dark-red executor names. Decluttr preserves its legacy chat layout and styled markers. Existing translation override files must migrate their keys.

## 0.1.0

### Minor Changes

- 0aa8aee: Introduce the standalone ExtraCommands plugin with player administration, inventory, teleport and fun commands, public self-kill, and native admin menu integration. Preserve command permissions, immunity filtering, translated replies and connection/map-safe effect cleanup.
