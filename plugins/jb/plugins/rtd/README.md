# @edgegamers/jailbreak-rtd — roll the dice

Each player can hold one rolled reward at a time. It is granted shortly after their next spawn
(outside warmup) and then cleared, so in practice it is one roll per player per round. Ported from
`Jailbreak.RTD` (+ `Jailbreak.Debug/Subcommands/DebugRTD.cs`).

## Commands

| Command | Who | What |
| --- | --- | --- |
| `!rtd` / `sm_rtd` | everyone | Roll the dice. Alive players can only roll between round end and the next round start (or in warmup); dead players any time. Needs `rtd_minplayers` players on T/CT. |
| `!rtd <index>` | root (`z`) | Skip every check and roll reward `<index>` from `!rtdstats` (`-1` = random). |
| `!rtdstats` / `sm_rtdstats` | everyone | List every reward in the pool right now with its chance (chat + console). |
| `!autortd` / `sm_autortd` | `autortd_flag` holders | Toggle rolling automatically at every round end (saved as a cookie). |
| `sm_debugrtd` | root (`z`) | Center menu of every reward. Picking one makes it your pending reward (C# `css_debug rtd`). |

## Config (`s2script.config`)

| Key | Default | Meaning |
| --- | --- | --- |
| `rtd_minplayers` | `3` | Minimum players on T/CT before rolling is allowed. `-1` also makes `!autortd` refuse (C# behaviour). Was `css_edgegamers_jailbreak-rtd_minplayers`. |
| `autortd_flag` | `"o"` | SourceMod admin flag letters needed for auto-RTD (every letter required; `""` = everyone). The C# default was the `@ego/dssilver` permission; map it to whichever custom flag your donors have. Was `css_autortd_flag`. |

## Contracts

- Publishes nothing.
- **Hard:** `@edgegamers/jailbreak-core` `^1.1.0` — `OnRoundStart` (rolling window closes), `OnRoundEnd` (rolling window opens,
  round-long effects expire, auto-RTD runs), `log` + `describe` (a "Granted X to …" round-log line),
  `giveBomb` + `skipRandomBombNextRound` (**Bomb**).
- **Optional:** `@edgegamers/jailbreak-warden` — `guaranteeWarden(steamId)` for **Guaranteed Warden**.
  `@edgegamers/gangs` — `grantPlayer(steamId, amount, "rtd")` for every **credit** reward (only while `isReady()`).
  Both are followed with `watchOptional`; while one is absent its rewards are simply not in the pool
  (and `!rtdstats` shows the re-normalised chances).
- Cookie `jb_rtd_auto` (`"Y"`/`"N"`, unset = on) via `@s2script/sdk` `Cookies` (clientprefs).

## The pool

`src/pool.ts` is the C# `RewardGenerator` list as data — same 48 entries, same order, same weights
(`1/2`, `1/5`, `1/10`, `1/20`, `1/100`, `1/800`, `1/5000` and the C# multipliers). The pick is the
C# walk: roll in `[0, Σ eligible weights)`, subtract weights in order, first to reach `<= 0` wins.
Team restrictions as in C#: weapons (incl. Fake Bomb) are prisoner-only except the guard-only G3SG1;
Spawn Green, Random Teleport and Bomb are prisoner-only; Guaranteed Warden is guard-only.

Credits are paid **at roll time** (as in C#); every other reward at spawn. Round-long effects
(Cannot Use/Scope/Left-/Right-Knife, Chat Spy) end at round end.

## Live-test checklist

Nothing here has run on a real server yet. With ≥3 players on teams:

- [ ] `!rtd` while alive mid-round → "You can only roll when round ends or while dead."; dead → rolls; second `!rtd` → "You already rolled …".
- [ ] `!rtd` with fewer than `rtd_minplayers` on teams → "Rolling is disabled."
- [ ] Roll at round end; next spawn grants it ~1 frame later and the round log (`!logs`) shows "Granted … to …" (not for Nothing).
- [ ] Guard rolls a prisoner-only reward? Must never happen; check a few `!rtd <index>` as root on the wrong team: the reward stays pending until a spawn on the right team.
- [ ] `!rtdstats` percentages sum to 100; credit rows disappear when Gangs is unloaded, Guaranteed Warden when warden is unloaded.
- [ ] HP (110/150/50/1) and Armor (15/150) values after spawn.
- [ ] Weapon rewards (healthshot, decoy, flash, HE, smoke, molotov, zeus, glock; G3SG1 for CT); Fake Bomb gives a C4 that does **not** explode on E.
- [ ] Bomb (`!rtd <index>` as root, as T): next round no random C4 is handed out; ~1 s after your spawn you get the jihad C4 + core's two chat lines; E arms and detonates it.
- [ ] Cannot Use Snipers/Heavy/SMGs/Pistols/Rifles/Guns/Grenade/Utility: walking over such a weapon does not pick it up; buying is not blocked (C# parity: pickups only). Cannot Use Knives strips your knife on spawn.
- [ ] Cannot Scope: AWP/SSG/auto right-click does nothing all round. Cannot Left-/Right-Knife: that knife attack does nothing (check with the default T knife **and** a skinned knife).
- [ ] No Weapon: weapons removed ~1s/2s/4s after spawn.
- [ ] Spawn Green: prisoner model tinted green. Spawn Transparent: model ~73% transparent.
- [ ] Random Teleport: prisoner lands on a spawn point / teleport destination.
- [ ] Chat Spy: team chat from the other team appears to the spy as `[Spy] (CT) name: text`; ends at round end.
- [ ] Guaranteed Warden: rolled as CT, next round's `!w` / queue makes you warden.
- [ ] Credits: wallet changes immediately on roll; a ±5000/10000 roll announces the jackpot to everyone.
- [ ] `!autortd` with/without `autortd_flag`; toggled-on players auto-roll at round end; preference survives reconnect.
- [ ] `sm_debugrtd` menu sets the chosen reward; hot-reloading the plugin keeps pending rewards.

## Port notes

- **Bomb reward** goes through `@edgegamers/jailbreak-core` 1.1.0 (core owns the jihad C4): rolling it calls
  `skipRandomBombNextRound()` (C# `PrepareReward` → `DontGiveC4NextRound`), and 1 s after the
  next spawn (C# 64 ticks) `giveBomb(slot)` hands over a real jihad C4. Fake Bomb is a plain
  `weapon_c4`, which core no longer treats as a jihad bomb.
- **Chat Spy** used MAUL's spy service in C#; here it is native: team chat (`clients.onSay`,
  `teamonly`) is copied to spies on other teams. Always enabled (C# needed MAUL loaded).
- **Random Teleport** uses `info_teleport_destination` + `info_player_terrorist/counterterrorist`
  origins (the C# `MapUtil.GetRandomSpawns` also preferred `SPAWN`/`SPAWN_AUTO` zones). `@s2script/zones`
  is not used — spawn entities only. Always enabled (C# required the zone manager).
- **Cannot Use** blocks pickups through the first-class `items.onCanAcquire` gate (C# hooked
  `CanAcquire` and also only blocked `PickUp`). Weapon class comes from a def-index table in
  `src/weapons.ts`; `weapon_knife_t` was added to the knives set (C#'s list missed it).
- **Per-tick blocks** write `nextPrimary/SecondaryAttackTick` every frame to `gameTime*64 + 500`
  (the SDK exposes no tick counter; CS2 is fixed 64-tick).
- **AmmoWeaponReward** is implemented (`ammoWeapon` kind) but, as in C#, every entry is commented out
  of the pool. Reserve ammo is not settable in SDK 0.27 (`Weapon.setAmmo` defers `reserve`).
- **Auto-RTD** calls the roll directly instead of executing `css_rtd` as the player, and only for
  players whose cookies are loaded. The C# `@ego/dssilver` permission became the `autortd_flag` letters.
- A roll whose `prepare` fails (credit roll while Gangs just went away) now says so and stores
  nothing; the C# printed "You rolled …" anyway.
- No special-day/LR restriction: the C# RTD has none (rewards are granted at spawn, before any
  mode is claimed), so none was added.
- `css_debug rtd` became its own command, `sm_debugrtd` (core owns the other debug commands).
- Pending rewards survive a hot reload (`OnPluginState`), and are dropped on disconnect.
