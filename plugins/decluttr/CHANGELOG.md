# @edgegamers/decluttr

## 0.2.1

### Patch Changes

- c98db43: Reapply hidden leg preferences after round starts and respawns reset the player's render alpha, without requiring another /legs toggle. Preserve visible preferences, player colors and other plugins' transparency effects.

## 0.2.0

### Minor Changes

- 05b5e04: Add Decluttr, an independently configurable cleanup plugin for messages, HUD, sounds, advertising and chat, with persisted default-hidden `/legs` preferences. Cooperate through optional interfaces with TTT private chat/killfeeds, Jailbreak GunGame/spy chat and MAUL managed names while preserving owner privacy and desired names. Requires s2script runtime v0.10.1 or newer.
