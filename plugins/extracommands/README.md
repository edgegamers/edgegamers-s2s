# ExtraCommands

Extra player administration and fun commands for CS2, with native admin menu integration. Package: `@edgegamers/extracommands`.

Extracted from [s2script/s2script#327](https://github.com/s2script/s2script/pull/327). Work is tracked in [edgegamers/edgegamers-s2s#20](https://github.com/edgegamers/edgegamers-s2s/issues/20).

## Build and install

Use the root workspace's Node 24/npm 11 dependencies and published SDK 0.37.0/CS2 types 0.22.0. The server runtime must support the SDK 0.37 admin activity API:

```bash
npm ci
npm run build -- --filter '@edgegamers/extracommands'
npm test --workspace @edgegamers/extracommands
```

Install `dist/_edgegamers_extracommands.s2sp` using the normal s2script plugin workflow. After registry publication, `s2s install @edgegamers/extracommands` installs the released package. This change does not publish or deploy it.

Keep stock `playercommands`, `funcommands` and `basetriggers` installed as desired. ExtraCommands owns only the additions from #327: it does not register slap, slay, rename, gravity, noclip, freeze, unfreeze or blind. Do not also install builds containing #327's original additions; duplicate command owners conflict. The separate stock timed-freeze correction is preserved under `upstream/` for upstream adoption.

## Commands

Targets use native player targeting, including names, `#userid` and target groups. Admin actions filter higher-immunity targets. Read-only teleport destinations do not filter immunity. Commands work from chat (`!health`, `/health`), a player's console or the server console unless marked player-only.

| Command | Arguments | Permission |
| --- | --- | --- |
| `sm_health`, `sm_hp` | `<target> <health:1..1000000>` | SLAY |
| `sm_armor` | `<target> <armor:0..250>` | SLAY |
| `sm_give` | `<target> <item>` | CHEATS |
| `sm_equip` | `<target> <item>` | CHEATS |
| `sm_disarm`, `sm_strip` | `<target>` | SLAY |
| `sm_respawn` | `<target>` | SLAY |
| `sm_1up`, `sm_oneup` | `<target>` | SLAY |
| `sm_team` | `<target> <spec\|t\|ct\|1\|2\|3>` | KICK |
| `sm_spec`, `sm_swap` | `<target>` | KICK |
| `sm_saveloc` | none; player-only | CHEATS |
| `sm_tp`, `sm_teleport` | `<target> [destination player]` | SLAY |
| `sm_god` | `<target> [-1\|0\|1]` (disable/toggle/enable; default toggle) | CHEATS |
| `sm_speed` | `<target> <multiplier:0.01..10>` | SLAY |
| `sm_size`, `sm_scale` | `<target> [scale:0.2..4]` (default 1) | SLAY |
| `sm_unblind` | `<target>` | SLAY |
| `sm_drug` | `<target> [seconds]` (0/default = until undrug) | SLAY |
| `sm_undrug`, `sm_beacon` | `<target>` | SLAY |
| `sm_kill` | none; player-only, self only | Public |

Item names accept `CsItem` enum names, class names (`weapon_ak47`) or unprefixed aliases (`ak47`). Equip creates the new item first and replaces only its gear slot; a failed creation leaves existing inventory alone. Oneup respawns a dead player and moves the new pawn to the captured death position on the next frame. Teleport without a destination uses the caller's saved location on this map. Swap exchanges T/CT; spectators remain spectators.

Successful admin actions announce through the same native `Activity.showT` API as the stock admin plugins, respecting `sm_show_activity` and each recipient's language. The caller receives one success copy on their original reply channel. Failed actions and usage errors remain private; saving a location and public self-kill keep their private replies. Delayed oneup announces after its teleport succeeds. Each successful action also writes an activity log entry.

## Menus

With stock `adminmenu` loaded, `sm_admin` shows player actions under **Player Commands** and effects under **Fun Commands**. Actions use native target and option menus, including common numeric/item presets and saved-location/player teleport destinations. Text commands retain the full validated ranges and all SDK item names. Native command dispatch checks permissions and overrides again at execution, and handlers recheck immunity.

Public `sm_menu` includes **Kill yourself**, with confirmation. Menu callbacks are bound to the original caller, target connection, selected living pawn and map. Replaced menus, disconnects, map changes and unload cancel pending selections.

## Translations

English is embedded in the archive; no loose files are required. Operator overrides use `addons/s2script/translations/extracommands.phrases.json`; locale overrides use `translations/<language-code>/extracommands.phrases.json`. Partial locales fall back to English per key. Replies follow the caller's language and chat/console destination. Follow-up menus resolve titles/options per recipient; the published SDK's static topmenu item/tab labels use the server language at startup. Player names and numbers remain literal labels.

Edit `translations/extracommands.phrases.json` to revise the embedded English, then rebuild. Keys use `extracommands.feature.function`, for example `extracommands.beacon.toggle_for_players`. Functions ending in `_activity` are action fragments: the runtime adds the editable `extracommands.chat.activity_prefix` and actor's display name. The prefix leaves the actor dark red, while each action phrase supplies its own semantic colors. Keep positional placeholders such as `{1}` and `{2}` intact. Existing translation overrides must migrate their old keys to the dotted names.

## Verification and live acceptance

Retained tests execute the real bundled plugin with only engine operations replaced. They cover argument validation, permissions/targeting, safe inventory replacement, delayed respawns/teleports, effect rollback and cleanup, menu dispatch, stale connections/lives/maps, locale fallback and reply routing. Native builds run the SDK type and safety checks.

Before server rollout, verify with real clients: menu navigation and cancellation, permission overrides/immunity, give/equip loadouts, dead/pawnless team and respawn actions, teleport/oneup, speed multipliers (including values above 1 and weapon switches), model scaling, fade/roll recovery, beacon visibility, and death/disconnect/map/reload cleanup. Unit tests and archive checks do not establish live engine acceptance.
