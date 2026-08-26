# Modular TTT Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate Blackbox and the modular TTT packages into monorepo bundles, docs, and validation after the package-level plans are complete.

**Architecture:** This plan updates repository-owned metadata and documentation only after each runtime module builds independently. It keeps the existing private package state and does not perform public promotion.

**Tech Stack:** npm workspaces, Source2Script CLI, Node test runner, repository bundle scripts.

**Spec:** `docs/superpowers/specs/2026-08-26-ttt-modular-design.md`

## Global Constraints

- Public promotion is separate from import.
- Keep packages `private: true`.
- Standard TTT server bundle includes Blackbox, TTT core, karma, shop, and special rounds.
- Remove only scratch/import artifacts created for the migration after their source has been copied into reviewed packages.
- Run the complete monorepo gate before completion.

---

## File Structure

- `server-bundles/ttt-s2s.txt`: modular package list.
- `docs/plugin-development.md`: public module note if needed.
- `docs/navigation.md`: link new TTT docs if created.
- `plugins/cs2/ttt/README.md` or `plugins/cs2/ttt/core/README.md`: module overview.
- `.codex-scratch-s2s-ttt-port-main/`: remove after migration is complete and committed.

### Task 1: Update Server Bundle

**Files:**
- Modify: `server-bundles/ttt-s2s.txt`
- Test: `scripts/build-server-bundles.test.mjs`

**Interfaces:**
- Consumes: built package names from package-level plans.
- Produces: standard EdgeGamers TTT bundle membership.

- [ ] **Step 1: Replace bundle contents**

Use:

```text
# One TTT EdgeGamers plugin package per line.
@edgegamers/blackbox
@edgegamers/ttt-core
@edgegamers/ttt-karma
@edgegamers/ttt-shop
@edgegamers/ttt-special-rounds
```

- [ ] **Step 2: Run bundle tests**

Run:

```powershell
npm.cmd test -- scripts/build-server-bundles.test.mjs
```

Expected: PASS.

- [ ] **Step 3: Commit**

```powershell
git add server-bundles/ttt-s2s.txt
git commit -m "chore: bundle modular ttt packages"
```

### Task 2: Document Modular TTT

**Files:**
- Create: `plugins/cs2/ttt/README.md`
- Modify: `docs/navigation.md`

**Interfaces:**
- Consumes: package names and dependency graph from the approved spec.
- Produces: contributor-facing module overview.

- [ ] **Step 1: Add module README**

Create:

```md
# Modular TTT

The standard TTT install is split into:

- `@edgegamers/blackbox`
- `@edgegamers/ttt-core`
- `@edgegamers/ttt-karma`
- `@edgegamers/ttt-shop`
- `@edgegamers/ttt-special-rounds`

`@edgegamers/ttt-core` is the only required TTT gameplay module. Karma, shop, and special rounds consume the core API and can be installed independently when their features are wanted.

Public role extensions register roles through `TttCoreApi.registerRole`. Public shop extensions register items through `TttShopApi.registerItem`. Public special-round extensions register rounds through `TttSpecialRoundsApi.registerRound`.
```

- [ ] **Step 2: Add navigation link**

Add a single link to `docs/navigation.md` in the plugin documentation section:

```md
- [Modular TTT](../plugins/cs2/ttt/README.md)
```

- [ ] **Step 3: Run docs-adjacent checks**

Run:

```powershell
npm.cmd run lint
```

Expected: PASS.

- [ ] **Step 4: Commit**

```powershell
git add docs/navigation.md plugins/cs2/ttt/README.md
git commit -m "docs: document modular ttt packages"
```

### Task 3: Remove Legacy Compatibility Package

**Files:**
- Delete: `plugins/cs2/ttt/package.json`
- Delete: `plugins/cs2/ttt/tsconfig.json`
- Delete: `plugins/cs2/ttt/src/plugin.ts`

**Interfaces:**
- Consumes: completed modular packages and updated TTT server bundle.
- Produces: no ambiguous `@edgegamers/ttt` package competing with modular packages.

- [ ] **Step 1: Inspect current package state**

Run:

```powershell
Get-ChildItem -LiteralPath 'plugins/cs2/ttt' -Force
```

Expected: shows modular folders plus the existing single-package files.

- [ ] **Step 2: Remove old package files**

Delete only:

```text
plugins/cs2/ttt/package.json
plugins/cs2/ttt/tsconfig.json
plugins/cs2/ttt/src/plugin.ts
```

Do not delete modular subdirectories.

- [ ] **Step 3: Confirm no old package reference remains**

Run:

```powershell
rg -n '"@edgegamers/ttt"|plugins/cs2/ttt/src/plugin.ts|plugins/cs2/ttt/package.json' package.json package-lock.json server-bundles scripts docs plugins
```

Expected: only historical spec or plan docs mention the old package name.

- [ ] **Step 4: Run workspace check**

Run:

```powershell
npm.cmd run workspace:check
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add plugins/cs2/ttt
git commit -m "chore: settle legacy ttt package"
```

### Task 4: Remove Scratch Import Source

**Files:**
- Delete: `.codex-scratch-s2s-ttt-port-main/`
- Test: `git status --short`

**Interfaces:**
- Consumes: completed modular source migration.
- Produces: clean worktree without extracted zip artifacts.

- [ ] **Step 1: Verify modular packages contain the migrated source**

Run:

```powershell
rg -n "Trouble in Terrorist Town|ttt-core|ttt-shop|ttt-karma|ttt-special-rounds" plugins/cs2/ttt plugins/global/blackbox
```

Expected: matches in modular package files.

- [ ] **Step 2: Remove the scratch folder**

Run:

```powershell
Remove-Item -LiteralPath '.codex-scratch-s2s-ttt-port-main' -Recurse
```

Expected: folder is gone.

- [ ] **Step 3: Confirm worktree state**

Run:

```powershell
git status --short
```

Expected: no `.codex-scratch-s2s-ttt-port-main/` entry.

- [ ] **Step 4: Commit if Git tracked cleanup metadata**

If `git status --short` shows tracked file changes from cleanup, commit them:

```powershell
git add .
git commit -m "chore: remove ttt import scratch source"
```

If cleanup only removed untracked scratch files, do not create an empty commit.

### Task 5: Run Final Gate

**Files:**
- Test: full repository

**Interfaces:**
- Consumes: completed package-level module plans.
- Produces: validated modular TTT import.

- [ ] **Step 1: Run lint**

```powershell
npm.cmd run lint
```

Expected: PASS.

- [ ] **Step 2: Run typecheck**

```powershell
npm.cmd run typecheck
```

Expected: PASS.

- [ ] **Step 3: Run tests**

```powershell
npm.cmd test
```

Expected: PASS.

- [ ] **Step 4: Run build**

```powershell
npm.cmd run build
```

Expected: PASS.

- [ ] **Step 5: Commit final fixes**

If the gate required changes:

```powershell
git add .
git commit -m "fix: pass modular ttt validation"
```

If the gate passed without changes, do not create an empty commit.
