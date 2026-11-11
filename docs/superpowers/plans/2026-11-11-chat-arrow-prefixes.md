# Chat Arrow Prefixes Implementation Plan

> **For agentic workers:** Work independently by plugin directory, then review and verify the combined output.

**Goal:** Standardize existing plugin/system chat prefixes to `Name » message` while preserving console, HUD, menu and log formatting.

**Spec:** User's final prefix request and explicit correction: arrow formatting applies ONLY to chat; console/HUD/etc. have their own formatting.

**Architecture:** Audit each prefix's consumers. Chat-only prefix phrases can be updated directly. Shared phrases/descriptors must apply destination-aware prefix presentation at chat output boundaries, preserving their original non-chat rendering. Avoid broad replacement of brackets, pipes, greater-than characters or user data.

## Constraints

- Arrow is `»`, matching the established Admin/Decluttr style. Prefix labels keep existing blue/red semantic colors and grey separator/general text.
- Preserve the dotted phrase keys, translations, data placeholders, empty phrase suppression and custom configured prefixes/overrides.
- Preserve user chat bodies/names and Decluttr public/team/dead/spectator markers (`☠`, `[T]`, `[CT]`, `[S]`). These are player/channel markers, not system-prefix delimiters.
- Change existing system prefixes; do not invent prefixes for plain messages/menus/HUD.
- Shared chat/console commands must show the arrow only for chat delivery. In-game console and server console retain their existing prefix format. HUD, Panorama, menus and logs retain their own layout.
- Preserve audiences, permissions, gameplay, literal map/config/player text and MAUL restricted distribution.
- Keep one root workspace/lockfile and native s2s tooling. No deploy/publish/commit requested.

## Tasks

- [x] TTT: audit all prefix paths (including private channels), apply chat-only arrows, preserve non-chat output, verify regression tests and native builds.
- [x] Jailbreak: audit shared Text/tag composition and direct prefixes, apply arrows at chat-only paths, preserve console/HUD/menu renderings, verify tests/builds.
- [x] Other plugins: normalize existing chat prefixes in MAUL/Hide/WeaponPaints/SurfTimer; inspect ArcadeScripts, preserve non-chat callers and custom text, verify tests/builds.
- [x] Main integration: verify ExtraCommands/Decluttr already follow the intended chat style, update concise docs/release intent, review destination boundaries and run root native checks.

## Review Focus

- A shared phrase produces arrow chat and unchanged non-chat output.
- Player-supplied bracketed/pipe/arrow text is untouched.
- Translated or configured prefix names remain supported.
- No duplicate prefix or separator is introduced by nested phrases.
- Public team/dead markers, system warnings and private-channel audiences retain their semantics.

## Completion evidence

Final `npm run check` passed: 26 native plugin builds, 1,248 Node tests and 158 Bun tests (1,406 total), zero failures or skipped tests. Focused review has no remaining actionable findings. Retained regressions cover chat versus in-game/server-console destinations, shared console/HUD/menu presentation, translated and omitted prefixes, literal names/body delimiters, nested prefixes, and server reply fallbacks. Temporary schema/source-scan tests from the earlier key migration were removed after one-off audits. `git diff --check` passed.

ExtraCommands and Decluttr already had the requested arrow presentation, so their phrase dictionaries remain unchanged. TTT/Jailbreak shared dictionaries retain their original non-chat layouts; chat-only sinks select arrows. Gangs retains its external producer-owned prefix and original audience. No deployment, publication or commit was performed.
