# Translation Names and Styling Implementation Plan

> **For agentic workers:** Apply the independent plugin groups in parallel with exclusive directory ownership; review and verify the combined result before completion.

**Goal:** Rename every translation key to owner.feature.function and restyle translations to the user's legacy semantic color guide.

**Architecture:** Rename dictionaries and all consumers together, including dynamically composed keys, locale overrides, metadata fields and test harnesses. Resolve trusted phrase colors before nesting; preserve plain text output in console/menus/HUD where required. Change presentation without changing gameplay, audience, permissions or registry visibility.

**Tech Stack:** Existing TypeScript/s2script workspace, SDK 0.37, native s2s build, retained behavior tests.

**Spec:** The user's 2026-11-11 request and supplied MAUL translation/color reference in this conversation.

## Global Constraints

- Exactly three lowercase dotted segments: owner.feature.function; snake_case within segments.
- Owners: ttt, jailbreak, surftimer, extracommands, decluttr, maul, hide, weaponpaints, arcadescripts.
- Jailbreak uses member as feature (e.g. jailbreak.warden.new_warden). SurfTimer uses meaningful features including hud, timer, records, replay and commands.
- Use descriptive feature/function names; replace opaque text_1/refusal_0/similar extraction labels with their meaning.
- Update every phrase reference, dynamic construction and locale file; remove old keys rather than retaining duplicate aliases. Preserve positional argument meaning and SDK one-based placeholders.
- Preserve existing user-authored wording where practical; scope styling changes to the supplied guide. Prefix labels remain blue or red. Keep authored player/config/map data literal and existing audiences/permissions intact.
- Grey: general text. White: emphasis. Yellow: numbers. DarkRed: admin/executor. LightBlue: failed targets. LightRed: targets. Red: warnings. Green: strings. Blue: commands/hints/tips. Orange: actions.
- True internal errors may use darkred Error: and white emphasis/instructions, following the supplied legacy MAUL examples. Expected denials/bad arguments are warnings, not invented internal errors.
- TTT role mentions: innocent green, traitor red, detective darkblue, including nested role names and descriptions. Do not rename stable domain/item/command identifiers as if they were translation keys.
- Preserve Decluttr's skull, colored team markers, spacing, name/message layout and pawnless-player behavior from the previous user request.
- Preserve the single root workspace/lockfile and native s2s tooling. MAUL distribution remains restricted. No publish/deploy/commit is requested.
- Keep menu/HUD/plain labels appropriate to their output; do not expose raw chat tags/control bytes in plain output. Color wrappers must support the complete native ChatColors palette and aliases used by phrases.

## Tasks

- [x] TTT: rename keys/consumers and restyle all phrases, enforce role colors, verify behavior/builds.
- [x] Jailbreak: rename all seven member phrase dictionaries and consumers, restyle phrases and composed helpers, verify behavior/builds.
- [x] Other plugins: MAUL/Hide/WeaponPaints/ArcadeScripts/SurfTimer rename and style, preserve locales/overrides, verify behavior/builds.
- [x] ExtraCommands/Decluttr: rename and style, preserve activity and legacy layout, verify behavior/builds.
- [x] Integration: audit all dictionary keys and references, add concise naming/style docs and release intent, run native workspace builds/tests and focused review.

## Review Focus

1. Dynamic phrase keys and metadata fields still resolve rather than showing a key to players.
2. Nested translated colors survive SDK brace sanitizing and console/plain rendering strips chat controls.
3. Positional arguments retain number/string/target semantics with no missing data.
4. TTT role text consistently uses its dedicated role colors without changing domain identities.
5. Existing locales and custom layouts remain usable after migrating override keys.

## Completion evidence

All 17 phrase files now use the dotted schema (1,299 unique English keys); dictionary and production-reference audit found no missing or duplicate keys. The existing Russian locale uses the renamed keys. Semantic-color review corrections cover failed inputs, the TTT traitor channel label, and the bonus number returning to string color. Focused rendering regressions were observed failing before the corresponding corrections and pass afterward.

Final `npm run check` passed: 26 native runtime plugin builds, 1,229 Node tests and 153 Bun tests (1,382 total), zero failures or skips. `git diff --check` passed. Existing native SDK JSON-lint/optional-dependency warnings remain. No deployment, publication, workspace dependency change or commit was performed for this task. Existing operator overrides require the renamed keys.
