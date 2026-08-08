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

Status: implemented with development deployment and registry publication.

- Pull request validation runs lint, typecheck, tests, Source2Script build, and Changeset coverage.
- Development workflow builds artifacts and uploads a development bundle.
- Release workflow validates `main` and can run Source2Script registry deploy.
- Hotfix workflow opens a `main` to `dev` sync PR.
- Development server deployment and reconciliation run over SSH using GitHub environment secrets.

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

Status: implemented locally.

- Development artifacts deploy over SSH to the configured development server plugin directory.
- Reconciliation is manifest-scoped and leaves unmanaged files untouched.
- Production releases create GitHub release assets for all released plugins.
- Source2Script registry publishing is limited to opt-in plugins.
- Server repositories resolve GitHub release assets at their own `YY.MM.DD` or
  `YY.MM.DD-HOTPATCH-N` tag time into `server-release-manifest.json`.
- Production servers adopt changes only when their server repository is tagged.
- Server images live in `base-s2s` and `ttt-s2s`.

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

### Release Pipeline Verification (2026-08-03)

- `edgegamers-s2s`: `npm.cmd run lint`, `npm.cmd run typecheck`, `npm.cmd test` (13 files and 74 tests), `npm.cmd run build`, and `npm.cmd run artifacts:local` all passed.
- `base-s2s`: Git Bash `scripts/validate.sh` passed its representative Valve `SearchPaths` fixture, and `docker build --pull --progress plain -t base-s2s:local .` passed.
- `ttt-s2s`: Git Bash `scripts/validate.sh`, both `docker compose ... config --quiet --no-interpolate` checks, and `docker build --pull --progress plain --build-arg BASE_S2S_IMAGE=base-s2s:local -t ttt-s2s:local .` passed.
- Built `ttt-s2s:local` metadata reported `ENTRYPOINT=["/docker-entrypoint.sh"]`, `CMD=["bash","entry.sh"]`, and user `1000:1000`; temporary-container checks found Node v20.19.0, executable `s2s`, and the copied upstream CS2 startup script.
- Legacy `base` and `ttt`: `git status --short` was empty for both repositories; this work did not modify either checkout.

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

Required remote setup:

- GitHub development environment secrets: `DEV_SSH_HOST`, `DEV_SSH_PORT`, `DEV_SSH_USER`, `DEV_SSH_KEY`, `DEV_S2SCRIPT_PLUGIN_DIR`.
- GitHub production environment secret: `S2SCRIPT_TOKEN`.
- The development SSH host needs Node.js 20 or newer in the deploy user's non-interactive `PATH`.
- GitLab runners need Docker-in-Docker support for `base-s2s` and `ttt-s2s`.
- The server box must schedule a 10:00 UTC rebuild/restart outside CI.
- The development SSH user must write only to staging and the Source2Script plugin directory; `DEV_S2SCRIPT_PLUGIN_DIR` must be the same host bind path used by `compose-dev.yml` and be writable by UID/GID `1000:1000`.
- TTT compose environments must provide `APP_SERVER_RCON_PASSWORD`, a versioned `METAMOD_SOURCE_URL`, and `S2SCRIPT_RUNTIME_ZIP_URL`; no archive URL or credential is committed.
