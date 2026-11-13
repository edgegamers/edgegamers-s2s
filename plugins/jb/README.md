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

## Chat translations

Each member keeps its English chat phrases in `plugins/<member>/translations/jailbreak-<member>.phrases.json`.
Keys use `jailbreak.<member>.<function>`, with lowercase snake_case names such as `jailbreak.warden.new_warden`.
Existing locale overrides must migrate to these keys; the former `jb_*` phrase keys are no longer aliases.
Edit the phrase values to change wording, prefixes, and colors; keep the `{1}`, `{2}`, … placeholders for message arguments.
System labels render as `Name » message` in chat, with their existing colors. Console, HUD, menu and log output retain their own presentation, including legacy bracketed labels. The Gangs integration leaves the external provider in control of its gang-chat prefix.
Chat uses grey for general text, white for emphasis, yellow for numbers, darkred for executors,
lightblue for failed targets, lightred for targets, red for warnings, green for strings, blue for commands/hints,
and orange for actions. Prefixes stay blue or red. Native color tags and the legacy `{lightblue}` alias
resolve before phrase nesting; menu, console, and HUD output strips chat colors.

On the server, copy edited English files to `addons/s2script/translations/jailbreak-<member>.phrases.json`.
Add partial locale overrides at `addons/s2script/translations/<language-code>/jailbreak-<member>.phrases.json`, using the same phrase keys.
English defaults are embedded in native plugin archives; the SDK does not bundle loose translation files, so copy overrides separately from the checked-in source phrase files.
Missing locale entries fall back to English. Native Jailbreak chat broadcasts resolve phrases for each recipient.
Player names, player-written chat, and map/operator-authored messages remain literal inputs.

Gang perk purchase/equip announcements retain the external Gangs plugin's `sendGangChat` routing.
That API accepts a single string, so these announcements use the server language; other Jailbreak chat resolves each recipient's language.
