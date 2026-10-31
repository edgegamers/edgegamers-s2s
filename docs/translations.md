# Translations and message formatting

Read this guide before adding or changing player/admin text, phrase catalogs, chat/console output, menus, HUD labels or disconnect wording. It is the shared standard for contributors and coding agents.

## Chat and console

Use the compact `Feature » Message` format for complete system messages, such as `RTV »`, `Admin »` or `Nominate »`.

| Element | Color |
| --- | --- |
| Regular messages, announcements and successes | `{blue}` prefix |
| Warnings, errors and denied actions | `{red}` prefix |
| Separator and message body | `{grey}` |
| Commands, map names, amounts, durations and important values | `{yellow}` |
| Player names | `{blue}` |

- Use these exact color tags. Green-family colors are reserved for other systems.
- Return to `{grey}` after every highlighted section. Body text resets use `{grey}`, never `{default}`.
- Keep prefixes short and consistent, without brackets or community tags.
- Routine vote outcomes, including ties and votes that do not pass, use blue. Red marks warnings, failures to execute and refused actions.
- Color formatting applies to complete messages sent to an output that supports color tags. Console messages use the same short prefix and wording with colors removed. Prefix console table headings; keep table rows, columns and nested fragments plain.
- Menu/HUD labels, disconnect wrappers and nested phrase fragments remain plain and prefix-free. UI presentation code retains its own semantic palette.
- Preserve existing translation keys and positional meanings of `{1}`, `{2}` and subsequent placeholders. Add a separate complete chat key when a plain phrase also needs a chat announcement.

```text
{blue}RTV {grey}» Vote starts in {yellow}{1} seconds{grey}.
{blue}Admin {grey}» Admin cache reloaded.
{red}RTV {grey}» No maps available to vote on.
```

Console equivalent: `RTV » Vote starts in 10 seconds.` A menu button remains `Vote`, with its presentation handled by the menu.

## Authoring phrases

1. Put every first-party player/admin message and display label in its owner's English catalog. Resolve text at the output boundary with the local phrase helper. Server logs, exceptions, configuration descriptions, protocol identifiers and guarded developer probes remain developer/operator diagnostics.
2. Load the native phrase set during plugin startup with `Translations.load(setName, english)`. Keep the English JSON imported into the plugin as the native seed. Owners format locally; they do not call another plugin merely to translate.
3. Use `phraseFor`/the owner's message factory for complete chat. Use `plainPhraseFor` for UI, disconnect wording, console labels and fragments. Command replies must account for their actual chat or console destination; native replies strip color bytes on console routes.
4. Resolve broadcasts for each recipient. Capture names, results, random choices, amounts and event metadata once before iterating; only phrase lookup and translated nested labels vary. Surf's watched HUD intentionally uses the subject's locale: spectators reuse the subject's cached rendering.
5. Keep parser aliases, enum names, cookie values, item IDs, gameplay comparisons and public wire values stable. Translate their display labels at consumers. First-party Jailbreak round logs use `logEntry` with captured arguments and optional presentation metadata; their raw server/`OnLog` messages remain unchanged. Some plain catalog keys are canonical English labels; resolve those exact keys rather than translating a state value and comparing it later.
6. Pass names and values as positional arguments. The native substitution boundary removes braces from arguments, and local chat helpers remove injected color bytes. Escape text when inserting it into HTML; translation does not provide HTML escaping. Treat authored chat bodies, ban reasons and backend descriptions as opaque content: translate the owned wrapper and preserve the supplied content separately.
7. Exercise meaningful behavior when routing changes: recipient language, per-key fallback, plain sinks, argument safety, recipient authorization and private UI fallback. Use the existing owner tests and native builds. Temporary completeness inventories are useful; permanent tests should verify behavior rather than catalog counts, wording or source layout.

## Catalogs and deployment

| Owner | Source English catalog / native set |
| --- | --- |
| TTT's ten runtime owners | `plugins/ttt/translations/ttt.phrases.json` / `ttt` |
| Jailbreak's seven runtime owners | `plugins/jb/plugins/<owner>/translations/jb-<owner>.phrases.json` / `jb-<owner>` |
| Jailbreak player-console logs | `plugins/jb/packages/shared/translations/jb-logs.phrases.json` / `jb-logs` |
| Surf core | `plugins/surftimer/plugins/surftimer/translations/surftimer.phrases.json` / `surftimer` |
| Surf HUD | `plugins/surftimer/plugins/surftimer-hud/translations/surftimer-hud.phrases.json` / `surftimer-hud` |
| Hide | `plugins/hide/translations/hideplayers.phrases.json` / `hideplayers` |
| MAUL | `plugins/maul/translations/maul.phrases.json` / `maul` |
| Decluttr | `plugins/decluttr/translations/decluttr.phrases.json` / `decluttr` |

Jailbreak owners are `core`, `warden`, `guards`, `lastrequest`, `specialdays`, `rtd` and `gangperks`. Each has its own startup-loaded catalog. TTT's shared catalog is loaded independently by each owner that renders text.

Native `.s2sp` archives embed the English seed in `plugin.js`; they do not install loose translation files. English works without copying a catalog. For operator wording overrides, copy the source catalog to:

```text
addons/s2script/translations/<set>.phrases.json
```

For another locale, copy a partial or complete catalog to:

```text
addons/s2script/translations/<language-code>/<set>.phrases.json
```

The runtime selects the recipient's language and falls back to English per missing phrase. Hide also ships its maintained Russian file under `plugins/hide/translations/ru/`; copy it to the corresponding `ru/` server directory. The other catalogs ship English only.

Translation files load at plugin startup. Reload the plugin after changing deployed wording; config reload commands do not reload phrase files. Keep positional placeholders intact in every override.

Existing deployed phrase files take precedence over the embedded seed. Operators must manually update their custom files to this standard when upgrading; plugins do not rewrite deployed translations or validate their style at runtime. Preserve custom wording while updating complete prefixes, the four colors and grey resets. Old TTT keys and Hide keys retain their positional meanings.

Surf's former `chat_prefix` setting no longer controls output. Hide's legacy prefixes also give way to complete catalog messages. TTT's legacy `phrases_file` setting remains ignored; use the native translation paths above. Custom prefixes belong in complete phrase overrides and must follow this guide.
