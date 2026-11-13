> Development in this monorepo: run `npm ci` and `npm run check` from the repository root. See [the contributor guide](../../CONTRIBUTING.md).

# PUG

Plays a pick-up game on a CS2 server: rostered teams, `!ready`, a knife round for sides, then
the standard competitive config, with the score kept per team through halftime and overtime.

Matches come from the EdgeGamers CS portal (lobby, captains, draft and map veto happen there; see
s2s-cs-web `docs/pug.md`) through the portal bridge, `@edgegamers/s2s-portal`, which also sends the
score back. This plugin never talks to the portal itself, and works without it from a file
(`pug_load`).

## A match

1. **Load**: the server changes to the match map (`host_workshop_map` when the map has a workshop
   id, else `changelevel`) unless it is already on it. The server gets a new password for the
   match (`sv_password`, 8 easy-to-type characters), sent to the portal with every state change so
   the match page can show its players `connect <address>; password <password>`. A plugin reload
   keeps the same password; the server's previous password comes back when the match is cleared.
2. **Warmup**: endless warmup. Team 1 (the captain who picked first) is put on CT, team 2 on T;
   rostered players cannot change team. Players not in the match are kicked (admins with the
   generic flag may stay and spectate; `kick_unrostered = false` keeps everyone on spectator).
   Everyone types `!ready`; a reminder goes out every 30 s.
3. **Knife round**: when every rostered player is connected and ready (or an admin runs
   `pug_forcestart`): knives only, no money, no bomb, one round to win.
4. **Side choice**: the match pauses; the winning captain types `!stay` or `!switch`
   (`side_choice_seconds`, then stay). If the captain is not on the server anyone on that team
   may choose.
5. **Live**: `exec gamemode_competitive` (the game's standard competitive settings), then
   `live_cfg` if set, then `mp_restartgame`. Every round end is reported; `cs_win_panel_match` ends
   the match.

A map change during a match goes back to warmup. Loading the match already being played does
nothing, so the bridge can resend it freely.

## Player commands (chat `!`, or `sm_` in the console)

| Command | What |
| --- | --- |
| `!ready` / `!r`, `!unready` / `!ur` | Warmup ready check |
| `!stay`, `!switch` | Knife winners choose a side |
| `!pause`, `!tech` | Pause at the next freeze time (live only) |
| `!unpause` | Both teams must ask before the match resumes |

## Admin and server commands

| Command | Who | What |
| --- | --- | --- |
| `pug_forcestart` | admin (generic) | Start the knife round without waiting for ready |
| `pug_forceunpause` | admin (generic) | Unpause now |
| `pug_cancel [reason]` | admin (generic) | Stop the match here (cancel it on the portal too, or the bridge loads it again) |
| `pug_status` | server | Match, phase, score, ready count |
| `pug_load [file]` | server | Load a match from a JSON file in this plugin's config folder (default `pug_match.json`), shaped like `PugMatchSpec` in `api.d.ts` |

## Config

| Key | Default | What |
| --- | --- | --- |
| `use_portal_names` | `true` | Show rostered players under their MAUL name from the portal (re-applied every round and when they rename); their own name comes back when the match is cleared |
| `set_password` | `true` | Give each match its own server password and report it to the portal |
| `kick_unrostered` | `true` | Kick players who are not in the match (admins excepted) |
| `side_choice_seconds` | `60` | Time for `!stay` / `!switch` |
| `map_change_delay_ms` | `5000` | Wait before changing to the match map |
| `warmup_cfg` | `""` | cfg exec'd when warmup starts |
| `knife_cfg` | `""` | cfg exec'd for the knife round, after the plugin's knife settings |
| `live_cfg` | `""` | cfg exec'd after `gamemode_competitive`, for this server's overrides |

## Contract

`api.d.ts`: `load(spec)`, `clear(reason)`, `status()`; forwards `OnStateChanged`, `OnRoundEnd` and
`OnMatchEnd`. Teams are the portal's teams (1 and 2), not sides.
