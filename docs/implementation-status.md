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

Status: implemented with server bundle workflows and registry publication.

- Pull request validation runs lint, typecheck, tests, Source2Script build, and Changeset coverage.
- Development workflow builds server-scoped plugin bundles, uploads them, and triggers server repository pipelines.
- Release workflow validates `main` and can run Source2Script registry deploy.
- Hotfix workflow opens a `main` to `dev` sync PR.
- Server repositories own image builds, SSH deployment, compose files, and restart behavior.

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

- Development builds produce server-scoped plugin bundles and trigger server repository pipelines.
- Production bundles are immutable CI artifacts created from `main`.
- Server repositories own image builds, SSH deploys, compose files, runtime selection, and restart policy.
- Server repositories remain small and own their server image definitions.

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

- `edgegamers-s2s`: `npm.cmd run lint`, `npm.cmd run typecheck`, `npm.cmd test` (13 files and 74 tests), and `npm.cmd run build` all passed.
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
```

`npm.cmd run build` may need to run outside the Codex sandbox because Source2Script's build process reads plugin entry files through paths the sandbox denies.

Server bundle pipeline triggers, production release, and hotfix flow still need GitHub and GitLab environment setup before end-to-end validation.

Required remote setup:

- GitHub GitLab trigger secrets: `GITLAB_URL`, `GITLAB_PROJECT_ID_EMPTY_S2S`, `GITLAB_TRIGGER_TOKEN_EMPTY_S2S`, `GITLAB_PROJECT_ID_TTT_S2S`, and `GITLAB_TRIGGER_TOKEN_TTT_S2S`.
- GitHub production environment secret: `S2SCRIPT_TOKEN`.
- GitLab runners need Docker-in-Docker support for `base-s2s` and `ttt-s2s`.
- TTT compose environments must provide `APP_SERVER_RCON_PASSWORD`, a versioned `METAMOD_SOURCE_URL`, and `S2SCRIPT_RUNTIME_ZIP_URL`; no archive URL or credential is committed.

## Plugin bundle server pipeline overhaul

Status: implemented.

Final whole-branch review fix verification (2026-08-08):

- GitHub/GitLab artifact handoff now carries distinct outer Actions artifact
  and inner server bundle names.
- `edgegamers-s2s`: targeted trigger/workflow tests passed (2 files, 5 tests),
  the full suite passed (29 files, 167 tests), and lint exited 0.
- `s2script-runtime-image`: Git Bash `bash scripts/validate.sh` exited 0,
  including successive-bundle removal and unmanaged-plugin retention coverage.
- `empty-s2s`: Git Bash `bash scripts/validate.sh` exited 0, including the
  downloader artifact-layer regression test and deployable-job rule checks.
- `ttt-s2s`: Git Bash `bash scripts/validate.sh` exited 0, including the
  downloader regression, deployable-job rules, and inherited-plugin reset.
- Docker remains unavailable. `docker version --format '{{.Server.Version}}'`
  exited 1 after warning that `C:\Users\reece\.docker\config.json` was denied;
  the engine connection failed because `//./pipe/docker_engine` does not exist.

Verification:

- `s2script-runtime-image`: `bash scripts/validate.sh` exited 0.
- `edgegamers-s2s`: lint, typecheck, tests, build, development bundle build,
  and production bundle build exited 0.
- `empty-s2s`: `bash scripts/validate.sh` exited 0.
- `ttt-s2s`: `bash scripts/validate.sh` exited 0.
- Docker image builds: unavailable locally. `docker version --format '{{.Server.Version}}'`
  exited 1 with `failed to connect to the docker API at npipe:////./pipe/docker_engine; check if the path is correct and if the daemon is running: open //./pipe/docker_engine: The system cannot find the file specified.`
- Removed systems grep: no active direct dev SSH deploy, Watchtower,
  development reconcile, or server-release-manifest pipeline remains. Matches
  were historical plan/spec text and negative workflow-test fixtures.

## Old-model server image rollback

- `edgegamers-s2s` keeps Source2Script package/bundle builds and GitLab trigger-token fanout for affected development servers.
- `base-s2s` is game-agnostic and no longer packages a payload addon tree.
- `empty-s2s` is the runnable CS2 base image and keeps the existing `cs2-data` shared install.
- `ttt-s2s` is a runnable child image based on `empty-s2s:main`.
- Server compose files no longer use `ghcr.io/s2script/s2script-runtime-image`.
- Development SSH deploys pull the rebuilt image and restart containers.
- Production deploys update compose/image selection without forcing live restarts; the host 10:00 restart applies the image.

Validation:

- `edgegamers-s2s`: `npm.cmd test` exited 0.
- `base-s2s`: Git Bash `bash scripts/validate.sh` exited 0.
- `empty-s2s`: Git Bash `bash scripts/validate.sh` exited 0.
- `ttt-s2s`: Git Bash `bash scripts/validate.sh` exited 0.
- Docker builds: local Docker daemon unavailable; GitLab CI must validate image builds. `docker version --format '{{.Server.Version}}'` exited 1 because `//./pipe/docker_engine` does not exist; Docker also warned that `C:\Users\reece\.docker\config.json` was denied.
