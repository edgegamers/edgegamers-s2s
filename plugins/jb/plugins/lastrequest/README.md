# @edgegamers/jailbreak-lastrequest

Last requests (8 games), LR rebel and last guard. Ported from `Jailbreak.LastRequest`,
`Jailbreak.LastGuard`, `Jailbreak.Public/Mod/LastRequest|LastGuard` and the LR/LG debug
subcommands of `Jailbreak.Debug`.

Hard dependencies: `@edgegamers/jailbreak-core` (round mode, rebels, round log, round lifecycle forwards) and
`@edgegamers/jailbreak-warden` (the guard picker labels the warden).

## Layout

| File | What |
| --- | --- |
| `src/plugin.ts` | `OnPluginStart` wiring: publish, core forwards, commands, events, hooks |
| `src/manager.ts` | when LR turns on, starting/ending LRs, damage + pickup rules, round reset |
| `src/lr-command.ts` | `!lr` flow (type menu → guard menu → start) and `!endrace` |
| `src/menus.ts` | LR type / guard pickers, open-menu registry |
| `src/lr-rebel.ts` | `!rebel` for the last prisoner |
| `src/lastguard.ts` | last guard |
| `src/debug.ts` | `sm_lrdebug`, `sm_lgdebug` |
| `src/games/*.ts` | one file per LR game + `base.ts` (Teleporting/Weaponized bases) + factory |
| `src/fx.ts` | beam rings, beacons, LR tint / rainbow |
| `src/logic.ts` | pure rules (type parsing, thresholds, HP formulas, RPS, B4B, race, gun toss) — unit tested |
| `src/messages.ts` | every English string |
| `src/settings.ts`, `src/round.ts`, `src/players.ts`, `src/forwards.ts` | config, round clock + mode claim, player helpers, forward handle |

## Commands

| Command | Who | What |
| --- | --- | --- |
| `!lr` / `sm_lr` (alias `sm_lastrequest`) | living prisoner, once LR is on | No args: LR type menu. `!lr <type>`: guard menu. `!lr <type> <guard>`: start directly. Types accept enum names (`gun_toss`), menu indices (`0`-`7`), aliases (`rps`, `s4s`/`sfs`, `m4m`/`mfm`, `cf`/`5050`) and fragments (`knife`, `scope`, `gun`, `coin`, `fifty`). |
| `!rebel` / `sm_rebel` | the last living prisoner, once LR is on | Rebel instead of LR: HP pooled from the guards, `rebel_t_weapon` + knife, marked rebel. |
| `!endrace` / `sm_endrace` | a Race LR participant | Sets the finish point at the prisoner's position and starts the race. |
| `sm_lrdebug [enable\|disable\|<type> [player] [target]]` | admin (ROOT) | Force LR on/off, or start any LR between any two players (menus when arguments are missing). |
| `sm_lgdebug [guard]` | admin (ROOT) | Start last guard for a guard (default: the first living guard). |

## Config (`s2script.config`)

| Key | Default | Meaning |
| --- | --- | --- |
| `lr_activate_lr_at` | 2 | Living prisoners at or below which LR turns on |
| `lr_time_base` | 60 | Round time set when LR turns on (0 = leave the clock) |
| `lr_time_per_lr` | 20 | Seconds added per decided LR (capped by `max_time_for_lr`) |
| `lr_time_per_guard` | 0 | Seconds added per living guard when LR turns on |
| `max_time_for_lr` | 60 | Round-time cap for the per-LR bonus |
| `lr_b4b_kill_by_health` | true | Shot/mag for mag: after 60 s the lower-HP player dies |
| `lr_race_enabled` | false | Offer the Race LR (the C# factory had it disabled) |
| `rebel_on` | true | Allow `!rebel` |
| `rebel_t_weapon` | `weapon_m249` | LR rebel's weapon |
| `rebel_ct_max_hp` | 200 | Max HP each guard contributes to the rebel |
| `rebel_t_hp_ratio` | 0.7 | Rebel HP = pooled guard HP × ratio |
| `rebel_t_max_hp` | 800 | Rebel HP cap |
| `lg_min_cts` | 2 | Guards alive at round start needed for last guard |
| `lg_time_base` | 30 | Round time set when last guard starts (0 disables last guard) |
| `lg_time_per_prisoner` | 10 | Seconds per living prisoner at LG start |
| `lg_time_per_kill` | 10 | Seconds per prisoner killed during LG |
| `lg_time_max` | 90 | Round-time cap during LG |
| `lg_ct_hp_ratio` | 0.7 | LG HP = pooled prisoner HP × ratio |
| `lg_t_max_hp` | 200 | Max HP each prisoner contributes |
| `lg_max_hp` | 125 | Cap on an LG who keeps their own higher HP |
| `lg_apply_lower_hp` | false | Always apply the pooled HP, even when lower |
| `lg_t_weapon` | `""` | Weapon every prisoner gets when LG starts |

## Contract (`api.d.ts`)

Methods: `isEnabled()`, `isInLR(slot)`, `getActiveLRs()`, `isLastGuardActive()`.

Forwards:

- `OnLREnabled { round, prisoners }` — LR turned on (after the "lastrequest" mode was claimed).
- `OnLRStart { lr }` — an LR was set up (state usually `"pending"` during its countdown).
- `OnLREnd { lr, result }` — `prisoner_win` / `guard_win` (death, decision, disconnect),
  `timed_out` (round end / RPS nobody picked), `interrupted` (team change, race participant
  left, special day took the round, plugin unload).
- `OnLastGuardStart { guard, prisoners }`, `OnLastGuardEnd { guard, result }` — end is emitted
  when the last guard dies (`prisoner_win`) or at round end (`guard_win` if they are alive).
- `OnLRColor` (Transform, `color`) — dispatched with `color: ""` when an LR starts. `""` keeps
  the default (no tint, as in the C#); `"#rrggbb"` / a colour name tints both players; `"rainbow"`
  cycles both until the LR ends.

Round mode: LR claims core's `"lastrequest"` mode when it turns on, last guard claims
`"lastguard"`. LG → LR hands over (release then claim). While a special day owns the mode, LR's
claim is refused and LR simply stays off — it is **not** latched off for the round: the "few
prisoners left" check re-runs on every prisoner death/disconnect and when core reports the mode
going `"specialday"` → `"normal"` (Custom and Bunny Hop hand it back right after setup, as those
C# days allowed LRs). When core reports a `"specialday"` mode change, running LRs end as
`interrupted` and LR turns off; last guard **is** disabled for the rest of that round (C#: no
special day allowed last guard except Warday, which never hands the mode back).

## Live-test checklist

Nothing here has run on a CS2 server yet. Verify:

- [ ] Kill prisoners down to `lr_activate_lr_at`: "Last Request activated" chat, `lr.vsnd` plays,
      each living prisoner gets the type menu, round clock set to 60 s, `!logs` shows the line,
      core's mode is `lastrequest`. Running out the clock now gives CTs the win.
- [ ] `!lr` refusals: as CT, dead, LR off, no living CTs, already in an LR / rebelling.
- [ ] `!lr knife`, `!lr 2`, `!lr rps`, `!lr s4s #<userid>`, `!lr cf <name>`; a non-CT target is refused.
- [ ] Guard picker lists only living CTs, greys out busy ones, labels the warden.
- [ ] Both players set to 100 HP / 0 armour; "X is starting a … LR against Y" to all.
- [ ] Damage: outsiders cannot hurt LR players and vice versa (centre-text notice to the attacker);
      players in two different LRs can't hurt each other; the pair can.
- [ ] Knife Fight: guard teleported to prisoner, both frozen (guard 1 s, prisoner 2 s), countdown
      5..1, knives only; cannot pick up guns; loser death ends it.
- [ ] No Scope: rifle menu, countdown, scope never opens (right-click), knives at 30 s, at 60 s the
      HP decision; winner gets knife + AK; only knives can be picked up.
- [ ] Shot for Shot / Mag for Mag: pistol menu, after 5 s both get the pistol empty, the starter
      gets 1 bullet / a full mag, turns alternate when the clip empties, shooting out of turn
      slays the cheater, knives at 30 s, HP decision at 60 s.
- [ ] Gun Toss: knives + deagles (prisoner's empty clip — reserve ammo may NOT be limited to 7,
      see port notes), thrown deagles turn red/blue, neither can pick up until 4 s after both
      threw, an outsider can't grab a deagle near a thrower.
- [ ] Coinflip: guard gets the chat menu; 10 s timeout picks randomly; flavour text sometimes;
      loser is slain.
- [ ] Rock Paper Scissors: both get the chat menu after 3 s; tie restarts; loser slain; results
      line to all; timeout → whoever picked wins.
- [ ] Race (`lr_race_enabled true`): cyan start ring, `!endrace` sets red finish, both
      teleported/frozen 1 s, finish ring grows, first inside wins, loser slain, rings removed.
- [ ] LR ends on death/disconnect with the right winner, adds `lr_time_per_lr` (capped), "X won."
- [ ] Round end with a running LR → `OnLREnd` `timed_out`; next round all LR menus close.
- [ ] `!rebel` as last prisoner: HP message, M249 + knife, core marks rebel; dropping the M249
      drops HP back to the pre-rebel value.
- [ ] Last guard: with ≥ `lg_min_cts` CTs at round start, kill CTs down to one → HP set from the
      prisoners' pool, beacons on everyone, all Ts rebels, chat + centre message, clock reset;
      each T kill adds 10 s and gives a random unarmed T a glock; not triggered once LR is on;
      when prisoners reach the LR threshold LR still turns on (rebels cleared, beacons removed).
- [ ] Special day running (e.g. FFA, Warday): LR and LG never start (`setMode` refused / `OnModeChanged`).
- [ ] Custom or Bunny Hop day: kill prisoners down to `lr_activate_lr_at` → LR turns on as usual
      (mode `lastrequest`); kill guards down to one → last guard does **not** start.
- [ ] Start Custom when prisoners are already at/below the threshold → LR turns on ~0.5 s after the day's setup.
- [ ] `OnLRColor` patched by gangperks (or a test plugin) to `#ff0000` and `rainbow`.
- [ ] `sm_lrdebug enable|disable`, `sm_lrdebug knife @me <bot>`, `sm_lgdebug`.

## Port notes

- **Structure:** one manager module instead of `LastRequestManager` + factory + DI; games are
  small classes over two bases (`TeleportingRequest`, `WeaponizedRequest`). Each LR owns its
  timers, which are all killed when it ends (the C# relied on per-timer state checks).
- **Commands** renamed to s2script style: `css_lr` → `sm_lr` (`!lr`, plus `sm_lastrequest`),
  `css_rebel` → `sm_rebel`, `css_endrace` → `sm_endrace`. The debug subcommands `css_debug lr|lg`
  became `sm_lrdebug` / `sm_lgdebug` (core owns the rest of the debug command and its contract
  has no subcommand registry).
- **Menus** call the flow directly instead of making the client re-run `css_lr …`; every pick
  re-validates. A prisoner/guard pair is reserved while the weapon menu is open (C# could double-book).
- **Type parsing** also accepts spaced/joined full names (`rock paper scissors`) and actually
  maps the `5050` alias (in C# `Enum.TryParse` swallowed it as an invalid number).
- **Race** is ported but off by default (`lr_race_enabled`), matching the C# factory. It now
  becomes `active` after `!endrace` (C# left it pending, so `!endrace` could be repeated).
- **Damage blocking** uses the `OnTakeDamage` SDKHook (zeroes the hit) instead of the C#
  `player_hurt` health refund. Outsider interference is blocked, not punished, as in the C#.
- **Coinflip** only slays on a decided result (C# also slew the prisoner on timeout/interrupt).
- **B4B messages** "won by health / equal health" are now actually sent (the C# built them
  but never printed them).
- **Beacons** are a pulsing ring of beam entities (s2script has no beacon/particle helper).
- **LR colour**: C# only coloured LRs from gang perks (and the lookup never applied); here the
  `OnLRColor` transform decides, default none. The tint is reset to white when the LR ends.
- **Not ported:**
  - LR / LG gang stats and credits (`LRStat`, `LGStat`, eco grants, "LR reached") — owned by
    `@edgegamers/jailbreak-gangperks` from this plugin's forwards.
  - `API.Stats` server stat pushes — no analytics sink; the round log (`core.log`) has the lines.
  - Gun Toss prisoner reserve ammo of 7: `Weapon.setAmmo` accepts but does not yet apply reserve
    (s2script defers `m_pReserveAmmo`), so the prisoner keeps default reserve. `// NOTE` in gun-toss.ts.
  - Last guard kill credits (`grantLastGuardKill`) — gangperks.
- **Runtime unknowns:** whether `WeaponDropPost` fires for every throw (and not for
  `stripWeapons`), whether writing `nextSecondaryAttackTick` each frame fully blocks the scope,
  whether `weapon_fire` sees the clip before the decrement (B4B turn passing relies on it), and
  freeze via `moveType = NONE`.
