# Decluttr

Optional CS2 message, HUD, sound and chat cleanup. Every feature starts disabled and can be configured independently. Only `/legs` is a player toggle.

Requires **s2script runtime v0.10.1 or newer** (including PR 330's repeated-string reads and integer usermessage edits). Built with SDK 0.35.0.

## Setup

Build from the repository root with `npm ci` and `npm run build`. The native archive is `plugins/decluttr/dist/_edgegamers_decluttr.s2sp`; install it using the normal s2script plugin workflow. No other edgegamers plugin is required.

On first load Decluttr creates `Decluttr.json` in its native config directory. [Decluttr.example.json](Decluttr.example.json) contains every setting with its default. Partial objects inherit defaults; unknown settings and malformed values are rejected.

Edit the file and run `sm_decluttr_reload` in the server console or `/decluttr_reload` in chat. Reload requires `reloadFlags` (default `z`, root); console always has access. Invalid configuration retains the working settings. Flag strings use SourceMod letters `a`–`t` and `z`, with all specified flags required and root satisfying every flag.

## Controls

| Original feature | Configuration | Behavior |
| --- | --- | --- |
| M1–M3 radio | `radio.players`, `.bots`, `.grenades`, `.wheel` | Independent human/bot radio, grenade callouts and chatwheel suppression. |
| M4 pings | `radio.pings` | `off`, `all` (command/marker/audio), or `sound` (retain marker). |
| M5 map chat | `messages.map` | `enabled`, `mode: all/filter`, and `rules: [{map, words}]`. Exact map wins, then longest prefix ending `_`, then `ANY`; words match case-insensitive substrings. |
| M6 joins | `messages.teamJoin` | Suppress stock team-join announcements. |
| M7 disconnects | `messages.disconnect` | `off`, `text`, or `all` (also disconnect-specific death icon). |
| M8 notices | `messages.money`, `.teamAttack`, `.saved`, `.chicken` | Independent money awards, team-damage warnings, saved-you and chicken notifications. |
| M9 bomb | `messages.bombPlanted`, `.planting`, `.defusing` | Planted HUD/audio, planting callouts and defusing callouts. |
| M10 custom notices | `messages.custom` | `enabled` plus exact text tokens in `text`, `hint`, `radio`. Repeated parameters are all inspected. |
| W8 radar | `hud.radar` | Hide radar. |
| W9 killfeed | `hud.killfeed` | `off`, `all`, or `self` (attacker sees their own kills). Intersect game-mode audiences. |
| W10 teammate tags | `hud.teamTags` | `mode: off/all/walls/distance`; `distance` sets the native overhead distance limit. |
| W11 legs | `hud.legs` | Enable `/legs`. Unset preferences start hidden; clientprefs retains each choice across maps and reconnects. |
| S1 music | `sounds.music` | `off`, `mvp`, or `all` (MVP + round-end). |
| S2–S3 movement audio | `sounds.footsteps`, `.landing` | Independent footstep and landing suppression. |
| S4 knives | `sounds.knife` | `off`, `all`, or `team` (source-attributed same-tick friendly knife damage). `knifeEvents` optionally replaces the built-in event list. |
| S5 gunshots | `sounds.gunshots` | `off`, `mute`, `m4`, `usp`, or `custom`; custom uses `replacement.weaponId/soundType/itemDefIndex`. Edits sound fields in the original bullet message. |
| S6 custom sounds | `sounds.custom` | `enabled` and `events`: case-insensitive event-name/hash filters. Includes world sources. SOS messages carry hashes; named WeaponSound messages carry names. |
| X3 advertising | `chat.advertising` | Independent `chat` and `names`; `ips/urls`, `allowedIps/allowedDomains`, and `replacementName` (default `Player`). |
| X4 command chat | `chat.hideCommands` | Hide public/team messages starting with `/` or `!` after whitespace, including unknown commands and admin messages. Registered commands continue to execute. |
| X5 formatting | `chat.format` | `enabled`, channel `templates`, permission `prefixes`, independent `teamJoin` and `grenade` replacement announcements. |
| X6 dead chat | `chat.dead` | `enabled`, `readFlags` (default `b`). Living non-staff cannot read dead/spectator public chat during active rounds. |

Name-change rate protection and command execution blocking are omitted.

Advertising rejects the message, privately warns the sender, and alerts only staff with `chat.advertising.notifyFlags` (default `b`). Alerts include name, SteamID and attempted text. `cooldownSeconds` defaults to 10 per offender. Domain allowlists allow the exact domain and its subdomains, never a domain that merely contains the allowed text. IP filters inspect IPv4 addresses, including addresses with ports.

Dead/spectator players can read all public chat. Warmup and between-round public chat are open. Dead-read flags bypass life restrictions while retaining team privacy; they are independent of advertising alert flags.

### Templates

`templates` has `public`, `team`, `dead`, `spectator` and `traitor` entries. Supported values: `{name}`, `{message}`, `{prefix}`, `{team}`, `{channel}`, `{location}`, `{grenade}` plus native color tags such as `{blue}`, `{grey}`, `{yellow}`, `{red}`. The first matching permission entry in `prefixes: [{flags, text}]` wins. Operator templates are literal; player text cannot inject placeholders or colors.

`teamJoin` and `grenade` each have their own `enabled`, `includeBots` and `template` settings. These replacements work independently of ordinary chat formatting and stock suppression. Grenade replacements stay within the thrower's team. First-party warnings/replies use recipient-language `decluttr.phrases.json` with an English fallback; custom templates and player text are not translated.

### Other plugins and restoration

TTT core/communication, Jailbreak GunGame/RTD and MAUL consume the optional [interface](api.d.ts). They keep working without Decluttr. TTT keeps ownership of traitor/dead channels and logical life state. GunGame and TTT narrow their existing killfeed audiences. MAUL retains its desired name separately from the sanitized name, so disabling filtering restores its name without an enforcement loop. Late loads, reloads and unloads detach the old provider safely.

Disabling a feature or unloading restores cvars, render alpha, music kits and sanitized names only while their current value still equals Decluttr's last assignment. Later changes from other plugins are preserved. Saved leg preferences remain stored. Failed preference writes keep the session choice and retry while the same client stays connected.

## Validation

`npm run check` builds every plugin and runs the retained behavior suites. Decluttr tests cover config validation, reload rollback, token/sound filtering, bullet-field preservation, staff alerts/allowlists, private audiences, connection reuse, render ownership and cookie retries.

Before adopting on a live server, verify with receiving clients: hidden/visible legs after reconnect and respawn; sound-only ping marker retention; team knife event ordering; gunshot replacements with tracers/impacts; MVP/round-end audio; overhead walls/distance behavior; and disconnect icons. Native boundary tests cannot prove client rendering or audio behavior. Check native capability/gamedata warnings on startup.

## Attribution

Inspired by [oqyh/cs2-Game-Manager-GoldKingZ](https://github.com/oqyh/cs2-Game-Manager-GoldKingZ). Decluttr is an independent TypeScript implementation of selected behavior; no C# source is incorporated. See [NOTICE](NOTICE). Apache-2.0, matching this repository's license.
