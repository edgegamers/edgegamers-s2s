# Batch Dev Releases Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the agreed feature-to-dev-to-main release flow, with safe synchronization and restart hooks.

**Architecture:** Keep native s2s version/build/deploy commands as the release authority. Use small Git/HTTP helpers for orchestration, and GitHub Actions for dev checks, batch promotion, stable publication and synchronization.

**Tech Stack:** Node 24, npm 11.19.0, native s2s, Bash/Git, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-11-01-dev-releases-design.md`

## Global Constraints

- One root npm/s2s workspace and one lockfile.
- MAUL remains restricted; gameplay and CODEOWNERS are outside this change.
- No actual registry uploads, production restarts or live branch merges during local verification.
- Native SDK prerequisites must be explicit; do not reimplement its planner.

## Review Focus

- A newer contributor commit arrives during release or synchronization: preserve it and never force push.
- Publication partially fails: retry the same versions; never restart servers prematurely.
- Webhook configuration is missing, malformed or rejects the event: distinguish setup and transport failures without exposing URLs.
- Only documentation changes: do not create plugin versions or unnecessary restarts.
- GitHub workflow-token pushes suppress follow-on runs: explicitly preserve the intended dev check/release trigger.

## Task 1: Branch orchestration

**Files:** `.github/scripts/sync-dev.sh`, `test/release.test.mjs`, `.github/workflows/check.yml`, `.github/workflows/promote.yml`, `.github/workflows/release.yml`.

**Interfaces:** Stable publication invokes synchronization only after upload succeeds. The helper writes `synced=true|false` to GITHUB_OUTPUT and preserves conflicting/newer work.

- [x] Write failing disposable-Git tests for absent dev, clean back-merge, ahead dev, conflicts, rejected pushes and repeat invocation.
- [x] Implement and run the tests.
- [x] Wire PR checks, manual promotion and stable post-publication synchronization.

## Task 2: Restart webhooks

**Files:** `.github/scripts/restart-dev.mjs`, `test/restart-dev.test.mjs`, dev workflow integration.

**Interfaces:** Receives JSON release metadata and secret JSON HTTPS endpoint configuration; exports an injectable caller for behavior tests.

- [x] Write failing request/configuration/failure tests without contacting real endpoints.
- [x] Implement HTTPS validation, bounded POSTs, redirect refusal, redacted failures and no-endpoint reporting.
- [x] Verify retries and wire the successful-publication boundary.

## Task 3: Native dev release integration

**Files:** Native SDK snapshot implementation if authorized; `.github/workflows/dev-release.yml`; a narrow affected-source adapter only if native SDK requires it; root dependency pins as available.

**Interfaces:** Native command supplies coherent plugin/bundle prereleases and machine-readable release results. Success records the source baseline before independently retryable restart delivery.

- [x] Resolve native SDK/registry prerequisites using source and tests.
- [x] Add failing tests for changed-only snapshots, dependencies, bundles, retries and branch isolation.
- [x] Implement through native s2s and integrate serialized dev publication.

## Task 4: Contributor instructions and verification

**Files:** `README.md`, `CONTRIBUTING.md`, `docs/releases.md`, optional consequential ADR.

- [x] Document exact feature, promotion, retry, secret and restart-hook setup steps.
- [x] Run targeted behavior tests, workflow validation, root build and retained tests.
- [x] Obtain a fresh whole-change review, resolve material findings, and report remaining external activation requirements.

## External activation (after review and upstream release)

- [ ] Release the native snapshot SDK and update the root SDK dependency and lockfile to that official version.
- [ ] Configure GitHub permissions, the registry token, dev-server manifest ranges and restart webhook receivers/secrets as described in `docs/releases.md`.
- [ ] Enable dev publication and verify a real registry release and dev-server startup.
