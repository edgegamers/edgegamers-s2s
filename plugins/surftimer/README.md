> Development in this monorepo: run `npm ci` and `npm run check` from the repository root. The root owns releases and dependencies. See [the current contributor guide](../../CONTRIBUTING.md).

# s2s-surftimer

SurfTimer for [s2script](https://github.com/s2script/s2script): a surf/bhop timer for CS2 built for
server performance, plus a separate Panorama HUD.

It is a port of [SurfTimer](https://github.com/surftimer/SurfTimer) (records, stages, bonuses,
styles, practice, replays) that reads zones the [SharpTimer](https://github.com/SharpTimer/SharpTimer)
way. Every map whose author used the community trigger names, and every map with SharpTimer
MapData, works without setup.

| Package | What it is |
|---|---|
| `plugins/surftimer` (`@edgegamers/surftimer-core`) | The timer. Publishes a typed interface (`api.d.ts`) other plugins build on. |
| `plugins/surftimer-hud` (`@edgegamers/surftimer-hud`) | The HUD. Consumes the timer's interface; swap or drop it freely. |
| `packages/shared` | Time formatting, styles, the replay file format. Bundled into both plugins. |
| `hud/workshop` | The Panorama workshop addon (`surftimer_hud.xml` + CSS) the HUD drives. |
| `data/` | SharpTimer MapData zones and map tiers, ready to copy to the server. |

## Performance model

The design rule is that the game thread only does work that must happen on it.

- **Zones are event-driven.** Touches come from the engine's own `trigger_multiple`
  `OnStartTouch`/`OnEndTouch` outputs. Each trigger is classified by name once, then cached by
  entity index and host id, so a touch costs one `Map` lookup. Zones are never polled.
- **One native read per active runner per tick.** `Pawn.readKinematics` fills a preallocated
  `Float64Array` (origin, angles, velocity, flags, move type, buttons) in one call, with no
  allocation. Recording, the pre-speed cap and the Backwards-style check all share that read.
  Idle and dead players cost nothing.
- **Tick-exact times.** Runs are measured in integer server ticks (`Server.tickCount`), from the
  tick you leave the start zone to the tick you touch the end, with pauses excluded.
- **Replays never copy on the game thread.** Frames are recorded straight into a buffer that
  already reserves the file header. Saving a record writes the header and hands the buffer to an
  off-thread job (gzip plus an atomic file write). The same buffer then becomes the replay bot's
  playback data.
- **Replay bots cost two native calls per tick each** (one kinematics read, one teleport carrying the
  steering velocity), plus a one-array-read check in the usercmd hook for every other player.
- **Database and file IO are off-thread.** Leaderboards live in memory per map, so PB, WR and rank
  are computed instantly at the finish line and the database write lands later. Map data, tier
  downloads and replays all load through the async runtime.
- **The usercmd filter exists only while needed.** It is armed while at least one player uses a
  restricted style, and released otherwise.
- **The HUD refreshes at `rate_hz` per player, staggered across ticks.** The timer pushes state
  transitions, and the HUD derives the live time itself, so nothing polls the timer per frame. On
  Panorama, spectators cost nothing extra: the layout is `observable`.

## Features

- **Zones.** Discovered from map triggers using the SharpTimer names (`map_start`, `sN_start`,
  `map_cpN`, `bN_start`, `bN_end`, `bonus_cpN`, `st_stop`, `st_reset`, …), or from SharpTimer
  MapData JSON: custom trigger names, or corner-defined "fake" zones created as runtime triggers.
  Spawns use an `info_teleport_destination` inside the start trigger when the map has one.
- **Runs.** Main map, stages (with stage records and stage-only runs from `!s N`), linear
  checkpoints, bonuses with checkpoints, pause/resume, and a pre-speed cap on leaving or bunny-hopping
  inside a start zone.
- **Splits** against your PB and the WR at every stage and checkpoint.
- **Styles** with their own leaderboards: Normal, Sideways, Half-Sideways, Backwards, Low-Gravity,
  W-Only and A/D-Only.
- **Records and ranks.** SQLite by default, or a shared MySQL/Postgres connection. There are
  per-map leaderboards, stage records, and server-wide points (tier-weighted completions).
- **Replays.** The best run per track and style is saved with its pre-strafe and played by bots
  that cycle through every available replay. `!replay` picks one on demand. Playback works the
  ckSurf way: the bot walks under real physics, steered each tick by a velocity toward the next
  recorded position, gets the recorded buttons and view angles as its input (so it crouches, jumps
  and animates), and is snapped back only when it drifts or the recording crosses a map teleport.
- **Practice.** Save locations (`!cp`, `!tele`, `!teleprev`, `!telenext`); teleporting during a run
  turns it into a practice run, which is timed but never saved. You can also set a personal start
  position.
- **`!hide`** hides other players. It uses transmit filtering, so hidden players cost no
  networking.
- **Map tiers** come from `st_maps` (set with `sm_settier`), then MapData `MapTier`, then
  SharpTimer's tier list (downloaded off-thread and cached).

### HUD (`@edgegamers/surftimer-hud`)

- A live timer coloured by state (start zone, running, paused, practice, finished, replay), plus
  stage or checkpoint progress, style, rank and tier.
- PB and WR (with the holder's name), and a speed readout with a gaining/losing colour and a
  gradient meter.
- WASD, duck and jump key display.
- A split popup with the PB/WR difference and the stage time (flagged on a stage record), and a
  pre-speed popup when a run starts.
- A finish card: animated for a new record, highlighted for a PB.
- A live top-5 leaderboard for your current track and style (`!hudtop`).
- Spectator and replay views: watching a player or a replay bot shows their HUD. Replay bots show
  the recorded keys.
- A center-HTML fallback (`show_survival_respawn_status`) when the workshop addon is not set up.

## Commands

| Command | |
|---|---|
| `!r` `!restart` | Teleport to the main start |
| `!b [N]` | Bonus N start |
| `!s [N]` | Stage N (a stage-only run starts when you leave its zone) |
| `!end [track]` | Teleport to the end zone (stops the timer) |
| `!stop` · `!pause` | Stop the timer · pause/resume |
| `!style [name]` · `!n` `!sw` `!hsw` `!bw` `!lg` `!w` `!ad` | Switch style (teleports to start) |
| `!top [style]` · `!btop N [style]` · `!wrcp [stage] [style]` | Leaderboards |
| `!pr [player]` · `!rank` · `!ranktop` | Personal records · points rank · top players |
| `!cp` · `!tele [n]` · `!teleprev` · `!telenext` | Practice save locations |
| `!startpos` · `!resetstart` | Personal start position for the current track |
| `!hide` · `!spec` · `!replay [track] [style]` | Hide players · spectate · watch a replay |
| `!tier` | Map info |
| `!hud` · `!hudkeys` · `!hudtop` | HUD toggles |
| `sm_settier <1-10> [linear\|staged]` | Admin (changemap flag) |
| `sm_zones_reload` | Admin: re-read MapData and rebuild zones |
| `sm_deletetime <steamid64> [track] [style]` · `sm_deletereplay [track] [style]` | Admin (root) |

## Install

1. Install s2script, version 0.33 or later. It needs the engine surface from
   [s2script#290](https://github.com/s2script/s2script/pull/290).
2. From the repository root, run `npm ci` and `npm run build -- --filter '@edgegamers/surftimer-*'`. Copy
   `plugins/surftimer/plugins/surftimer/dist/*.s2sp` and `plugins/surftimer/plugins/surftimer-hud/dist/*.s2sp` to
   `addons/s2script/plugins/`.
3. Optional: copy the contents of `data/` to `addons/s2script/data/files/_edgegamers_surftimer-core/`.
   That gives you `mapdata/<map>.json` (SharpTimer MapData) and `maptiers.json`. Tiers are also
   downloaded automatically (`map_tiers_url`).
4. Optional, for the Panorama HUD: compile and publish `hud/workshop` as a workshop addon (see
   below), mount it for clients with MultiAddonManager, and set the HUD's `workshop_addon` config
   to its id.

Recommended server cvars for surf: `sv_airaccelerate 150`, `sv_enablebunnyhopping 1`,
`sv_autobunnyhopping 1`, `sv_staminamax 0`, `sv_falldamage_scale 0`, `mp_roundtime 60`,
`mp_freezetime 0`, `mp_respawn_on_death_ct 1`, `mp_respawn_on_death_t 1`. The plugin sets the
bot-quota cvars it needs for replay bots on its own.

### Configuration

Both plugins use s2script's typed `config` (see each `package.json`). The most relevant keys:

- `surftimer`: `database`, `max_prespeed`, `max_prespeed_bonus`, `prespeed_cap_in_zone`,
  `replays`, `replay_bots`, `replay_max_minutes` (capped so a replay file always fits the runtime's
  8 MiB read limit), `replay_prerun_ticks`, `hide_players_default`, `announce_pb`,
  `map_tiers_url`.
- `surftimer-hud`: `mode` (`auto`/`panorama`/`center`/`off`), `workshop_addon`, `rate_hz`,
  `speed_max`, `time_decimals`.

## The Panorama addon

`hud/workshop/panorama/layout/custom_game/surftimer_hud.xml` and its stylesheet follow the
`custom_hud_layout` subset, which allows only classes and dialog variables, with no client script.
Compile the folder with the CS2 Workshop Tools and publish it as a content addon (`IsPlayable = false`;
see `addoninfo.txt`).

`hud/publish.ps1` does both in one step on Windows. It mirrors `hud/workshop` into
`content/csgo_addons/surftimer_hud`, compiles the layout and stylesheet with the Workshop Tools'
`resourcecompiler`, and packs and uploads the result with
[CS2WorkshopManager-CLI](https://github.com/Angel-foxxo/CS2-Workshop-Manager). Steam must be running and
signed in to the account that owns the item. The first run (without `-Id`) creates a private item and
prints its id; set that as the HUD's `workshop_addon` and pass `-Id` from then on:

```powershell
./hud/publish.ps1 -Cli C:\tools\CS2WorkshopManager-CLI.exe -Id <workshop id> -Visibility unlisted
``` The client is the only CSS validator: load the HUD once in game after any CSS
change, and it will name any bad property.

## Data and licence

GPL-3.0-or-later, the same licence as SurfTimer and SharpTimer. `data/mapdata/*.json` and
`data/maptiers.json` come from SharpTimer (`cfg/SharpTimer/MapData`, `remote_data/`, commit
`bb9ac30`).

## Development

```bash
npm ci                 # from the repository root
npm run check           # native builds and all retained behavior tests
```

## Monorepo identity

The public bundle is `@edgegamers/surftimer`, with required `@edgegamers/surftimer-core` and `@edgegamers/surftimer-hud` members. When adopting these identities from the original `@s2script` plugins, remove the old loaded copies, back up configuration and replay/map data, and migrate the timer file sandbox to `_edgegamers_surftimer-core`. The named database and its tables are unchanged. Verify timing, saved records/replays and both HUD modes on a test server before rollout.

## Translations and messages

See [the shared translations guide](../../docs/translations.md) for catalogs, native locale overrides, startup loading and the required chat/console formatting. English is embedded; copy loose catalogs only to customize wording or add locales. Update existing deployed overrides manually when upgrading.
