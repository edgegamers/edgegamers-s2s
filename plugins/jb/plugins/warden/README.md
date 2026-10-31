# @edgegamers/jailbreak-warden

The warden: warden selection (raffle, auto-warden, guaranteed warden), the warden's commands,
markers, paint, the warden / special-treatment icons, special treatment and the peace mute.
Ported from `Jailbreak.Warden`, `Jailbreak.Mute`, the parts of `Jailbreak.Draw` the warden needs,
and the `st` subcommand of `Jailbreak.Debug`.

Hard-depends on `@edgegamers/jailbreak-core` (round lifecycle, rebels, cells, round log).

## Files

| File | What |
| --- | --- |
| `src/plugin.ts` | Wiring only: config, core forwards, the published contract, game events, publics. |
| `src/warden.ts` | Assign/remove, first-warden HP/armor buff, blue tint, died/left/passed/fired flows, auto-open cells. |
| `src/selection.ts` | Raffle window at round start, weighted draw, auto-warden, guaranteed warden. |
| `src/commands.ts` | Every chat/console command. |
| `src/markers.ts` | Ping marker (place + resize), `!count` support, shape/colour menus (cookies). |
| `src/paint.ts` | +use laser paint. |
| `src/icons.ts` | "W" / "S" glyph above the head (`point_worldtext`), via the icon Transforms. |
| `src/special-treatment.ts` | Grant/revoke ST, colour, screen tint, revoke on rebel/death, per-round reset. |
| `src/peace.ts` | Peace mute + dead-player mute + voice reminders. |
| `src/draw.ts` | Beam lines/loops and the text "hat". |
| `src/messages.ts` | Every player-facing string. |
| `src/queue.ts`, `src/rules.ts`, `src/shapes.ts` | Pure logic (raffle, durations, parsers, marker math, shape geometry) — unit-tested. |

## Commands

| Command (aliases) | Who | What |
| --- | --- | --- |
| `!warden` (`!w`) | living guard | Join/leave the raffle while it's open; otherwise become warden if there is none; otherwise show the current warden. 15 s cooldown after passing/being fired (RCON admins exempt). |
| `!pass` (`!uw`, `!unwarden`) | warden | Resign. Undoes the first-warden buff; "freeday" is announced if nobody takes warden within 10 s. |
| `!fire` | admin (BAN) | Remove the warden. Chat admins see who fired them. |
| `!open` (`!o`) | warden (after `warden_open_cooldown`), admin (CHEATS) any time | Open the cells via `core.openCells("warden" / "admin")`. |
| `!peace` | warden / chat admin (CHAT), 60 s cooldown; CHEATS admin & console no cooldown | Peace mute: everyone but the warden muted. |
| `!count` | warden (after `warden_count_cooldown`) | Count living prisoners inside the marker. |
| `!countdown [s]` | warden (60 s cooldown) / CHAT or CHEATS admin | Chat countdown (3–15 s, default 5) plus a peace mute. |
| `!roll [min max]` | warden | Roll in [min, max) (default 0–10). |
| `!chicken` | warden | Spawn a chicken (max `max_chickens` per round). |
| `!soccer` (`!spawnball`) | warden | Spawn a soccer ball (max `max_soccers` per round). |
| `!st <target>` (`!treat`) | warden | Toggle special treatment on one living prisoner. |
| `!markertype` / `!markercolor` | `marker_customization_flag` | Pick marker shape / colour (centre menu, saved as cookies). |
| `!aw` (`!autowarden`) | `autowarden_flag` | Toggle auto-joining the raffle (cookie `jb_warden_auto`). |
| `sm_markst <target>` | admin (ROOT) | Debug: toggle special treatment on any target (C# `css_debug st`). |
| middle-mouse ping | warden | Place the marker; ping again within `warden_resize_time` to resize it. Non-wardens' pings are blocked. |
| hold E | warden | Paint. |

## Config

| Key | Default | Meaning |
| --- | --- | --- |
| `hp_equal` / `hp_outnumber` / `hp_outnumbered` | 50 / 25 / 100 | Guard armor raised when the first warden is picked (balanced / guards outnumber / prisoners outnumber). |
| `warden_t_ratio` | 3 | Prisoners per guard considered balanced. |
| `warden_armor` / `warden_hp` / `warden_maxhp` | 125 / 125 / 100 | First warden's armor/HP/max HP. |
| `warden_sound_killed` / `_passed` / `_new` | `jb/warden/*.vsnd` | Sounds (`play sounds/<path>`), empty disables. |
| `warden_queue_seconds` | 7 | Raffle window. |
| `autowarden_flag` | `o` | SM flag letters for `!aw` (C# used the `@ego/dssilver` group). |
| `autowarden_delay_interval` | 5 | Seconds after round start auto-warden players are entered. |
| `warden_open_cooldown` / `warden_count_cooldown` | 25 / 30 | Seconds after freeze time. |
| `warden_countdown_min` / `_max` / `_default` | 3 / 15 / 5 | Countdown bounds. |
| `peace_cooldown` | 60 | `!peace` cooldown. |
| `max_chickens` / `max_soccers` | 5 / 3 | Per round. |
| `marker_customization_flag` | `o` | SM flag letters for the marker menus. |
| `warden_marker_min_radius` / `_max_radius` | 60 / 360 | Marker radius bounds. |
| `warden_resize_time` | 800 | ms resize window. |
| `warden_marker_segments` | 33 | Beams per curved shape (was the particle count). |
| `warden_paint_lifetime` / `warden_paint_max_segments` | 10 / 300 | Paint trail lifetime and cap. |

## Contract (`api.d.ts`)

Methods: `getWarden`, `hasWarden`, `isWarden`, `setWarden`, `removeWarden(reason)` (runs that
reason's announcements), `guaranteeWarden(steamId)`, `isInQueue`, `isSpecialTreatment`,
`setSpecialTreatment` (grant needs a living player), `isPeace`, `peaceMute(reason)`, `unPeaceMute`.

Forwards emitted: `OnWardenAssigned`, `OnWardenRemoved` (pass / fire / death / disconnect /
team_change / round_end / admin), `OnSpecialTreatment`, `OnPeaceChanged` (active true on mute,
false when prisoners are unmuted). Transforms dispatched: `OnWardenIcon` (default `"W"`, on
assignment), `OnSpecialIcon` (default `"S"`, on grant), `OnPaintColor` (default `""` = white,
once per paint stroke; `"rainbow"` is re-sampled per segment).

Consumes from core: `OnRoundStart`, `OnRoundEnd`, `OnRebelChanged` (rebel → ST revoked silently),
plus `log`, `describe`, `isRebel`, `unmarkRebel`, `openCells`, `cellsOpened`, `getRound`.

## Live-test checklist

Nothing here has run on a live CS2 server yet. Verify:

- [ ] Round start: "Picking a warden shortly" appears; `!w` joins/leaves the raffle; after 7 s one queued guard becomes warden (blue model, chat + hint text, `wardennew` sound plays).
- [ ] No one queued → "No one in queue…"; the next `!w` makes that guard warden immediately.
- [ ] First warden: guards' armor raised per balance; warden gets 125 armor / 125 HP / 100 max HP, a helmet and a healthshot (unless they had them). Initial peace mute announced.
- [ ] `!pass`: resign message, buff rolled back (HP/armor ≤ previous, extra healthshot removed), "freeday" after 10 s if nobody takes warden; `!w` blocked for 15 s for the passer.
- [ ] `!fire` (BAN admin): fired message, chat admins see the admin's name.
- [ ] Warden dies / switches team: "The warden died. It is a freeday!", prisoners tinted blue until the next warden (+3 s); `wardenkilled` sound.
- [ ] Warden disconnects: "The warden left the game."
- [ ] Peace: everyone except the warden muted (`Voice` rule); guards unmuted after ≤10 s with a chat line; prisoners after the full time; chat admins never muted and get the hint reminder; dead players muted until next round; muted players see "You are currently muted." as hint text when they talk. An admin `sm_mute` (basecomm) is NOT lifted at round start.
- [ ] `!peace` cooldown 60 s for warden; CHEATS admin bypasses.
- [ ] `!open` before 25 s → wait message; after → cells open ("The warden opened the cells."); twice → "already opened". Admin `!open` names the admin.
- [ ] Auto-open after 60 s if nobody opened; with prisoners near T spawns the message appears. **Check this does not double up with any auto-open in `@edgegamers/jailbreak-core`.**
- [ ] Ping as warden: a beam ring (shape/colour from cookies) + a short vertical beam; ping again within 0.8 s resizes it; non-warden pings are suppressed. `!count` counts prisoners inside (+32 u).
- [ ] `!markertype` / `!markercolor` menus open (flag `o`), choice persists across reconnects, live marker redraws.
- [ ] Hold E as warden: beam trail follows aim on world geometry, fades after 10 s; releasing and pausing > 2 s starts a new stroke. Rainbow colour via a gangperks patch cycles.
- [ ] Warden "W" (blue) and ST "S" (green) icons appear above the head, follow the player (SetParent), and disappear on removal/death/round start. Check the `point_worldtext` keyvalue names (`font_size`, `world_units_per_pixel`, `justify_horizontal`, `color`, …) render as intended.
- [ ] `!st <name>` toggles ST: green model, faint green screen tint (Fade units/flags!), chat lines; marking the ST prisoner rebel revokes it silently; death revokes it.
- [ ] `!countdown 10`: chat 10, 5, 4, 3, 2, 1, GO; peace mute applied.
- [ ] `!roll 1 6`, `!chicken` (×5 cap), `!soccer` (×3 cap; ball model precached — on a fresh server start the first map may miss the precache).
- [ ] `!aw` toggles the cookie; next round an auto-warden player who has moved is entered after 5 s.
- [ ] `guaranteeWarden(steamId)` (RTD): that player becomes warden the moment they `!w` (raffle or not).
- [ ] `sm_markst <target>` (root) toggles ST.

## Port notes

- **Simplified:** no DI/locale interfaces; one module per feature; English strings in `messages.ts`
  with `[Warden]` / `[Voice]` / `[Countdown]` tags (C# used `Guard>` / `Voice>` / `Countdown>`).
- **Markers:** the C# drew CS2Draw particle effects per shape. Here each shape is a loop of
  `env_beam`s (`Beam.draw`) — straight shapes use their corners only, curves are sampled at
  `warden_marker_segments`. Jelly bean and Among Us are hand-made approximations of the particle
  shapes.
- **Paint:** the CS2Draw trail is approximated with short beam segments that expire.
- **Peace mute** uses `Voice.setAudibleTo(slot, [])` (per-plugin, layered under admin mutes)
  instead of writing `Client.voiceMuted` like the C# `VoiceFlags`, so round-start unmute never
  clears an admin's mute. If voice rules are degraded it falls back to `voiceMuted`, clearing only
  what it set itself. Peace timers are killed when peace ends early (the C# left them running, which
  could unmute guards during a later peace), and ending peace early also ends `isPeace()`.
- **Pass cooldown** is keyed by SteamID (C# keyed by controller) and also set when fired.
- **Guaranteed warden** lasts until used or map change (contract), not just until the next raffle.
- **Count** counts living prisoners only.
- **Debug:** `css_debug st` is the standalone admin command `sm_markst` (core owns `css_debug`).
- **NOT PORTED:**
  - `[WARDEN]` clan tag + `nextlevel_changed` scoreboard refresh — no `m_szClan` accessor in the SDK.
  - MAUL/Actain chat tag swap — external service.
  - Removing the first-warden helmet on pass — no `CCSPlayer_ItemServices.m_bHasHelmet` write.
  - Gang warden stats (times warden, warden kills/deaths), gang credits for killing guards/warden,
    gang icon/paint choices — they belong to
    `@edgegamers/jailbreak-gangperks`, which can derive them from `OnWardenAssigned`/`OnWardenRemoved` and the
    icon/paint Transforms.
  - `API.Stats` pushes (`JB_WARDEN_ASSIGNED`, `JB_MARKER`, …) — the core round log is the sink.
  - The `!st` with no argument prisoner menu — a TODO in the C# too.

- **Auto-opening the cells** (C# `WardenBehavior`'s `css_edgegamers_jailbreak-warden_opencells_delay` timer and the
  auto-snitch) lives in `@edgegamers/jailbreak-core` (`opencells_delay`, `opencells_snitch`): it is a round rule, not a
  warden one, and must run with no warden plugin loaded. Warden only owns `!open`.
