# Plugin Monorepo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create the approved minimal five-product repository with native automatic releases and clean community documentation.

**Architecture:** One private npm/s2s workspace owns installation, Changesets and publishing. Three bundle descriptors group their actual runtime members; Hide and MAUL are direct standalone packages. A short Git helper persists native version results and refuses a stale branch before publication.

**Tech Stack:** Node 24, npm 11, SDK 0.34.0, compatible CS2 bindings, TypeScript, Changesets, GitHub Actions; Bun for upstream MAUL behavior tests if needed.

**Spec:** `docs/superpowers/specs/2026-10-30-plugin-monorepo-design.md`

## Global Constraints

- Import only the five approved upstream snapshots; no previous edgegamers monorepo code/history.
- One root workspace, lockfile and `.changeset/`; products live under `plugins/`.
- Preserve TTT/Jailbreak bundles and optional gangperks; add public SurfTimer core/HUD bundle under `@edgegamers`.
- MAUL source is public; `@edgegamers/s2s-maul` registry distribution stays `restricted`.
- Use native SDK version/build/deploy; no custom planner, schema framework or structural policy tests.
- Retain essential behavioral tests; remove temporary or incidental assertions after use.
- Verify locally without uploading packages; prepare a concrete result before any final publication action.

## Review Focus

- Bundle descriptors must never become npm packages or independent workspace roots; prove native discovery/build/version behavior.
- Private shared-library changes must reach shipped consumers; exercise native versioning in a disposable repository copy.
- Previously published versions must not receive replacement artifacts; initial migration changesets advance publishable units.
- A concurrent main push or rejected version push must prevent stale publication; test the actual Git helper against disposable bare remotes.
- MAUL must remain in the publication plan with restricted access; inspect native planning rather than treating `private: true` as restricted distribution.

### Task 1: Fresh imports and one working workspace

**Files:** `package.json`, `package-lock.json`, `.gitignore`, `.node-version`, `.changeset/config.json`, `UPSTREAMS.md`, `plugins/{ttt,surftimer,jb,hide,maul}/**`.

**Interfaces:** Consumes the five upstream snapshots listed in the spec. Produces root `build`, `test`, `check`, `changeset`, `version`, `deploy` scripts and native runtime/bundle discovery.

- [ ] Import tracked upstream files without Git metadata, nested lockfiles, active upstream workflows or superseded agent instructions; record exact source commits and notices.
- [ ] Create root npm and s2s plugin/library/bundle globs; keep bundle descriptors outside npm workspaces. Normalize shared dev dependencies, SurfTimer identities and paths without changing gameplay.
- [ ] Run `npm install` and `npm run build`; diagnose actual type/lint/interface errors and make only source-compatible migration corrections.
- [ ] Audit inherited tests: remove source-text/archive-shape assertions while preserving real behavior checks. Wire retained product tests into `npm test`.
- [ ] Run `npm run check`. Expected: all 21 runtime plugins build and retained behavioral tests pass. Commit the working workspace.

### Task 2: Changesets and automatic releases

**Files:** `.changeset/initial-import.md`, `.github/workflows/{check,release}.yml`, `.github/scripts/commit-release.sh`, `test/release.test.mjs`.

**Interfaces:** Consumes Task 1's direct root scripts. Helper consumes `GITHUB_OUTPUT`, current Git checkout and origin main, emits `publish=true/false`, and exits nonzero on a failed commit/push. Workflow deploys only on successful helper output.

- [ ] Write failing behavioral tests for unchanged version results, committed version results, stale main and rejected pushes using temporary real Git repositories.
- [ ] Run `node --test test/release.test.mjs`. Expected: failure because the release helper does not exist.
- [ ] Implement the small helper and minimal workflows: native version then lock refresh, essential checks, safe persistence, native deploy. Serialize releases and permit manual retry.
- [ ] Run the helper tests. Expected: pass with no publication allowed on stale/failed persistence.
- [ ] In a disposable copy, run `npm run version` with initial patch intent and a private-library-only change. Expected: matching bundle/dependency changes and valid refreshed lockfile. Inspect native deployment plan without uploading if registry capabilities permit.
- [ ] Validate workflow syntax with actionlint and run `npm run check`. Expected: pass. Commit release automation.

### Task 3: Skill setup, README and community guides

**Files:** `AGENTS.md`, `GLOSSARY.md`, `docs/agents/*.md`, `README.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`.

**Interfaces:** Consumes the verified commands and release behavior from Tasks 1–2. Produces accurate contributor/operator instructions, shieldcn badges and a usable private security-reporting route.

- [ ] Complete approved skill setup and create missing default labels. Publish the agreed spec issue with `ready-for-agent` using the to-spec template.
- [ ] Write a concise shieldcn README showing products, root commands, changesets and token setup; add contribution, conduct and security guides with real reporting routes and per-product license attribution.
- [ ] Verify README commands, Markdown links, badge HTTP responses and security-report availability; do not retain tests of documentation wording/layout.
- [ ] Run a clean `npm ci`, `npm run check`, disposable version checks and workflow validation. Expected: pass, with any unavailable live registry/host check explicitly reported.
- [ ] Commit docs, obtain a fresh whole-branch review, resolve material findings, and prepare the finished local result for final integration review.
