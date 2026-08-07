# Unified Server Plugin Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the unified EdgeGamers Source2Script plugin/server selection model inside `edgegamers-s2s`.

**Architecture:** The repo will organize plugins by global/game scope, keep server plugin lists and payload content under `servers/games/<game>/<server>`, and enforce compatibility through Node policy checks. Artifact manifests will include plugin metadata so dev/prod deploy code can resolve package names from `s2script-plugins.txt` without human-maintained versions.

**Tech Stack:** Node.js 24, npm 11, Source2Script CLI, Vitest, GitHub Actions, PowerShell file moves.

## Global Constraints

- GitLab remains authoritative for compose files, deployment jobs, hosts, secrets, and rollout mechanics.
- `edgegamers-s2s` owns plugin source, server payload content, and server plugin selection.
- `s2script-plugins.txt` is authoritative under `servers/games/<game>/<server>/`.
- Global plugins may not depend on game-specific plugins.
- Game-specific plugins may depend on global plugins and same-game plugins only.
- Public registry publishing requires both `private: false` and `edgegamers.publicRegistry: true`.
- Existing untracked operator notes must remain uncommitted.

---

### Task 1: Policy Library

**Files:**
- Create: `scripts/lib/repository-policy.mjs`
- Create: `scripts/check-repository-policy.mjs`
- Create: `scripts/test/repository-policy.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces `validateRepositoryPolicy(rootDir): string[]`.
- Produces `discoverPluginManifests(rootDir): PluginRecord[]`.
- Produces npm script `policy:check`.

- [ ] Write failing tests for metadata path alignment, cross-game dependency rejection, server plugin list compatibility, and public registry allowlist.
- [ ] Implement the policy library.
- [ ] Add the `policy:check` script.
- [ ] Run `npm.cmd test -- scripts/test/repository-policy.test.mjs`.

### Task 2: Layout Migration

**Files:**
- Move: `plugins/reference-api` to `plugins/global/reference-api`
- Move: `plugins/reference-consumer` to `plugins/global/reference-consumer`
- Create: `servers/games/cs2/empty/server.json`
- Create: `servers/games/cs2/empty/s2script-plugins.txt`
- Create: `servers/games/cs2/empty/payload/csgo/...`
- Create: `servers/games/cs2/ttt/server.json`
- Create: `servers/games/cs2/ttt/s2script-plugins.txt`
- Create: `servers/games/cs2/ttt/payload/csgo/...`
- Modify: `package.json`
- Modify: `tsconfig.base.json`
- Modify: plugin `tsconfig.json` files

**Interfaces:**
- Consumes existing reference plugins.
- Consumes current GitLab `empty-s2s` and `ttt-s2s` `s2script-plugins.txt` and `csgo/` payload content as migration inputs.

- [ ] Move plugin directories into `plugins/global`.
- [ ] Add `edgegamers` metadata to reference plugin package manifests.
- [ ] Update workspace and Source2Script plugin globs.
- [ ] Copy current server plugin lists and payload content from GitLab repos.
- [ ] Update TypeScript include paths.
- [ ] Run targeted policy and typecheck tests.

### Task 3: Channel Manifests

**Files:**
- Modify: `scripts/lib/development-manifest.mjs`
- Modify: `scripts/create-dev-manifest.mjs`
- Modify: `scripts/collect-local-artifacts.mjs`
- Modify: `scripts/test/development-manifest.test.mjs`
- Modify: `scripts/test/create-dev-manifest.test.mjs`
- Modify: `scripts/test/collect-local-artifacts.test.mjs`

**Interfaces:**
- Produces manifest field `channel`.
- Produces plugin manifest entries with `name`, `scope`, `game`, `publicRegistry`.
- Updates artifact discovery to accept `plugins/global/*/dist/*.s2sp` and `plugins/games/<game>/*/dist/*.s2sp`.

- [ ] Write failing tests for nested plugin artifact paths and metadata-rich manifest entries.
- [ ] Implement manifest metadata lookup.
- [ ] Update local artifact collection for nested paths.
- [ ] Run targeted manifest/artifact tests.

### Task 4: Server Resolution And Dev Deploy

**Files:**
- Create: `scripts/lib/server-plugin-resolver.mjs`
- Create: `scripts/test/server-plugin-resolver.test.mjs`
- Modify: `scripts/deploy-development-artifacts.mjs`
- Modify: `scripts/test/deploy-development-artifacts.test.mjs`
- Modify: `.github/workflows/deploy-dev.yml`

**Interfaces:**
- Produces `resolveServerPlugins({ server, manifest }): ResolvedServerPlugins`.
- Adds optional deployment inputs `DEV_SERVER_GAME` and `DEV_SERVER_NAME`.
- Existing single-directory dev deploy remains supported; when server inputs are set, only selected compatible plugins are copied.

- [ ] Write failing tests for package-name filtering and wrong-game rejection.
- [ ] Implement server plugin resolver.
- [ ] Update dev deploy remote script to copy only resolved plugin file names.
- [ ] Update workflow secrets/env expectations.
- [ ] Run targeted resolver/deploy/workflow tests.

### Task 5: Public Registry Guard

**Files:**
- Modify: `scripts/lib/changeset-policy.mjs` or add focused policy in `repository-policy.mjs`
- Modify: `.github/workflows/release.yml`
- Modify: `scripts/test/github-workflows.test.mjs`

**Interfaces:**
- Public deploy is guarded by `npm run policy:check`.

- [ ] Add tests proving public registry eligibility requires `edgegamers.publicRegistry: true`.
- [ ] Ensure release workflow runs `npm run policy:check` before `s2s deploy`.
- [ ] Run targeted policy/workflow tests.

### Task 6: Full Verification

**Files:**
- Modify docs only if implementation evidence changes setup.

**Interfaces:**
- Produces verified repo state.

- [ ] Run `npm.cmd run lint`.
- [ ] Run `npm.cmd run typecheck`.
- [ ] Run `npm.cmd test`.
- [ ] Run `npm.cmd run build`.
- [ ] Run `npm.cmd run artifacts:local`.
- [ ] Leave `docs/release-operator-tasks.md` uncommitted.
