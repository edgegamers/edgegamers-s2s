> Development in this monorepo: run `npm ci` and `npm run check` from the repository root. The root owns releases and dependencies. See [the current contributor guide](../../CONTRIBUTING.md).

# s2s-jb — Jailbreak for CS2 on s2script

EdgeGamers' [Jailbreak](https://github.com/edgegamers/Jailbreak) game mode, ported from
CounterStrikeSharp to [s2script](https://github.com/s2script/s2script) as seven small plugins:

| Plugin | What it does |
| --- | --- |
| `@edgegamers/jailbreak-core` | Rounds, rebels, cells, round logs |
| `@edgegamers/jailbreak-warden` | The warden and everything they command |
| `@edgegamers/jailbreak-lastrequest` | Last requests + last guard |
| `@edgegamers/jailbreak-specialdays` | Special days |
| `@edgegamers/jailbreak-rtd` | Roll the dice |
| `@edgegamers/jailbreak-gangperks` | Gangs integration (needs [s2s-gangs](https://github.com/gabehirakawa/s2s-gangs)) |
| `@edgegamers/jailbreak-guards` | Guard queue (`!guard`), prisoner:guard ratio, playtime priority, CT bans |

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how they fit together.

## Build

```bash
npm ci                  # from the repository root
npm run check            # shared build and behavior checks
npm run build -- --filter '@edgegamers/jailbreak-*'
```

## Install

Copy the `.s2sp` files you want into `addons/s2script/plugins/` on the server. `@edgegamers/jailbreak-core` is
required by everything else. `@edgegamers/jailbreak-gangperks` also needs the Gangs plugin; cell/armory zones use
the `@s2script/zones` base plugin when it is installed.

Requires s2script runtime with host API 3 (SDK 0.27+).

## Translations and messages

See [the shared translations guide](../../docs/translations.md) for catalogs, native locale overrides, startup loading and the required chat/console formatting. English is embedded; copy loose catalogs only to customize wording or add locales. Update existing deployed overrides manually when upgrading.
