> Development in this monorepo: run `npm ci` and `npm run check` from the repository root. The root owns releases and dependencies. See [the current contributor guide](../../CONTRIBUTING.md).

# ArcadeScripts for s2script

A TypeScript port of [supergosciu/ArcadeScripts-CSS 1.0.2](https://github.com/supergosciu/ArcadeScripts-CSS)
by Supergosciuツ. The `jb_arcade_b6` jailbreak map runs its minigames from VScript
`logic_script` entities, and CS2 no longer runs VScript. This plugin gives each of
those scripts a TypeScript replacement and answers the map's `RunScriptCode` inputs
for it, so the arcade games work again.

Licensed GPL-3.0-only, like the original. See [LICENSE](LICENSE) and [NOTICE](NOTICE).

## Install

Requires a Linux CS2 server with a current [s2script](https://www.s2script.com/) runtime.
Built with the shared SDK/CS2 versions pinned in the root `package.json`. It does not need CounterStrikeSharp.

1. Run `npm run build -- --filter @edgegamers/s2s-arcadescripts` from the repository root.
2. Copy `dist/_edgegamers_s2s-arcadescripts.s2sp` to `addons/s2script/plugins/`.
3. Load `jb_arcade_b6`. The plugin does nothing on any other map.

Do not run it next to the CounterStrikeSharp ArcadeScripts, or both answer every input.

The plugin learns the map's named entities as they spawn, as upstream does. If it is
loaded in the middle of a map, the scripts start working after the next map change.

## How it works

At each `round_start` the plugin reads the `vscripts` keyvalue of every named
`logic_script` and builds the matching port. At `round_prestart` it tears them down,
along with their timers. A `RunScriptCode` input such as `Move(!activator, 4)` is parsed
the way upstream parses it: arguments are split on commas, and each one is a script
constant (such as `HurterTwo`), `!activator`, `!caller`, or a literal of the function's
parameter type. A malformed call is logged and ignored.

| `vscripts` | Port | | `vscripts` | Port |
| --- | --- | --- | --- | --- |
| `bee.nut` | Bee (spelling bee, math) | | `grab.nut` | Grab |
| `blob.nut` | Blob | | `has_weapon_noname.nut` | HasWeapon |
| `blockjump.nut` | BlockJump | | `hurt.nut` | Hurt |
| `car_secret.nut` | CarSecret | | `item_in_area.nut` | ItemInArea |
| `cell_instructions.nut` | CellInstructions | | `lightduel.nut` | LightDuel |
| `cellrewards` | CellRewards | | `lightning.nut` | Lightning |
| `colors.nut` | Colors | | `lunge.nut` | Lunge |
| `compass.nut` | Compass | | `playsoundat.nut` | PlaySoundAt |
| `darude.nut` | Darude | | `poison.nut` | Poison |
| `decathlon.nut` | Decathlon | | `rocketjump.nut` | RocketJump |
| `decoys.nut` | Decoys | | `rogue.nut` | Rogue |
| `fidgetspinner.nut` | FidgetSpinner | | `strafe_jump.nut` | StrafeJump |
| `flight.nut` | Flight | | `surf.nut` | Surf |
| `follower.nut` | Follower | | `tapper.nut` | Tapper |
| | | | `timer.nut` | SurfTimer |

## Differences from upstream

- **Reading `vscripts`.** s2script has no accessor for `m_iszPrivateVScripts`, so the plugin
  reads it through the entity's address (`src/vscripts.ts`). Before trusting a read it checks
  that the entity name at the same layout matches the name the host reports. If a CS2 update
  moves the fields, the check fails, the scripts stay off, and the server log says so.
- **Scripted damage and the kill feed.** Upstream renames its `point_hurt` entities to custom
  weapon classes so the kill feed shows lightning, poison, nuclear and wrecking-ball icons, and
  rewrites the attacker in a damage hook. s2script cannot rename an entity's class, so the port
  deals the same damage directly with the same attacker. Kill credit is kept; the custom icons
  and their precache are gone.
- **The JIT warmup is dropped.** Upstream swallows the first `RunScriptCode` of a map to warm up
  .NET's JIT. TypeScript does not need it, so the first input runs.
- **Surf game membership** is kept in memory instead of being written into each player's
  `vscripts` keyvalue.
- **Upstream defects fixed:** Colors aliased a static side table and later cleared it, so after
  the first "Go North/East/South/West" round that side punished nobody until the server restarted; PlaySoundAt shared one
  instance's sound count with every other instance; LightDuel and Blob compared wrapper objects,
  not entities, when they looked up sprites. A Colors player who fails both halves of a two-part
  round loses the configured damage once, as upstream's queued `SetHealth` inputs effectively do.
- **Bee's easy list has 449 words** while upstream picks an index up to 449, which fails one
  time in 450. The port picks within the list.

Everything else follows upstream, including its timing, odds, text and quirks.

## Testing on a server

The automated tests (`npm test`) run the bundled plugin against a fake engine. They cover
script discovery, `RunScriptCode` parsing, rebuild per round, and a few games. The port has
not been run on a live server yet. A first live check on `jb_arcade_b6`:

- [ ] The server log has no `[ArcadeScripts]` errors after the first round starts.
- [ ] Rogue draws its board and the player moves when the direction buttons are used.
- [ ] Tapper counts taps, buys upgrades, ranks booths and moves the platforms.
- [ ] Colors runs rounds at each difficulty and damages players who fail.
- [ ] Light Duel and Blob draw and move their sprites.
- [ ] Bee shows a word and definition, takes keyboard input, and grades it.
- [ ] Lightning, Poison, Grab, Lunge and the decoys work when their secret items are picked up.
- [ ] Surf, Decathlon and Strafe Jump send winners to the podiums.

Chat answer announcements use `translations/arcadescripts.phrases.json`, with embedded English as a fallback. Copy phrase files to `addons/s2script/translations/`; another language belongs under its language-code subdirectory. Labels resolve separately for each recipient while the spelling word or math solution stays unchanged. Reload the plugin after editing phrases.
