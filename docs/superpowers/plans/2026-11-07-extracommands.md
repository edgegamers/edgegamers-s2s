# ExtraCommands Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Extract PR #327 into a standalone ExtraCommands plugin and close the upstream PR after verification.

**Architecture:** Retain the tested command and effect implementations while removing stock command ownership. Contribute menu items to topmenu and dispatch selections through the native command registry. Own phrases and lifecycle cleanup within the new plugin.

**Tech Stack:** TypeScript, published s2script SDK 0.35.0/CS2 0.22.0, node:test, esbuild, native s2s.

**Spec:** `docs/superpowers/specs/2026-11-07-extracommands-design.md`

## Global Constraints

- Keep one root workspace/lockfile; use native s2s builds.
- Package: `@edgegamers/extracommands`; public distribution.
- Preserve commands/aliases, permissions, immunity filtering and validation from #327.
- Use the published SDK's onSelect API; no framework changes or duplicated stock commands.
- Use the ExtraCommands local English seed, four-color Admin » messages and plain console/UI labels; English works without loose translation files.
- Preserve unrelated local changes; no registry or game-server deployment.

## Review Focus

- Stale menu callbacks must not execute for a replacement caller or target.
- Changed admin permissions and immunity must be checked when a selection executes.
- Map changes/unload cancel pending menus, locations and effect state.
- Replies use the recipient locale; console/UI text has no chat colors.
- Archive contains the embedded English seed and excludes tests/operator scratch.

### Task 1: Standalone commands

**Files:** `plugins/extracommands/{package.json,tsconfig.json,src/*,test/*,translations/*}`.
**Interfaces:** `OnPluginStart`, lifecycle exports, command registration helpers and `FunEffects` consume injected SDK operations.

- [x] Adapt essential PR behavior tests first; assert absent command registrations fail before importing implementations.
- [x] Extract new command families only, remove stock freeze ownership and load local phrase seed.
- [x] Run node command suites; verify validation, targeting, inventory replacement, delayed work and cleanup.

### Task 2: Admin menu

**Files:** `plugins/extracommands/src/menu.ts`, `test/menu.test.mjs`, phrase catalog.
**Interfaces:** `registerMenu(): void`, `clearMenus(): void`; menu selections call `Commands.dispatch` using user IDs.

- [x] Add failing menu behavior tests for target/option selection, permission/immunity rechecks, stale connections, map/unload and reply routing.
- [x] Register player/fun actions and public self-kill; add localized target/value/destination selectors, native dispatch and lifecycle guards.
- [x] Run all plugin suites and native build.

### Task 3: Workspace and delivery

**Files:** root `package.json`, `package-lock.json`, `README.md`, `UPSTREAMS.md`, `.changeset/*`, plugin README/NOTICE, upstream freeze patch.
**Interfaces:** root native s2s workspace discovers/builds the plugin and includes it in release intent.

- [x] Register the new product, refresh the single lockfile and document commands/install/menu/engine acceptance.
- [x] Run `npm run check`; inspect archive and dry-run packaging.
- [ ] Review the complete change; commit only task-owned files and push a feature branch for a durable replacement reference.
- [ ] Post verification and the replacement link on #327, then close it and confirm its closed state.

## Verification record

- `npm test --workspace @edgegamers/extracommands`: 71/71 passing after independent review and two life-snapshot fixes.
- Root filtered native build and native pack dry-run: pass (SDK emits its existing JSON lint configuration warning).
- Archive: `manifest.json` and `plugin.js`; embedded English seed, no test/runtime development dependencies.
- Separate stock freeze patch: applies cleanly to #327 base; 4/4 focused regressions pass.
- Full root `npm run check`: blocked by existing published-SDK type mismatches in HUD, TTT UI and TTT shop. Baseline `npm test` has one existing MAUL supporter-message palette failure. Unrelated owners remain unchanged.
- Live CS2 acceptance remains a deployment check; no server deployment was requested.

Delivery uses a clean worktree based on remote main f682aa3, carrying only ExtraCommands and the necessary root discovery/release entries. The original local checkout and unrelated HUD work remain intact. Remote main has no root translation guide, so no unrelated localization documentation is reintroduced.

Clean delivery verification: `npm run check` passed against remote main f682aa3 (all 24 runtime plugins build, all retained workspace suites pass, ExtraCommands 71/71). Native archive inspection and source pack dry-run passed; source pack includes Apache LICENSE. No unrelated local HUD/localization history is included in the delivery branch.
