# @edgegamers/s2s-maul

## 0.4.0

### Minor Changes

- 0ae6976: Rename translation keys to owner.feature.function and apply the shared semantic chat colors. Migrate operator phrase overrides to the new keys, including Hide's Russian locale. Preserve per-recipient translations, literal custom prefixes, staff-chat audiences and plain console/menu output.

### Patch Changes

- ce7ad4d: Restore legacy dark-blue parenthesized leadership chat, including separate sender/recipient views, native user IDs for incoming leadership messages and private-message and broadcast wrappers. Retain the dotted phrase keys and existing chat audiences; keep the leadership label editable and player-authored bodies literal.
- 0ae6976: Use arrow separators for existing system chat prefixes while preserving console output, translated labels, configured prefixes and literal message text.
- 0ae6976: Move remaining standalone plugin chat wrappers, default formats and command replies into editable translation phrases. Resolve broadcasts per recipient while preserving authored chat, map text, colors and routing.

## 0.3.0

### Minor Changes

- 8997a85: Publish an `@edgegamers/s2s-maul` contract: `getDsTier(steamId)` (0 none, 1 Silver to 4 Royal), `isVerified(steamId)` and an `OnDsTierChanged` forward, all read from the profile MAUL already caches on connect.

## 0.2.1

### Patch Changes

- 2c703d2: Route non-leaders' `%` messages to leadership from all and team chat, with a sender echo. Support leaders' `%%target message` private messages in both channels, checking the private alias before the single-prefix route as in s2script basechat PR #359. Preserve leaders' existing `%` audiences and Dedicated Supporter chat behavior.

## 0.2.0

### Minor Changes

- adb5046: Add Dedicated Supporter (`$`) and leadership (`%`) chat.

## 0.1.5

### Patch Changes

- 4d3e62a: Render all SDK chat color tags in MAUL phrase overrides, including green and white, while preserving authored supporter message bodies. Decouple behavior tests from editable catalogs and presentation choices.
- e34c762: Match old Colors of DS Join Message

## 0.1.4

### Patch Changes

- 6432f80: Add native English phrase coverage and recipient-localized output across chat, console, menus, HUD and disconnect wrappers. Standardize complete chat/console messages as `Feature » Message`, preserve plain UI labels and authored content, and update Hide Russian translations.

## 0.1.3

### Patch Changes

- 05b5e04: Add Decluttr, an independently configurable cleanup plugin for messages, HUD, sounds, advertising and chat, with persisted default-hidden `/legs` preferences. Cooperate through optional interfaces with TTT private chat/killfeeds, Jailbreak GunGame/spy chat and MAUL managed names while preserving owner privacy and desired names. Requires s2script runtime v0.10.1 or newer.

## 0.1.2

### Patch Changes

- fef064a: Import the maintained plugins into the shared edgegamers workspace, preserve bundle membership and restricted MAUL distribution, and publish the SurfTimer core/HUD bundle under edgegamers.
