# Implementation Status

This status verifies the first five stages and records remaining stubs.

## Phase 1: Repository Foundation

Status: complete locally.

- Root npm workspace exists.
- Source2Script workspace plugin glob is `plugins/*`.
- Node and npm versions are pinned.
- Lockfile exists.
- Current branch is `dev`.

Manual GitHub branch state still needs confirmation in GitHub.

## Phase 2: Development Standards

Status: complete locally.

- Root ESLint configuration exists.
- Root TypeScript configuration exists.
- Vitest runs repository policy tests.
- `packages/*` is reserved and documented for future shared packages.

## Phase 3: Repository Structure

Status: complete locally.

- `plugins/`, `packages/`, `scripts/`, `docs/`, and `.github/` are present.
- README, license, contributing, security, support, issue templates, and PR template are present.
- `docs/DESIGN.md` and `docs/SETUP.md` now describe current repository state.

## Phase 4: CI

Status: implemented with deployment stubs.

- Pull request validation runs lint, typecheck, tests, Source2Script build, and Changeset coverage.
- Development workflow builds artifacts and uploads a development bundle.
- Release workflow validates `main` and can run Source2Script registry deploy.
- Hotfix workflow opens a `main` to `dev` sync PR.
- Server deployment and reconciliation remain intentionally stubbed until EdgeGamers chooses release paths.

## Phase 5: GitHub

Status: local files complete; GitHub UI setup remains manual.

- CODEOWNERS exists.
- PR template exists.
- Issue templates exist.
- Label source file exists.
- Manual GitHub setup steps exist in `.github/MANUAL_SETUP.md`.
- Environments, secrets, rulesets, default branch, labels, and team bindings must be configured in GitHub.

## Phase 6: Versioning

Status: complete locally.

- Changesets is initialized.
- Changeset validation exists.
- Release documentation explains versioning and Source2Script deploy behavior.

## Phase 7: Plugin Framework

Status: complete locally.

- `reference-api` publishes a runtime interface.
- `reference-consumer` consumes that sibling interface.
- Both plugins are private verification fixtures.

## Phase 8: Deployment

Status: stubbed by design.

- Development artifacts and manifest generation exist.
- Local copy flow is documented.
- CI server deployment is skipped until EdgeGamers defines artifact transport.
- Production server rollout and rollback remain outside this repository until final S2S release paths are known.

## Phase 9: Documentation

Status: complete for current foundation.

- Design, setup, local development, architecture, plugin development, and release docs exist.
- GitHub manual setup doc exists.

## Phase 10: Community

Status: partial.

- Contributing, code of conduct, support, security, issue templates, and funding files exist.
- Good-first-issue triage, plugin ownership expansion, and RFC process still need maintainer decisions.

## Phase 11: Final Validation

Status: local gate verified.

Verified commands:

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
npm.cmd run artifacts:local
```

`npm.cmd run build` and `npm.cmd run artifacts:local` may need to run outside the Codex sandbox because Source2Script's build process reads plugin entry files through paths the sandbox denies.

Development deployment, production release, and hotfix flow still need GitHub environment setup before end-to-end validation.
