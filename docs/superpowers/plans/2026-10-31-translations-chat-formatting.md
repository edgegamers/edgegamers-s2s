# Phrases and Chat Formatting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Localize all first-party player/admin output across the five products and apply the approved chat/console presentation standard.

**Architecture:** Extend native s2script translations, with embedded English JSON defaults and native deployed/locale overrides loaded in each runtime owner's context. Keep plain surfaces separate from complete chat messages, resolve broadcasts per recipient, and share helpers through existing inlined libraries only.

**Tech Stack:** TypeScript, s2script SDK 0.34.0, CS2 bindings 0.22.0, Node 24, npm 11.19.0, existing Node/Bun behavior suites, native `s2s build`.

**Spec:** [Approved design](../specs/2026-10-31-translations-chat-formatting-design.md).

## Global Constraints

- One root npm/s2s workspace and lockfile; no new runtime service, dependency or workspace package.
- English phrase coverage for TTT, Jailbreak, SurfTimer, Hide and MAUL; preserve/update Hide Russian, add no other shipping locales.
- Preserve existing translation keys and numbered argument meanings/positions.
- Complete chat uses `Feature » Message`: blue regular/success/vote-outcome prefix; red warning/error/refusal prefix; grey separator/body; yellow commands/maps/amounts/durations/important values; blue player names; grey after each highlight.
- Exact chat color tags only; no `{default}` body resets or legacy colors. Console uses the plain equivalent.
- HUD/menu/disconnect/nested fragments stay plain and prefix-free. Console table headings are prefixed; structured rows/fragments remain plain.
- All first-party player/admin text is in scope, including shared code/client assets and maintained staging plugins. Logs, developer probes, protocol IDs, configuration descriptions, documentation and authored remote/player content are outside localization.
- Native startup loading, English fallback and file overrides; no hot reload or automatic deployed-file edits.
- Existing prefix customization cannot control framing. Document operator migration for old phrase overrides.
- Preserve gameplay, command names, permissions, audiences, privacy, report HUD/chat fallback, optional gangperks and owner boundaries.
- Surf spectators inherit the watched player's localized HUD; retain current Panorama observability and center cached rendering.
- MAUL stays registry-restricted and publishable; do not publish/deploy in this task.
- Behavioral tests only; no new permanent source-layout/wording/policy validator tests.

## Review Focus

- Different recipient languages on the same broadcast: each gets its own phrase and per-key English fallback; test at the owning chat boundary in Tasks 2–4.
- A phrase used by both chat and HUD/console: plain sinks receive no tags, bytes or feature prefix where inappropriate; exercise mixed DNA/UI and command reply paths in Tasks 1–3.
- Names/reasons containing braces, color bytes or markup: preserve native argument safety and UI escaping; test substituted values in Tasks 2, 4 and 5.
- Missing/refused private report UI and reused player slots: keep chat fallback, identity fences and original targeting; retain/report existing integration evidence in Tasks 2 and 5.
- Legacy prefix settings and missing deployed catalogs: shipped defaults still produce compliant output; add Hide seed-fallback and Surf prefix-override output cases in Tasks 1 and 4.

---

## Task 1: Hide phrases and sink separation

**Files:**
- Create `plugins/hide/src/phrases.ts`.
- Modify `plugins/hide/src/plugin.ts`.
- Modify `plugins/hide/translations/hideplayers.phrases.json` and `plugins/hide/translations/ru/hideplayers.phrases.json`.
- Extend `plugins/hide/test/harness.mjs` and `plugins/hide/test/plugin.test.mjs`.

**Interfaces:**
- Consume native `Translations.load`, `Translations.translate` and `CommandInvocation.replySource`/reply methods.
- Produce local `loadPhrases(): void`, `phraseFor(slot: number, key: string, ...args: (string | number)[]): string` and `replyPhrase(cmd: CommandInvocation, key: string, ...args: (string | number)[]): void`. No new public plugin API.

- [x] Extend the harness's native translation double with deployed-file overrides, recipient locales, numbered substitution and English fallback. Keep existing cookie/transmit behavior unchanged.
- [x] Add failing behavior cases: embedded English works without deployed catalogs; Russian toggle/reload success/refusal use the caller's language; console reload output is prefixed plain text; malformed reload retains working settings and sends a red chat failure. Assert semantic output/routing, not every English sentence.
- [x] Run `npm test --workspace @edgegamers/s2s-hide` and confirm the new cases fail for the expected missing behavior.
- [x] Implement the local helper with JSON English defaults; preserve `Player.Hide.Enabled`, `Player.Hide.Disabled`, `Player.SaveFailed` and add stable reload keys. Update English/Russian to the approved palette, classifying failed saves/reloads red.
- [x] Route toggle/reload replies through the helper, without translating diagnostic logs or changing command access/cookie/transmit behavior.
- [x] Run `npm run build -- --filter @edgegamers/s2s-hide` and `npm test --workspace @edgegamers/s2s-hide`; require successful build and all tests passing.

## Task 2: TTT complete phrases and plain surfaces

**Files:**
- Modify `plugins/ttt/translations/ttt.phrases.json`.
- Modify `plugins/ttt/packages/contracts/phrases.ts` and `test/phrases.test.ts`.
- Modify Core `src/core/msgs.ts`, `src/commands.ts`, `src/core/ui-model.ts`, `src/core/ui-owner.ts`, `src/game/logger.ts`, `src/game/roles.ts` and affected `src/cs2/` output paths.
- Modify output producers under `plugins/ttt/plugins/{communication,reports,items,shop,special,karma,world,bodies}/src/` and UI `src/ttthud.ts`/`src/plugin.ts` where the audit finds human-facing strings.
- Modify maintained staging output in `plugins/ttt/tools/staging/weapon-control/src/plugin.ts` as needed; leave probe diagnostics alone.
- Extend existing phrase/UI/report/archive behavior fixtures only where output routing changes.

**Interfaces:**
- Preserve `loadPhrases(): void`, `phraseFor(slot, key, ...args): string`, `msg`/`msgFor` contracts and owner-local loading.
- Add `plainPhraseFor(slot: number, key: string, ...args: (string | number)[]): string` to the contracts helper for actual plain sinks. `phraseFor` remains chat-ready and uses native safe positional substitution.
- Do not change Protocol2 declarations or move formatting into a cross-owner service.

- [x] Extend phrase behavior tests with recipient-language fallback and a mixed-sink key: chat output contains standard framing, while its plain counterpart has no chat tags/bytes. Keep number-formatting, unknown-key and argument-injection behavior checks. Remove incidental source-layout/key-count scans rather than expanding them.
- [x] Run `npm test --workspace @edgegamers/ttt-contracts` to demonstrate the new failures.
- [x] Standardize existing complete chat templates, keeping keys and argument positions. Make nested role/item/reason labels plain; use blue names/yellow values in outer phrases. Classify ordinary round/vote outcomes blue and refused execution red.
- [x] Add distinct complete chat wrappers for mixed destinations, including `DNA_TRACK_IDENTIFIED`; route HUD/menu/disconnect/console labels through plain phrases. Keep semantic UI colors in presentation code.
- [x] Extract hardcoded command errors, report/shop UI labels, logger table labels, help and nested reasons. Resolve broadcasts and recipient-dependent nested labels per recipient instead of formatting a server-language string once.
- [x] Preserve private report UI claim/refusal handling and existing chat fallback. Add/adjust a behavior case that refuses UI and verifies the correct localized chat fallback without exposing another player's state.
- [x] Audit all ten runtime owners, shared code and maintained staging player-facing output for remaining hardcoded text and legacy formatting. Use a temporary inventory; do not add a permanent source-text test.
- [x] Run `npm run build -- --filter '@edgegamers/ttt-*'`, then `npm test --workspace @edgegamers/ttt-contracts` and the affected TTT runtime workspace tests. Require successful builds and all relevant suites passing.

## Task 3: Jailbreak catalogs and recipient-aware output

**Files:**
- Create `plugins/jb/packages/shared/src/phrases.ts`; export it from `src/index.ts` and regenerate `types/`.
- Modify shared `src/chat.ts`.
- Create `plugins/jb/plugins/<owner>/translations/jb-<owner>.phrases.json` for `core`, `warden`, `guards`, `lastrequest`, `specialdays`, `rtd`, `gangperks`.
- Modify each owner's `src/messages.ts`, `src/plugin.ts` and output callers, including LastRequest `src/menus.ts`, SpecialDays `src/menu.ts`, GangPerks `src/menus.ts`, game-name/description producers and command/center/HUD paths.
- Add `plugins/jb/packages/shared/test/phrases.test.ts`; extend existing owner behavior fixtures as needed.

**Interfaces:**
- Shared helpers: `loadPhrases(name: string, english: Record<string, string>): void`, `phraseFor(slot: number, key: string, ...args: (string | number)[]): string`, `plainPhraseFor(slot: number, key: string, ...args: (string | number)[]): string`, `tellPhrase(slot: number, key: string, ...args: (string | number)[]): void`, `tellAllPhrase(key: string, ...args: (string | number)[]): void`.
- Each owner imports its own English JSON and calls loading from startup. Catalog keys are namespaced by owner to avoid collisions. No change to existing public gameplay APIs.

- [x] Add native-boundary behavior tests using an esbuild SDK double, following TTT's fixture pattern: different broadcast locales, missing-key English fallback, safe substitutions, and a plain menu/console rendering of the same important value.
- [x] Run `npm test --workspace @edgegamers/jailbreak-shared` and confirm the new cases fail.
- [x] Implement the inlined shared helpers; `tellAllPhrase` iterates valid recipients and translates for each. Update old tag/highlight/name helpers to grey resets, standard blue/red prefix framing and blue player names, retaining compatible signatures only where still useful.
- [x] Replace all seven English message modules with stable phrase keys and recipient-aware rendering. Update callers so broadcasts never reuse a formatted default-language string. Translate singular/plural choices and nested display labels without constructing English fragments in callers.
- [x] Extract menus, minigame descriptions, HUD/center warnings, console reports and hardcoded command replies. Keep them prefix-free where the sink is plain UI, and preserve permissions/timing/optional integrations.
- [x] Run `npm run types --workspace @edgegamers/jailbreak-shared` and retain regenerated declarations.
- [x] Run `npm run build -- --filter '@edgegamers/jailbreak-*'` and all Jailbreak workspace suites. Require successful builds/tests and inspect guards/LR broadcast targeting for unchanged gameplay behavior.

## Task 4: SurfTimer chat and subject-localized HUD

**Files:**
- Create core `plugins/surftimer/plugins/surftimer/src/phrases.ts` and `translations/surftimer.phrases.json`.
- Modify core `src/chat.ts`, `src/commands.ts`, `src/plugin.ts` and other first-party output producers; retire effective `chat_prefix` in `package.json`/callers.
- Create HUD `plugins/surftimer/plugins/surftimer-hud/src/phrases.ts` and `translations/surftimer-hud.phrases.json`.
- Modify HUD `src/model.ts`, `src/plugin.ts`, and `plugins/surftimer/hud/workshop/panorama/layout/custom_game/surftimer_hud.xml`.
- Modify shared display-name helpers under `plugins/surftimer/packages/shared/src/` only where human labels need stable keys; keep style/track identifiers unchanged.
- Extend core `test/surftimer.test.mjs`, HUD `test/model.test.mjs`, and add focused chat behavior fixtures.

**Interfaces:**
- Each runtime owner exports local `loadPhrases(): void`, `phraseFor(slot, key, ...args): string`, `plainPhraseFor(slot, key, ...args): string`.
- HUD model accepts an injected `PhraseResolver = (key: string, ...args: (string | number)[]) => string` for render functions; keep pure English-default rendering available to existing model tests. The runtime binds this resolver to the subject's slot.
- No change to the timer's public RunState/ReplayBotEvent protocol, observable HUD ownership or cached spectator HTML.

- [x] Add failing cases for per-recipient broadcast output, attempted legacy prefix customization, unknown/deployed locale fallback, plain localized HUD labels and escaped markup in substituted names. Keep existing pause/live-time/replay/speed/zone/recorder tests.
- [x] Run the affected Surf suites and confirm the new behavior is missing.
- [x] Replace prefix concatenation and hardcoded command/record/replay announcements with complete native phrase templates. Use standard palette/highlights and blue routine outcomes; the legacy prefix setting no longer affects presentation.
- [x] Localize model statuses, progress, replay/split/finish labels, leaderboard text, style/track display names, PB/WR/behind labels and static HUD input/unit labels. Bind each model render to the subject's locale without per-frame disk reads.
- [x] Preserve center/Panorama escaping, status classes, timing, observation and cached HTML behavior. Add a subject/spectator case verifying the shared rendering is reused as designed.
- [x] Run `npm run build -- --filter '@edgegamers/surftimer-*'` and the Surf shared/core/HUD workspace suites; require all passing.

## Task 5: MAUL admin/disconnect text and authored relays

**Files:**
- Create `plugins/maul/src/phrases.ts` and `plugins/maul/translations/maul.phrases.json`.
- Modify `src/plugin.ts`, `src/commands.ts`, `src/auth.ts`, `src/bans.ts` and any other first-party player-facing text found by the audit.
- Add `plugins/maul/test/phrases.test.ts`; extend existing authentication/ban/presence fixtures if needed.
- Keep `plugins/maul/package.json` restricted publication metadata intact.

**Interfaces:**
- Local helpers: `loadPhrases(): void`, `phraseFor(slot, key, ...args): string`, `plainPhraseFor(slot, key, ...args): string`, `replyPhrase(cmd: CommandInvocation, key: string, ...args: (string | number)[]): void`.
- Extend `banKickMessage(minutes: number, reason: string, slot: number = -1): string` with an optional recipient slot; preserve existing callers/tests through the default. Pass the live connection's slot at actual disconnect sites.
- Preserve backend/auth/presence interfaces and supplied actor/reason identities.

- [x] Add failing cases for caller-localized command replies and plain console tables, translated first-party ban wrappers with an unchanged authored reason, and announcements that preserve remote bodies/names without color injection through positional arguments.
- [x] Run `npm test --workspace @edgegamers/s2s-maul` and confirm the new failures.
- [x] Implement native startup loading, English seeding and sink-specific helpers. Extract admin help/status/table labels and placeholder states (`none`, `yes/no`, missing/disabled) while preserving table widths/truncation.
- [x] Translate first-party disconnect/ban wording with no prefix or color tags. Do not translate authored reasons, backend descriptions or operator messages.
- [x] Standardize plugin-owned DS/MAUL relay framing and player-name styling, preserving the remote message body and current recipients. Do not change presence/kick authorization, deferred connection-bound actions or authentication grants.
- [x] Run `npm run build -- --filter @edgegamers/s2s-maul` and `npm test --workspace @edgegamers/s2s-maul`; require success and inspect `publishConfig.access: restricted` in the manifest/archive metadata.

## Task 6: Documentation, completeness audit and integration

**Files:**
- Create `docs/translations.md` with the exact style standard and author/operator usage.
- Modify `AGENTS.md`, `CONTRIBUTING.md`, root `README.md` and affected product READMEs.
- Add focused patch changesets under `.changeset/` for changed runtime plugins/shared libraries; select members rather than bundle descriptors.
- Update this plan's task checkboxes and approved design only if implementation details need recording.

**Interfaces:**
- One shared guide linked from both agent and contributor instructions; actual catalog paths and startup/fallback behavior must match the implementation.
- Native root `npm run check` remains the integration check; no new validator/workspace framework.

- [x] Read the agent-writing skill before editing `AGENTS.md`. Write the shared guide with exact colors, grey resets, blue vote outcomes, prefix/plain-sink distinctions, preserved placeholders, catalog/locale locations, English fallback and startup-only loading.
- [x] Require agents and contributors to read the shared guide before changing player/admin text. Document removed/ignored prefix settings and manual updates to deployed overrides; never overwrite external server files.
- [x] Temporarily audit all runtime/client/staging output for remaining hardcoded first-party strings, legacy complete chat framing, incorrectly colored names and accidental tags in plain surfaces. Resolve gaps and remove incidental scan artifacts.
- [x] Add patch changesets describing localization and consistent chat/console behavior for all affected members/libraries. Do not alter versions manually or publish.
- [x] Run root `npm run check`; require native builds and all retained suites passing. Inspect representative archives for bundled English fallback and native catalog layout, plus MAUL restricted access.
- [x] Request an independent whole-change review against the approved design and repository conventions. Address actionable findings and rerun only checks affected by fixes.
- [x] Report implemented behavior, build/test evidence and unavailable live CS2 checks. Live smoke checks cover routine/refused chat, highlights, plain console tables, prefix-free UI/disconnect reasons, private report fallback, locale fallback and shared spectator HUD.

## Verified implementation notes

The independent whole-change review found remaining hint, gang, log and nested-label paths. These were corrected with behavior regressions. Jailbreak adds optional `log(message, presentation?)` output metadata without changing existing raw calls or `OnLog.message`; shared `logEntry` captures arguments once, and Core renders only player-console projections per viewer. The `jb-logs` seed lives in the existing shared library and loads in Core. Live CS2 visual smoke checks remain outstanding. Implementation left the original checkout untouched because it contained concurrent Decluttr/name changes. For the requested PR, the translation files were isolated on `feat/translations-chat-formatting` from current `origin/main`, preserving the already merged integrations and released versions.

Final verification: `npm run check` passed after the review fix pass: 22 native builds and 1126 tests (1012 Node, 114 Bun). `git diff --check` and native Changesets release-plan assembly passed. No deferred review findings remain; server installation/publication was outside this task.
