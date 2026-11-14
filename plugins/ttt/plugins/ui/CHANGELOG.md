# @edgegamers/ttt-ui

## 2.0.11

### Patch Changes

- acd0560: Restore the TTT fixes from the upstream 2.0.1–2.0.9 releases that the original import missed, so publishing from this repository no longer undoes them:

  - Kills no longer show as skulls under the killer's avatar on the top bar while the death is hidden.
  - A respawned player is visible again, and Traitors keep their traitor-room tag while staged.
  - The round-start RDM slay actually kills the player.
  - `!report` only accepts the player who killed you, within `rdm.reportWindowSeconds` (default 60).
  - Admin commands take SourceMod targets (`#userid`, names, `@all`, `@me`) and respect immunity; rulings against a higher-immunity admin are refused.
  - New `sm_rdm_convictions`, `sm_rdm_overturn <#>` and `sm_rdm_pardon <target|SteamID64>` undo RDM punishments given in error.
  - Bodies select the corpse you aim at, and `+inspect` identifies bodies.

- Updated dependencies [acd0560]
  - @edgegamers/ttt-contracts@1.2.0

## 2.0.10

### Patch Changes

- f773a42: Rebuild Bodies and UI against Core 2.2.0. Their 2.0.9 versions were already on the registry from an older build, so the last release skipped them and the server refused them for contract drift. No gameplay change.

## 2.0.9

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
