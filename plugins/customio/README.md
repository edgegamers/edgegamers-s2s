> Development in this monorepo: run `npm ci` and `npm run check` from the repository root. The root owns releases and dependencies. See [the current contributor guide](../../CONTRIBUTING.md).

# CustomIO for s2script

A TypeScript port of [darkerz7/CS2-CustomIO 1.DZ.17.3](https://github.com/darkerz7/CS2-CustomIO)
by DarkerZ [RUS]. It restores CSS/CS:GO-style map inputs that CS2 lacks, following
[CS2Fixes' custom mapping features](https://github.com/Source2ZE/CS2Fixes/wiki/Custom-Mapping-Features),
so maps written for CS2Fixes or CounterStrikeSharp's CustomIO work unchanged.

## Install

Requires a Linux CS2 server with a current [s2script](https://www.s2script.com/) runtime.
Built with the shared SDK/CS2 versions pinned in the root `package.json`. CounterStrikeSharp is not needed.

1. Run `npm run build -- --filter @edgegamers/s2s-customio` from the repository root.
2. Copy `dist/_edgegamers_s2s-customio.s2sp` to `addons/s2script/plugins/`.
3. Check `sm plugins list` and the server log. The plugin needs no gamedata or engine calls.

After the first registry publication, `s2s install @edgegamers/s2s-customio` installs it.
Do not run it alongside CounterStrikeSharp's CS2-CustomIO or CS2Fixes' custom IO, or each input
is applied twice.

## Inputs

| Input | Receiver | Effect |
| --- | --- | --- |
| `KeyValue <key> <value>` (or `KeyValues`) | any entity | See the keys below |
| `AddScore <n>` | any entity | Adds `n` to the activating player's score |
| `SetMessage <text>` | `env_hudhint` | Sets the hint's message |
| `SetModel <model>` | any entity | Sets the activating player's model, then re-seats them so they do not moonwalk |

| Key | Applies to | Value |
| --- | --- | --- |
| `targetname` | any | New name `*` |
| `origin`, `angles` | any | `x y z`, clamped to ±16384 / ±360 |
| `absvelocity`, `basevelocity` | any | `x y z`, clamped to ±4096 |
| `health`, `max_health` | any | Integer |
| `gravity`, `timescale`, `friction` | any | Float |
| `movetype` | player | `MoveType_t` value 0–11 |
| `speed` | player | Multiplier; sets max speed to 260 × value and the velocity modifier |
| `runspeed` | player | Velocity modifier |
| `target` | any | Name of an existing entity |
| `filtername` | `trigger_*` | Name of an existing filter |
| `entitytemplate` | `env_entity_maker` | Template name `*` |
| `force` | `phys_thruster` | Float |
| `damage`, `damagetype`, `damageradius` | `point_hurt` | Integer |
| `case` | `logic_case` | `<1-32> <value...>` `*` |

`*` These keys, and `SetMessage`, need a pooled string (see below).

Inputs are observed before the entity runs them and always continue, as upstream does. Values
that do not parse are ignored.

## Implementation notes

- s2script cannot allocate the entity system's pooled strings directly. For `targetname`,
  `entitytemplate`, `case` and `SetMessage`, the plugin spawns a scratch `info_target` with the
  value as its `targetname`, reads back the pooled name symbol, and removes the scratch entity.
- `targetname` writes the new symbol to `CEntityIdentity::m_name`, which `Entity.findByName` and
  map I/O read. Unlike `SetEntityName`, it does not update the name's client string-table index.
- `target` and `filtername` copy the found entity's existing name symbol, as CS2Fixes does.
- Schema offsets for string fields come from the runtime's schema resolver, so they follow game
  updates. Any field the runtime cannot resolve disables only the keys that need it.
- Upstream accepted any input name starting with `keyvalue`. This port registers `KeyValue`
  and `KeyValues`, which are the spellings maps use.
- Upstream's debug-build console logging is not ported.

## Test

```bash
npm test --workspace @edgegamers/s2s-customio
```

The suite runs the bundled plugin against a fake engine boundary. Before relying on a release,
smoke-test on a live server with a map that uses these inputs.

## License

GPL-3.0-only, inherited from upstream. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
