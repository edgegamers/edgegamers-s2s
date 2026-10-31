# Repository-wide phrases and message formatting

Status: approved by the user on October 31, 2026.

## Intent

Make the repository's player/admin-facing text translatable and give chat and command-console responses a consistent presentation. Apply this to TTT, Jailbreak, SurfTimer, Hide and MAUL. Tell agents and human contributors how to maintain the same standard.

This changes text and localization plumbing, not gameplay, authorization, command names, configuration ownership, publication access or the root workspace. MAUL's source stays public and its registry distribution stays restricted.

## Agreed scope

- Provide complete English phrase coverage across the five products. Preserve and update Hide's existing Russian translations; do not invent additional target languages.
- Cover first-party player/admin-facing chat, command-console responses, menus, HUD/Panorama labels, help text, reason fragments and disconnect wording. Include text in shared libraries and client assets, not only message wrappers.
- Chat and complete command-console messages use `Feature » Message`. Menus, HUD, disconnect reasons and nested phrase fragments have no feature prefix.
- Color-capable chat uses the exact standard below. Console uses its plain-text equivalent because the pinned SDK strips chat colors on console paths.
- The standard takes precedence over legacy prefix customization.
- SurfTimer's shared spectator HUD uses the watched player's language, preserving the existing observable/cached rendering model. Other personal surfaces use the recipient's language.
- Preserve existing translation keys and numbered argument positions. Keep existing behavior, timing, audiences, privacy checks and fallbacks.

Runtime text in maintained staging plugins follows the same rule when it is shown to players/admins. Developer-only probe diagnostics, tests and fixtures do not need translation. This does not add staging packages to the root workspace.

Server logs and exceptions, configuration schema descriptions, documentation, identifiers, protocol values and user-authored content are outside localization. Do not translate player names, map identifiers, operator-authored relays or supplied ban/kick/report reasons. Translate the first-party wording surrounding those values.

## Approaches

Extend the existing native s2script phrase system. TTT and Hide already use native translation loading with embedded English defaults and deployed language overrides; this is the established approach and the one presented in the interview. Keep catalogs beside their owning products/plugins, and keep loading/formatting in the runtime context that owns the output.

A repository-wide runtime translation service would introduce cross-plugin lifecycle dependencies without improving the native fallback mechanism. Keeping hardcoded text and applying a formatter alone would leave menus, HUD and disconnect text untranslated. Neither fits the agreed scope. No new runtime service, dependency, workspace package or custom publication mechanism is needed.

Exact catalog boundaries for products without translations are an implementation choice. Follow existing product ownership and share source through the existing private libraries where useful; do not route formatting through another runtime plugin.

## Chat and console contract

For complete color-capable chat messages:

| Element | Color |
| --- | --- |
| Regular messages, announcements and successes | `{blue}` prefix |
| Warnings, errors and denied actions | `{red}` prefix |
| Separator and message body | `{grey}` |
| Commands, map names, amounts, durations and important values | `{yellow}` |
| Player names | `{blue}` |

Use short, consistent feature names without brackets or community tags. Reuse the existing feature identity where it is useful; choosing the short labels is left to the implementer. Use exactly one separator between prefix and body.

Return to `{grey}` after every highlight. Do not use `{default}` to reset chat body text. Do not use green-family or other legacy chat colors. Routine vote outcomes, including ties and votes that do not pass, use blue; red means a warning, refusal or failure to execute. Classification follows what happened, not whether a function returned false.

Examples:

```text
{blue}RTV {grey}» Vote starts in {yellow}{1} seconds{grey}.
{blue}Admin {grey}» Admin cache reloaded.
{red}RTV {grey}» No maps available to vote on.
```

Console equivalents contain neither color tags nor control bytes:

```text
RTV » Vote starts in 15 seconds.
Admin » Admin cache reloaded.
RTV » No maps available to vote on.
```

For multiline console tables/reports, prefix the response heading or complete explanatory messages. Column labels, table rows and other structured fragments remain plain and keep their layout. Include their first-party labels in the phrase coverage.

Plain nested phrases must not carry a feature prefix or chat colors. A complete outer chat template applies highlights to role names, team names and other important values; player names are always blue even where older code colored them by team or role. Preserve semantic HUD/menu colors through the UI's existing presentation mechanisms rather than embedding chat tags in shared label phrases.

If one existing key reaches both chat and a plain surface, keep the existing key and its positional arguments for the plain text, and add a separate complete chat phrase or wrapper. For example, DNA identification must not put a chat prefix or chat bytes into the HUD.

## Phrase loading and output ownership

Use native `Translations` loading, recipient-language lookup and English fallback. Keep English JSON catalogs as the source of embedded defaults wherever practical, avoiding the duplicate Hide catalog/inline-string maintenance pattern.

Preserve the existing TTT catalog keys and Hide's three existing keys. New keys should be stable and descriptive. Do not renumber, drop or repurpose existing positional arguments; formatting can move a placeholder within the sentence while preserving what it means. Proper nouns and externally supplied values remain arguments, not generated translation keys.

Each runtime owner loads its needed catalog at startup. Keep TTT's startup-only translation behavior and existing owner boundaries. Do not add file polling, hot reload or a new service. Deployed overrides and per-key English fallback remain native SDK behavior. Avoid new key collisions inside a runtime context.

Broad chat announcements resolve the phrase separately for each valid recipient. Console uses the requesting player's language when there is a player, and the SDK server/default language for server-console callers. Preserve current targeting and permission checks.

Separate phrase resolution from output-specific presentation where the same text has multiple destinations. Chat expands supported tags; console strips tags and chat control bytes; plain UI/disconnect paths receive plain phrases. Preserve existing argument-safety behavior, including protection against color-tag injection from names or other untrusted values. Do not expose raw HTML/XML through newly translated UI values; retain existing escaping and safe UI APIs.

HUD localization must retain caching and ownership where possible, with no filesystem reads or catalog reloads during frame updates. Surf's owner renders its HUD in its own language and spectators inherit that rendering. Private TTT report/shop surfaces stay private and use the viewing player's language.

## Product work

| Product | Required work and constraints |
| --- | --- |
| TTT | Standardize existing English chat phrases; extract remaining chat, console and Panorama/report/shop labels and reason fragments. Split mixed chat/HUD phrases. Preserve report HUD refusal/missing-UI chat fallback, identity fences and command tokens. |
| Jailbreak | Replace hardcoded messages in all seven message modules, shared helpers, menus and minigame descriptions. Replace team-colored chat names with blue names and reset the body to grey. Keep optional gangperks optional. |
| SurfTimer | Extract chat, leaderboard/replay labels and HUD/model/client-asset text. Replace legacy lime/bracket formatting and retire the effective `chat_prefix` presentation override. Preserve subject-owned spectator rendering and the center fallback. |
| Hide | Standardize English and Russian phrases and seed from the catalog. Add translated config-reload responses without changing cookie/transmit behavior. |
| MAUL | Translate first-party command/help/table labels and ban/disconnect wrappers. Standardize plugin-owned announcement/relay framing and player-name styling while preserving backend/operator-authored bodies and supplied reasons. Preserve authentication, access checks and restricted publication. |

## Existing configuration and translation overrides

Legacy dedicated prefix settings no longer control output presentation. Removing or retaining an ignored compatibility setting is an implementation choice; document whichever the code does. Never migrate this by silently changing unrelated server configuration.

Operator phrase overrides remain supported. Update all catalogs in this repository and document that operators must update old overridden phrases to the new style. Do not silently overwrite deployed files, reject arbitrary translations at runtime or build a general legacy-text rewriting system. The enforceable repository contract is that shipped messages and dedicated prefix settings follow the standard, and contributors must keep overrides they author compliant.

This migration may change visible English wording and formatting, while preserving the keys/arguments that existing locale files depend on. Where a new key is needed, English fallback supplies the missing entry in other locales. Keep Hide's existing Russian entries correct and provide Russian entries for any new Hide messages added in this pass.

## Contributor and agent guidance

Create one shared guide at `docs/translations.md` containing the user's chat standard and concise author/operator instructions: catalog locations, native locale selection and fallback, startup loading, console/plain-surface rules, placeholder preservation and updating deployed overrides.

Link it from root `AGENTS.md` with a requirement to read it before adding or changing player/admin-facing text. Add the same requirement to `CONTRIBUTING.md`, with a short link from the root README where useful. Update product documentation that currently describes old prefixes or translation usage. Keep the rule in one source rather than copying divergent versions into every plugin.

Use existing build/review workflows to enforce this contract. No new general policy validator, documentation snapshot suite or permanent source-text/format-layout tests. Keep essential translation-behavior tests where they exercise real output routing or correctness.

## Verification and release intent

Run native builds and the relevant existing behavioral suites during each product change, then root `npm run check`. Extend behavioral coverage only where needed to verify English fallback, positional substitution, recipient-language output, sink separation and safety. Preserve existing gameplay/access/release tests; remove incidental assertions that only freeze legacy color choices or wording.

Inspect representative built archives to confirm that the catalog deployment layout and embedded English fallback both work. Audit source and client assets for remaining first-party strings as a temporary completeness check, not a permanent source-text test. Verify that MAUL retains restricted publication metadata and that the root workspace/lockfile structure stays unchanged.

Manual CS2 smoke checks cover one regular, one success and one refused chat action; blue routine vote outcomes; highlights returning to grey; plain console equivalents/tables; prefix-free menus/HUD/disconnect text; private report fallback; per-player locale fallback; and the shared spectator HUD policy. Report unavailable live-host verification explicitly.

Add patch changesets for affected runtime plugins/shared libraries using the existing native workspace release conventions. Do not publish or deploy to game servers as part of this task.

## Builder discretion and boundaries

The implementer chooses small helper interfaces, catalog boundaries, new key names, short feature labels, batching by product and focused behavioral fixtures. Prefer existing native APIs and inlined private libraries. This work does not authorize unrelated workspace maintenance, new gameplay behavior, new languages beyond Hide Russian, a separate translation service, per-spectator HUD rendering, automatic edits to deployed overrides or registry publication.
