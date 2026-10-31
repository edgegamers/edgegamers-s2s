# @edgegamers/jailbreak-core

The Jailbreak round: round number/phase, the round **mode** (who owns the end of the round),
rebels and the jihad C4, the cell doors, the round log, and the admin debug commands. Every other
JB plugin hard-depends on core; core depends on nothing (optionally on `@s2script/zones`).

Ported from `Jailbreak.Generic`, `Jailbreak.Rebel` (+ `C4Bomb`), `Jailbreak.Logs`,
`Jailbreak.Debug` (core-owned subcommands), `MapUtil`/`RoundUtil`/`PlayerUtil`/`TeamUtil`, and the
auto-open-cells half of `WardenBehavior`.

## Files

| File | What |
| --- | --- |
| `src/plugin.ts` | wiring: publish, game events, commands, named publics |
| `src/round.ts` | round/phase/mode from `round_start` / `round_freeze_end` / `round_end` + GameRules warmup |
| `src/rebels.ts` | mark/unmark, colour fade + red screen pulse, damage listener |
| `src/c4.ts` | the jihad C4 |
| `src/cells.ts` | open-cells button detection, zones, auto-open timer |
| `src/logs.ts` | the round log, listeners, `!logs`, round-end dump |
| `src/admin.ts` | `sm_debug` subcommands |
| `src/messages.ts` | every player-facing string |
| `src/round-state.ts`, `src/rebel-book.ts`, `src/cell-logic.ts`, `src/log-book.ts`, `src/c4-logic.ts` | pure logic, unit-tested in `test/` |

## Commands

| Command | Who | What |
| --- | --- | --- |
| `sm_logs` / `!logs` | admins with **any** of ban / generic / kick (or root); dead players too if `logs_allow_dead` | Print this round's log to your console (server console when run from rcon). |
| `sm_debug` | root | List the subcommands below. |
| `sm_debug markrebel <target> [seconds]` | root | Mark target(s) rebel (default time when omitted). Goes through `OnRebelRequested`. |
| `sm_debug pardon <target>` | root | Un-rebel target(s). |
| `sm_debug endround` | root | `mp_ignore_round_win_conditions 0` + round time to 0. |
| `sm_debug settime <seconds>` | root | Set the remaining round time. |
| `sm_debug testnearopen` | root, alive | Press the `func_button` nearest to you (tests a map's cell button). |
| `sm_debug color [<alpha>] \| [<alpha>] <r> <g> <b>` | root, alive | Tint your own model (debugging colour stacking). |

`<target>` is a SourceMod target (`@t`, `@ct`, `#userid`, name, …), immunity-filtered.
The warden's `!open` belongs to `@edgegamers/jailbreak-warden`, which calls `core.openCells("warden")`.

## Config (`s2script.config`)

| Key | Default | Was | Meaning |
| --- | --- | --- | --- |
| `rebel_time` | 45 | `css_edgegamers_jailbreak-rebel_time` | Seconds a prisoner stays a rebel (also the scale of the colour fade). |
| `c4_give` | true | `css_edgegamers_jailbreak-c4_give` | Give a random (human, alive) prisoner a jihad C4 1s after round start (skipped once after `skipRandomBombNextRound()`). |
| `c4_delay` | 0.75 | `css_edgegamers_jailbreak-c4_delay` | Seconds from arming to the explosion. |
| `c4_radius` | 350 | `css_edgegamers_jailbreak-c4_radius` | Explosion radius (units). |
| `c4_damage` | 340 | `css_edgegamers_jailbreak-c4_damage` | Damage at the centre, linear falloff to 0 at the radius. |
| `opencells_delay` | 60 | `css_edgegamers_jailbreak-warden_opencells_delay` | Auto-open the cells this many seconds after round start (-1 = never; never in warmup). |
| `opencells_snitch` | false | `css_edgegamers_jailbreak-warden_auto_snitch` | On auto-open, say how many prisoners were still in the cells. |
| `logs_allow_dead` | false | — | Also allow dead players to use `!logs`. |

## Contract (`api.d.ts`) summary

- **Round**: `getRound()` → `{ round, phase, mode, startedAt }`. Phases: `waiting` (map start, no
  round yet) → `warmup`/`freeze` on `round_start` → `live` on `round_freeze_end` → `ended` on
  `round_end`.
- **Mode**: `setMode(mode)` — from `normal` anything may be claimed; from a claimed mode only
  `normal` (release) is accepted (`lastrequest → lastguard` is refused; release first). Reset to
  `normal` at every round start. `OnModeChanged` fires only when the mode actually moves.
- **Order at round start**: mode reset (`OnModeChanged` if it was claimed) → log cleared → rebels
  cleared (`OnRebelChanged` reason `"round"` each) → C4 state reset → cells closed + auto-open armed
  → **`OnRoundStart`**. `OnRoundLive` on freeze end, `OnRoundEnd { winner }` on round end.
- **Rebels**: `markRebel(slot, seconds, reason)` only for living prisoners; refused (returns the
  current state) after `disableRebelsForRound()`. Otherwise `OnRebelRequested` (Hook) is dispatched — `Handled`/`Stop` veto. `seconds <= 0`
  uses `rebel_time`; re-marking refreshes the timer. `OnRebelChanged` fires on every transition:
  reasons on mark = the request reason (`damage`, `c4`, `admin`, …); on clear = `expired`, `death`,
  `disconnect`, `round`, or the `unmarkRebel` reason.
- **Cells**: `openCells(source)` presses the cell button (see below); returns false if nothing
  suitable was found. `OnCellsOpened { source }` on every successful press; `cellsOpened()` is true
  after the first success this round.
- **Log**: `log(message)` appends a line (timestamp = seconds since freeze end); every line is also
  emitted as `OnLog`. `describe(slot)` → `"Name #userid [CT]"`, `"Name #userid [T, rebel]"`,
  `"Name #userid [spec]"` (warden status is not core's — warden logs its own lines).
- **Jihad C4** (since 1.1.0): only C4s core hands out are jihad bombs — the random round-start
  bomb and `giveBomb(slot)` (living prisoners only; returns false otherwise). Any other `weapon_c4`
  (RTD's Fake Bomb, a map's bomb) is a plain C4. Tracking is cleared at round start, as in the C#.
  `skipRandomBombNextRound()` suppresses the next round's random bomb (consumed by the next round
  start while `c4_give` is on; with `c4_give` off it stays pending — C# `DontGiveC4NextRound`).
- **C4 icon**: `OnBombIcon` (Transform, writable `icon`) is dispatched once per detonation with the
  default `"weapon_c4"`; `""`/`"default"` from a patcher fall back to it.
- **C4 kills** (since 1.1.0): `OnBombDetonated { player, killed, killedGuards }` after each
  detonation's damage is applied and the bomber slain (also with 0 kills). `killed` excludes the
  bomber; only guards are damaged, so `killedGuards === killed` today. Gang credits for C4 kills
  are paid by `@edgegamers/jailbreak-gangperks` from this forward.

## Zones (optional `@s2script/zones`)

Zone tags (or zone names starting with the tag) used by Jailbreak, mirroring the C# `ZoneType`:

| Tag | Meaning | Used by |
| --- | --- | --- |
| `cell` | the cell area(s) — where prisoners start | core (auto-open "still in cells"), specialdays |
| `cell_button` | a point at the cell-door button (any small box around it) | core `openCells` (preferred source) |
| `armory` | armory / places CTs should not camp | other plugins |
| `secret` | secret areas Ts may try to reach | other plugins |
| `spawn` | a good spawn/teleport point | specialdays, LR |
| `playfield` | multi-purpose game area (soccer field, trivia, …) | warden/other plugins |
| `zone_limit_t` | only Ts can get here | do-not-teleport |
| `zone_limit_ct` | only CTs can get here | do-not-teleport |
| `solitaire` | a place you can get locked in | do-not-teleport |
| `center` | a point at the map centre | specialdays |
| `hazard` | dangerous / unsafe to teleport into | do-not-teleport |

How the cells are opened (`MapUtil.OpenCells`):
1. A `cell_button` zone exists → press the `func_button` nearest to its centre (any button counts).
2. Otherwise find `func_button`s by name, loosening the heuristic until one matches: name has
   *cell*+*door* → name has *cell* → target has *cell*+*door* → target has *cell* → has any target
   → any. One match wins; several → the one nearest the CT spawn. Without a zone the press only
   counts as success at "target has *cell*" or stricter (looser matches are still pressed).
3. Press = `Unlock` then `Press`, with a living guard as the activator.

"Prisoners still in cells" (auto-open message): inside a `cell` zone box, or — with no `cell`
zone — inside the 2D hull of the T spawns or within 200 units of it.

## Live-test checklist

Nothing here has been run on a CS2 server. Verify:

- [ ] Plugin loads; `@edgegamers/jailbreak-core` publishes; no errors with and without `@s2script/zones` loaded.
- [ ] `getRound()` across a map: `waiting` → `warmup` during warmup → `freeze` → `live` after freeze
      time → `ended`; round counter increments; `startedAt` set. Late reload mid-round picks up phase.
- [ ] `setMode` claim/refuse/release; mode back to `normal` and `OnModeChanged` emitted at round start.
- [ ] T shoots a CT → T turns red, red screen pulse each second, fades to white over `rebel_time`,
      "You are no longer red." on expiry; `OnRebelChanged` both ways.
- [ ] T hurting a CT while mode is `lastrequest`/`lastguard`/`specialday` does **not** mark.
- [ ] Rebel dies / disconnects / new round → cleared (no chat line), colour reset at round start.
- [ ] A consumer returning `Handled` from `OnRebelRequested` vetoes the mark.
- [ ] Rebel colour keeps any translucency another plugin set (alpha preserved).
- [ ] Round start: a random human T gets a C4 + two chat lines after ~1s (`c4_give`).
- [ ] Holding the C4 out and pressing **E** plays `jb.jihad`, marks the bomber rebel, explodes after
      0.75s: `jb.jihadExplosion` + `explosion_c4_500` particle (needs the JB sound/particle content
      on the server and clients — check precache works when the plugin is loaded before map start).
- [ ] CTs in radius take falloff damage; lethal hits show the bomber + `weapon_c4` icon in the kill
      feed (**verify** `setInt("attacker", slot)` is the right encoding and `weapon_c4` renders) and
      the bomb doesn't drop (removed). Bomber dies.
- [ ] Pressing E with the C4 *not* deployed does nothing; a plain C4 from another plugin (RTD Fake
      Bomb, `give weapon_c4`) does nothing either; `giveBomb(slot)` (RTD Bomb reward) gives a working one.
- [ ] `skipRandomBombNextRound()` → next round no random C4 is handed out; the round after, it is again.
- [ ] `OnBombDetonated` fires once per detonation with the guard-kill count (0 when nobody was in range).
- [ ] A jihad C4 a prisoner still holds at the next round start is a plain C4 (C# parity).
- [ ] `openCells` on a few maps (cell+door named buttons, target-named, no names); with a
      `cell_button` zone; `OnCellsOpened` emitted.
- [ ] Auto-open after 60s when nobody opened; "Cells were auto-opened." only if Ts still inside;
      not in warmup; timer cancelled at round end.
- [ ] `!logs` as admin prints the round log to console; non-admin refused; `sm_logs` from rcon prints to
      server console. Round end dumps logs to every console and the server console.
- [ ] Log lines: damage, kills (incl. "The world …"), grenades, button presses / breakables with
      name -> target, rebel on/off, C4 armed/detonated, pickups during the live phase.
- [ ] `sm_debug markrebel @t 30`, `pardon`, `settime 120`, `endround`, `testnearopen`, `color 128`.

## Port notes

- **Simplified**: the DI layers (`IRebelService`, `IC4Service`, `ILogService`, state trackers,
  formatting views) are plain modules. Generic `BaseStateTracker`s are replaced by core's own
  per-round reset and the `OnRoundStart` forward other plugins hook.
- **Moved to core**: the cell auto-open timer (was in `WardenBehavior`). Config renamed
  `css_edgegamers_jailbreak-warden_opencells_delay` → `opencells_delay`, `css_edgegamers_jailbreak-warden_auto_snitch` → `opencells_snitch`.
- **LR damage rule**: C# skipped rebel marking when the attacker was in an LR; `@edgegamers/jailbreak-lastrequest`
  does the same by vetoing `"damage"` requests for LR participants through `OnRebelRequested`
  (outsider damage to LR players is already blocked by the LR damage rules).
- **C4 & LR**: C# spared CTs who were in a *different* LR from the bomber. Core does not know LR
  pairs, so a detonation damages every guard in range. In practice the bomber is the LR prisoner.
- **Only core's own C4s are jihad bombs** (as C# tracked its `bombs` dictionary), by entity ref
  (index + host id, so a later C4 reusing the index is not mistaken for one). A core hot reload
  forgets the tracked bombs (they become plain C4s until the next round).
- **Kill-feed attacker**: rewritten in a `player_death` pre-hook via `ev.setInt("attacker", slot)` +
  `ev.setString("weapon", icon)` — the slot encoding is a guess at what CS2 expects (see checklist).
- **Rebel colour reset at round start** only touches previous rebels (C# repainted everyone white).
- **Explosion particle** is removed after 5s (C# leaked it). Spawned with keyvalues
  `effect_name` / `start_active` / `origin`.
- **Logs**: label format is `Name #userid [T, rebel]` (no colours; the warden tag is warden's job).
  `!logs` keeps C#'s permission (ban OR generic OR kick); `logs_allow_dead` is new and off.
- **Not ported**:
  - `LogEntityParentListeners` (weapon drop/pickup with previous owner) — the SDK has no
    entity-parent-changed listener; approximated by logging non-silent `item_pickup` during the live
    phase. Drops are not logged.
  - Button press `output.Connections.TargetDesc` — the SDK has no output-connection access; the
    button's `target` keyvalue is logged instead.
  - Gangs economy rewards (rebel-kill credits by weapon class, 25 credits per C4 kill) and the gang
    bomb-icon cache — gangs bridge = `@edgegamers/jailbreak-gangperks` (it patches `OnBombIcon` and pays C4-kill
    credits from `OnBombDetonated`).
  - `DontGiveC4NextRound` / `TryGiveC4ToPlayer` are now the contract methods
    `skipRandomBombNextRound` / `giveBomb` (1.1.0).
  - `API.Stats` pushes (`JB_REBEL_STARTED`, `JB_BOMB_*`) — the `OnLog` forward is the sink.
  - Debug `lr`, `lg`, `st`, `rtd` (owned by lastrequest / warden / rtd), `zone` (the zones plugin has
    its own editor), `csay` and `centerhud` (HTML centre-text dev toys).
