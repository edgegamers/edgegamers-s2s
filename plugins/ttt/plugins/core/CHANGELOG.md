# @edgegamers/ttt-core

## 2.0.9

### Patch Changes

- 4c49538: Traitors can use admin chat again. A team-chat message starting with `@` is no longer captured as traitor chat, so it reaches the admin channel like it does for everyone else. Traitor chat is still `@` in all chat.

  Dead players can also use bare chat commands like `rtv` and `nominate` again. The line still stays private in dead chat, and when it is a single word naming a registered command, TTT runs that command for the player as `!rtv` would.

## 2.0.8

### Patch Changes

- 6432f80: Add native English phrase coverage and recipient-localized output across chat, console, menus, HUD and disconnect wrappers. Standardize complete chat/console messages as `Feature » Message`, preserve plain UI labels and authored content, and update Hide Russian translations.
- Updated dependencies [6432f80]
  - @edgegamers/ttt-contracts@1.0.3

## 2.0.7

### Patch Changes

- 05b5e04: Add Decluttr, an independently configurable cleanup plugin for messages, HUD, sounds, advertising and chat, with persisted default-hidden `/legs` preferences. Cooperate through optional interfaces with TTT private chat/killfeeds, Jailbreak GunGame/spy chat and MAUL managed names while preserving owner privacy and desired names. Requires s2script runtime v0.10.1 or newer.
- Updated dependencies [05b5e04]
  - @edgegamers/ttt-contracts@1.0.2

## 2.0.6

### Patch Changes

- fef064a: Import the maintained plugins into the shared edgegamers workspace, preserve bundle membership and restricted MAUL distribution, and publish the SurfTimer core/HUD bundle under edgegamers.
- Updated dependencies [fef064a]
  - @edgegamers/ttt-contracts@1.0.1
