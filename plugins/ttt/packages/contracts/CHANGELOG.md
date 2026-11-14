# @edgegamers/ttt-contracts

## 1.2.0

### Minor Changes

- acd0560: Restore the TTT fixes from the upstream 2.0.1–2.0.9 releases that the original import missed, so publishing from this repository no longer undoes them:

  - Kills no longer show as skulls under the killer's avatar on the top bar while the death is hidden.
  - A respawned player is visible again, and Traitors keep their traitor-room tag while staged.
  - The round-start RDM slay actually kills the player.
  - `!report` only accepts the player who killed you, within `rdm.reportWindowSeconds` (default 60).
  - Admin commands take SourceMod targets (`#userid`, names, `@all`, `@me`) and respect immunity; rulings against a higher-immunity admin are refused.
  - New `sm_rdm_convictions`, `sm_rdm_overturn <#>` and `sm_rdm_pardon <target|SteamID64>` undo RDM punishments given in error.
  - Bodies select the corpse you aim at, and `+inspect` identifies bodies.

## 1.1.0

### Minor Changes

- 0ae6976: Rename TTT phrases to descriptive `ttt.feature.function` keys and apply semantic chat colors, including consistent role colors. Keep nested localized phrases colored while stripping chat controls from console, Panorama and HUD text. Existing translation overrides must migrate their keys to the new names.

### Patch Changes

- 0ae6976: Declare grey arrow separators directly in TTT, SHOP and DNA chat phrase templates, and use arrows for private fallback channel prefixes in chat. Color the TTT header's letters dark red, red and light red. Select presentation at each output destination, preserving shared console, HUD, menu, Panorama and log formats, translated prefix names and literal player text. Existing locale overrides using the former pipe separator still render with arrows in chat.

## 1.0.3

### Patch Changes

- 6432f80: Add native English phrase coverage and recipient-localized output across chat, console, menus, HUD and disconnect wrappers. Standardize complete chat/console messages as `Feature » Message`, preserve plain UI labels and authored content, and update Hide Russian translations.

## 1.0.2

### Patch Changes

- 05b5e04: Add Decluttr, an independently configurable cleanup plugin for messages, HUD, sounds, advertising and chat, with persisted default-hidden `/legs` preferences. Cooperate through optional interfaces with TTT private chat/killfeeds, Jailbreak GunGame/spy chat and MAUL managed names while preserving owner privacy and desired names. Requires s2script runtime v0.10.1 or newer.

## 1.0.1

### Patch Changes

- fef064a: Import the maintained plugins into the shared edgegamers workspace, preserve bundle membership and restricted MAUL distribution, and publish the SurfTimer core/HUD bundle under edgegamers.
