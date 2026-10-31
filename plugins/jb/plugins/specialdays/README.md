# @edgegamers/jailbreak-specialdays

Special days for Jailbreak: a one-round game mode the warden (or an admin) picks, plus the
Speedrunners path trail. Ported from `Jailbreak.SpecialDay`, `Jailbreak.Public/Mod/SpecialDay` and
`Jailbreak.Trail`.

Hard dependency: `@edgegamers/jailbreak-core` (claims the `"specialday"` round mode). Optional: `@edgegamers/jailbreak-warden` (who may
call a day), `@s2script/zones` (armory/cell/spawn areas).

## Commands

| Command | Who | What |
| --- | --- | --- |
| `!sd` / `sm_sd` (aliases `sm_specialday`, `sm_startday`) | warden; admins with `rcon` any time | No argument: open the day picker (or say which day is running). `!sd <day>`: start that day. |

`<day>` accepts the day name (`ffa`, `hns`, …), the old enum number (`!sd 3` = Fog) or a C# alias:
`freeforall`, `hide`/`hideseek`/`seek`, `ns`, `war`, `gun`, `zomb`/`zombie`, `rocket`/`rj`/`marketgardner`,
`speed`/`speeders`/`speedrunners`/`race`, `tp`, `grenade(s)`, `ghosts`. Spaces are ignored
(`!sd free for all`).

Who may start a day (SpecialDayManager.CanStartSpecialDay):

- Console and players with the `rcon` (or `root`) flag skip the round rules.
- Everyone else must be the warden, outside warmup, with no day running, at least
  `sd_round_cooldown` rounds since the last day, and within `sd_max_elapsed_time` seconds of round start.
- Days listed in `sd_gated_days` additionally need the `sd_gate_flag` admin flag (root bypasses).
  This replaces the EdgeGamers "Silver Supporter" check.

## Days

| Type | Name | Summary |
| --- | --- | --- |
| `custom` | Custom | Normal round under the warden's rules; LRs and rebels stay on. |
| `bhop` | Bunny Hop | Custom + auto bunny-hop. |
| `ffa` | Free for All | Everyone vs everyone from the armory, staggered release. |
| `fog` | Fog War | FFA in a black fog that closes in, then expands. |
| `gungame` | Gun Game | 10-weapon ladder with respawns; knife kills skip a step and demote. |
| `ghost` | Ghost War | FFA, everyone flickers visible/hidden (and immune while hidden). |
| `he` | HE Only | Grenades only, refilled on every throw. |
| `hns` | Hide and Seek | Hiders get a head start; seekers wait in the armory. |
| `infection` | Infection | CT zombies; dead prisoners respawn as zombies. |
| `noscope` | No Scope | Scoped rifles that can't scope, low gravity, infinite ammo. |
| `oitc` | One in the Chamber | One bullet, one-hit kills, a bullet back per kill. |
| `rocketjump` | Rocket Jump | The Nova fires rockets; mid-air knife kills are instant. |
| `speedrun` | Speedrunners | Follow the runner's path; the slowest are eliminated each race. |
| `teleport` | Teleport | FFA; damaging someone swaps your places. |
| `warday` | Warday | CTs hold a room, Ts attack, CTs expand later. |

On start the plugin claims core's `"specialday"` mode (and refuses to start if core says no),
announces the day, runs the shared setup (convars, round time, respawn/health/armor/strip,
invulnerability, `disableRebelsForRound` unless the day keeps rebels, `openCells("specialday")`
when the day opens cells, teleports, freeze), then the day's own setup, and finally emits
`OnSpecialDayStart`. The day ends at core's `OnRoundEnd` (also on map change / unload): every convar is
restored, timers die, and `OnSpecialDayEnd` is emitted. Start and end are written to core's round log.

## Config (`s2script.config`)

| Key | Default | Meaning |
| --- | --- | --- |
| `sd_round_cooldown` | 5 | Rounds between special days. |
| `sd_max_elapsed_time` | 30 | Max seconds into a round a warden may call a day. |
| `sd_gated_days` | `hns,speedrun` | Days that need `sd_gate_flag` (empty = none). |
| `sd_gate_flag` | `custom1` | Admin flag name that unlocks gated days. |
| `sd_gated_message` | "You must be a Silver Supporter…" | Shown when the flag is missing. |
| `sd_ghost_visible_duration` / `sd_ghost_invisible_duration` | 5 / 5 | Ghost War cycle (seconds). |
| `sd_noscope_weapon` | `weapon_ssg08` | No Scope weapon(s), comma-separated. |
| `sd_noscope_allowedweapons` | utility + ssg08 + knife | No Scope pickup/fire whitelist; empty = any. |
| `sd_noscope_knife_delay` | 120 | Seconds until everyone gets a knife (0 = never). |
| `sd_noscope_gravity` | 200 | `sv_gravity` during No Scope. |
| `sd_oitc_weapon` / `sd_oitc_additionalweapon` | `weapon_deagle` / `weapon_knife` | One in the Chamber loadout. |
| `sd_hns_hide_hp_t/ct`, `sd_hns_hide_armor_t/ct` | 300/150, 200/300 | HNS hide-time HP/armor (-1 = unchanged). |
| `sd_hns_seek_hp_t/ct`, `sd_hns_seek_armor_t/ct` | 300/25, 500/-1 | HNS seek-time HP/armor. |
| `sd_hns_weapons_ct` / `sd_hns_weapons_t` | pistols + utility / "" | HNS pickup whitelists (empty = any). |
| `sd_hns_seekers` | `t` | Seeking team (`t`/`ct`), restricted to the armory. |
| `sd_hns_seektime` | 45 | Hide time (seconds). |
| `rj_max_distance`, `rj_close_jump_distance` | 160, 37 | Rocket-jump range. |
| `rj_jump_force_main/up/forward/backward`, `rj_run_force_main` | 270, 8, 1.2, 1.25, 0.8 | Launch maths. |
| `rj_proj_damage`, `rj_proj_damage_radius` | 65, 225 | Rocket blast. |
| `speedrun_initial_time`, `speedrun_first_round_freeze`, `speedrun_freeze_time` | 20, 6, 2 | Speedrun timings. |
| `speedrun_win_time_base/bonus`, `speedrun_win_max` | 25/5, 60 | Winner's hunting time. |
| `speedrun_win_weapons`, `speedrun_loser_weapons` | `weapon_knife,weapon_negev`, "" | End-game loadouts. |
| `speedrun_winner_damageable`, `speedrun_loser_damageable` | false, true | End-game damage. |
| `speedrun_teleport_type` | 2 | 0 none, 1 losers → winner, 2 winner → losers. |
| `speedrun_finish_at` | 2 | Players left when a winner is declared. |

## Contract (`api.d.ts`)

- `isRunning()`, `getCurrent(): SDInfo | null` (`{ type, name, round, starterSteamId }`), `roundsSinceLast()`.
- Forwards `OnSpecialDayStart` / `OnSpecialDayEnd` (`{ day: SDInfo }`). Start fires after the day's
  setup ran. Gang colours are applied by `@edgegamers/jailbreak-gangperks` on `OnSpecialDayStart`, not here.

## Layout

- `src/plugin.ts` wiring · `src/manager.ts` start/end/eligibility/event routing · `src/runner.ts` the
  shared day setup (AbstractSpecialDay) · `src/days/*.ts` one file per day · `src/menu.ts` picker ·
  `src/trail.ts` speedrun trails · `src/restrict.ts` armory/cell restriction · `src/pickup.ts` pickup gate ·
  `src/game.ts` engine helpers · `src/messages.ts` strings.
- Pure, unit-tested: `src/sdtype.ts` (aliases), `src/eligibility.ts`, `src/settings.ts`,
  `src/geometry.ts`, `src/weapons.ts`, `src/rules/{gungame,speedrun,rocketjump,trail}.ts`.

## Live-test checklist (nothing here has run on a server yet)

- [ ] `!sd` as warden opens the center picker; picking a day starts it. As a non-warden: "You are not
      the warden." Cooldown/too-late/running messages appear at the right times; an `rcon` admin bypasses them.
- [ ] Gated days (`hns`, `speedrun`) are refused without `custom1`, allowed with it / root.
- [ ] Starting a day while LR/last guard owns the round is refused (core `setMode`).
- [ ] Custom/Bunny Hop: LRs still possible at the end of the round (mode handed back to `normal`; lastrequest re-checks then and on every death); last guard stays off; rebels work.
- [ ] Every day: convars restored after the round (`mp_teammates_are_enemies`, `sv_autobunnyhopping`,
      `mp_respawn_on_death_*`, `sv_gravity`, `sv_infinite_ammo`, `mp_ignore_round_win_conditions`, …).
- [ ] Freeze/unfreeze timings, invulnerability until the start, teleports (armory = CT spawns,
      random uses `spawn`-tagged zones first), cells open, round timer set.
- [ ] Pickup gate: HE day can't pick up guns; HNS CTs only pistols/utility; Gun Game only the current class.
- [ ] Armory restriction (HNS seekers, Infection CTs, Warday Ts): walking out teleports back + reminder;
      outline beams drawn; works with `armory`-tagged zones and with the spawn-hull fallback.
- [ ] Fog War: fog appears, closes in at 25s, expands at 100s; sky disabled and restored. **Verify the
      fog struct writes replicate** (fog end lerp) and that `SetFogController` takes.
- [ ] Ghost War: players vanish/reappear on the cycle, hint countdown, bell/beep sounds, damage off while hidden.
- [ ] Gun Game: ladder advances, knife skip/demote messages, kill feed only to the killer, winning
      kill broadcast, winner gets Negev + speed, respawns at random spawns.
- [ ] Infection: dead prisoners turn into green zombies next to the nearest player, get a knife after
      3s, and are moved back to T at round end.
- [ ] No Scope: right-click does nothing, low gravity, knives at 120s.
- [ ] One in the Chamber: one bullet, any hit kills, kill = +1 bullet, reloading can't exceed the count;
      fall damage does not one-shot.
- [ ] Rocket Jump: Nova shot at the floor launches you; `env_explosion` damages others but not you;
      pellets do no damage; mid-air knife = 200 damage. **Verify env_explosion keyvalues/inputs and the
      damage attribution** (inflictor/attacker is the explosion).
- [ ] Speedrunners: runner picked + coloured blue, pulsating trail, goal circle, races with hint-text
      leaderboard, eliminations, AFK/leaver hand-over, winner end-game. Check beam count/performance.
- [ ] `OnSpecialDayStart`/`OnSpecialDayEnd` reach `@edgegamers/jailbreak-gangperks`; round log shows start/end lines.

## Port notes

- **Structure:** factory/DI/locale layers dropped. One `SpecialDay` object per day (`day.ts`) with
  optional hooks; the shared C# base classes became `runner.ts` (AbstractSpecialDay) and
  `restrict.ts` (Abstract{Zone,Cell,Armory}RestrictedDay). Engine events are subscribed once at load and
  routed to the running day.
- **Fixed C# quirks:** `BHopDay.Type` was `CUSTOM` and `TeleportDay.Type` was `FFA`; they now report
  `bhop`/`teleport`. The Speedrun elimination loop could spin forever on an invalid player and could
  "eliminate" the same player twice; the `ImpossibleLocation` message was built but never sent — now sent.
- **LR / last guard:** there is no "disable LR for this round" contract. Holding core's `"specialday"`
  mode blocks LR/last guard for every day; Custom and Bunny Hop (which allowed LRs) hand the mode back to
  `"normal"` right after setup, and `@edgegamers/jailbreak-lastrequest` then lets LR turn on later in the round (it ends
  running LRs on the `"specialday"` change but does not latch LR off; it re-checks on `"normal"`).
  Last guard stays off for the whole round on every day (lastrequest latches it when it sees
  `"specialday"`), matching the C# for every day but Warday. Warday allowed last guard but not LR —
  with one mode that can't be expressed, so last guard is blocked on Warday.
- **Donor gating** is `sd_gated_days` + `sd_gate_flag` instead of the `@ego/dssilver` permission.
- **Ghost War** uses the declarative `Transmit` API instead of a CheckTransmit signature hook.
- **Rocket Jump** (approximation): no native HE-projectile factory in s2script, so rockets are hitscan —
  aim trace → `env_explosion` at the impact point. Same launch maths and knife rule; no travel time.
  `rj_bullet_speed`, `rj_proj_inherit_player_velocity` and `rj_proj_gravity` were dropped (no projectile).
- **One in the Chamber:** reserve ammo can't be written (`setAmmo` reserve is deferred in the SDK), so the
  plugin counts bullets itself and clamps the magazine every frame.
- **No Scope:** the C# used `Server.TickCount`; s2script exposes game time only, so the tick is
  `gameTime × 64`.
- **Speedrun leaderboard:** the HTML center panel is plain hint text (`HintText.to`) refreshed every 8
  frames; "S"/"E" markers instead of colours.
- **Fog War sky:** the C# wrote null material handles into `env_sky`; here the sky gets `Disable`/`Enable`
  inputs. `TICK_RATE` 64 is assumed for the per-frame fog lerp.
- NOT PORTED: Rocket Jump hiding the Nova pellet tracers (the C# cleared the FireBullets user-message
  recipients; no safe equivalent found), the `API.Stats` "JB_SPECIALDAY" stat push, and gang colours
  (owned by `@edgegamers/jailbreak-gangperks`).
