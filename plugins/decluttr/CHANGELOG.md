# @edgegamers/decluttr

## 0.3.0

### Minor Changes

- 0ae6976: Rename translation keys to owner.feature.function and apply the legacy semantic color palette. ExtraCommands uses a blue activity prefix and dark-red executor names. Decluttr preserves its legacy chat layout and styled markers. Existing translation override files must migrate their keys.

### Patch Changes

- 0ae6976: Match public, team, dead and spectator chat to the legacy MAUL layout with translated skull and colored team markers. Preserve combined dead/team status, permission prefixes and custom templates; recognize older stock configuration templates.
- 0ae6976: Move remaining standalone plugin chat wrappers, default formats and command replies into editable translation phrases. Resolve broadcasts per recipient while preserving authored chat, map text, colors and routing.

## 0.2.1

### Patch Changes

- c98db43: Reapply hidden leg preferences after round starts and respawns reset the player's render alpha, without requiring another /legs toggle. Preserve visible preferences, player colors and other plugins' transparency effects.

## 0.2.0

### Minor Changes

- 05b5e04: Add Decluttr, an independently configurable cleanup plugin for messages, HUD, sounds, advertising and chat, with persisted default-hidden `/legs` preferences. Cooperate through optional interfaces with TTT private chat/killfeeds, Jailbreak GunGame/spy chat and MAUL managed names while preserving owner privacy and desired names. Requires s2script runtime v0.10.1 or newer.
