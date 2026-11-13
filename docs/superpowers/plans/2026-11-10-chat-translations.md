# Chat Translations Implementation Plan

> **For agentic workers:** Implement the independent plugin audits in parallel, keeping ownership by plugin directory. Review and verify the combined result before completion.

**Goal:** Make all runtime plugin text delivered to player chat editable through phrase files, and give ExtraCommands the upstream admin activity announcements.

**Architecture:** Preserve each plugin's current chat presentation and behavior. Load embedded English phrase dictionaries with the SDK translation service and resolve messages for each recipient. Use native SDK Activity for successful ExtraCommands actions.

**Tech Stack:** TypeScript, s2script SDK, existing workspace behavior suites.

**Spec:** The user's request in this session: audit all plugins, follow existing translation style, and add the recent upstream admin action announcements to ExtraCommands.

## Global Constraints

- Keep one root npm/s2s workspace and one lockfile.
- Use native s2s builds; preserve MAUL restricted registry distribution.
- Leave player names, map-provided text, and player-written chat literal.
- Keep existing colors, routing, permissions, and gameplay behavior.
- English wording is provisional for the user's later manual revision.

## Review Focus

- Broadcasts resolve translations separately for each recipient.
- Phrase files ship inside native plugin archives.
- Console replies remain readable without chat color control bytes.
- Failed actions and stale player identities do not produce success announcements.
- Existing partial locales continue falling back to English.

### Task 1: Jailbreak chat

- [x] Audit every Jailbreak chat sink and message helper.
- [x] Move English chat text to member phrase files with recipient-aware resolution.
- [x] Run the existing behavior tests and native member builds.

### Task 2: SurfTimer and TTT chat

- [x] Audit both bundles for hardcoded chat output and reply paths.
- [x] Complete phrase files and per-recipient translation integration.
- [x] Verify behavior suites and native archives.

### Task 3: Standalone chat

- [x] Audit Hide, MAUL, WeaponPaints, Decluttr, CustomIO, and ArcadeScripts.
- [x] Complete translation support without changing user-written or map-authored content.
- [x] Run relevant behavior tests and native builds.

### Task 4: ExtraCommands activity and integration

- [x] Verify upstream Activity API and supported SDK version.
- [x] Add failing behavior coverage for successful versus failed activity announcements.
- [x] Integrate translated activity for command and menu action paths.
- [x] Add release intent and concise translation editing documentation.
- [x] Run root native builds and the complete retained test suite; audit remaining chat literals.

## Completion evidence

`npm run check` passed with Node 24: all 26 native plugin builds, 1,200 Node tests and 153 Bun tests passed, with zero failures or skipped tests. After the final test-only boundary mock correction, the SurfTimer core suite passed again (11 tests). `git diff --check` passed. Review found no remaining runtime blockers. SDK warnings concern ignored JSON lint inputs and existing optional dependency discovery.

Native archives embed English dictionaries; editable JSON is included in source packs and can be copied to runtime translation override directories. Gangs owns a single-string gang-chat API, so those announcements use the server language. No live server deployment or registry publication was performed.
