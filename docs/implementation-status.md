# Implementation Status

This status verifies the first five stages and records remaining stubs.

## Phase 1: Repository Foundation

Status: complete locally.

- Root npm workspace exists.
- Source2Script workspace plugin glob is `plugins/*/*`.
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

Status: implemented with development deployment and gated production publication.

- Pull request validation runs lint, typecheck, tests, Source2Script build, and Changeset coverage.
- Development workflow builds artifacts and uploads a development bundle.
- Release workflow validates `main`, publishes GitHub release assets for
  changed plugins, and can run plan-gated Source2Script registry opt-ins.
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
- Production releases create GitHub release assets for plugins named in pending
  Changesets.
- Source2Script registry publishing is limited to plan-gated opt-in plugins.
- Server repositories resolve GitHub release assets at their own `YY.MM.DD` or
  `YY.MM.DD-HOTPATCH-N` tag time into `server-release-manifest.json`.
- Production servers adopt changes only when their server repository is tagged.
- Server images live in `empty-s2s` and child repos such as `ttt-s2s`.

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
- `empty-s2s`: Git Bash `scripts/validate.sh` passed its representative Valve `SearchPaths` fixture, and `docker build --pull --progress plain -t empty-s2s:local .` passed.
- `ttt-s2s`: Git Bash `scripts/validate.sh`, both `docker compose ... config --quiet --no-interpolate` checks, and `docker build --pull --progress plain --build-arg EMPTY_S2S_IMAGE=empty-s2s:local -t ttt-s2s:local .` passed.
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

- GitHub development environment secrets: `DEV_SSH_HOST`, optional
  `DEV_SSH_PORT`, `DEV_SSH_USER`, `DEV_SSH_KEY`, `DEV_GITLAB_TOKEN`, and
  optional `DEV_GITLAB_USER` for GitLab deploy tokens.
- GitHub production environment secret: `S2SCRIPT_TOKEN`.
- The development SSH host needs Node.js 20 or newer in the deploy user's non-interactive `PATH`.
- GitLab runners need Docker-in-Docker support for `empty-s2s` and child repos such as `ttt-s2s`.
- The server box must schedule a 10:00 UTC rebuild/restart outside CI.
- The development SSH user must write only to staging and the Source2Script
  plugin directories listed in `config/development-servers.json`; each path must
  match the host bind or Docker volume path used by the server's `compose-dev.yml`
  and be writable by UID/GID `1000:1000`.
- `config/development-servers.json` points at cloned server repo
  `server-plugins.json` intent files, so dev fan-out and tagged release
  manifests use the same server-owned plugin membership.
- TTT compose environments must provide `APP_SERVER_RCON_PASSWORD`, a versioned `METAMOD_SOURCE_URL`, and `S2SCRIPT_RUNTIME_ZIP_URL`; no archive URL or credential is committed.

## Server release tags

Status: final verification recorded locally on 2026-08-08.

Required commands and observed outcomes:

- `edgegamers-s2s`: `npm.cmd run lint` exited 0.
- `edgegamers-s2s`: `npm.cmd run typecheck` exited 0.
- `edgegamers-s2s`: `npm.cmd test` exited 0; Vitest reported 15 test files passed and 82 tests passed.
- `edgegamers-s2s`: `npm.cmd run build` first failed inside the Codex sandbox with `Cannot read directory "../../../..": Access is denied.` and unresolved plugin entry paths; rerunning the same command outside the sandbox exited 0, produced `_edgegamers_reference-api.s2sp` and `_edgegamers_reference-consumer.s2sp`, and the artifact license check passed.
- `edgegamers-s2s`: `npm.cmd run changeset:check` exited 0 with `No server-affecting plugin changes detected.`
- `s2script-runtime-image`: `& 'C:\Program Files\Git\bin\bash.exe' scripts/validate.sh` exited 1 because `grep` was not on that direct invocation PATH; `& 'C:\Program Files\Git\bin\bash.exe' --login -lc 'cd /c/Users/reece/VSCodeProjects/s2script-runtime-image/.worktrees/server-release-tags && ./scripts/validate.sh'` exited 0 with handshake, gameinfo, and release manifest reconcile checks passed.
- `empty-s2s`: `& 'C:\Program Files\Git\bin\bash.exe' scripts/validate.sh` exited 1 because `grep` was not on that direct invocation PATH; `& 'C:\Program Files\Git\bin\bash.exe' --login -lc 'cd /c/Users/reece/VSCodeProjects/empty-s2s/.worktrees/server-release-tags && ./scripts/validate.sh'` exited 0; Vitest reported 3 test files passed and 9 tests passed.
- `ttt-s2s`: `npm.cmd install` was needed because `node_modules` was absent; it exited 0 with `added 44 packages in 1s`. The generated `node_modules` directory was removed after validation so the worktree returned to clean.
- `ttt-s2s`: `& 'C:\Program Files\Git\bin\bash.exe' scripts/validate.sh` exited 1 because `grep` was not on that direct invocation PATH; `& 'C:\Program Files\Git\bin\bash.exe' --login -lc 'cd /c/Users/reece/VSCodeProjects/ttt-s2s/.worktrees/server-release-tags && ./scripts/validate.sh'` exited 0; Vitest reported 3 test files passed and 15 tests passed.
- Docker: `docker build --pull --progress plain -t s2script-runtime-image:release-manifest 'C:\Users\reece\VSCodeProjects\s2script-runtime-image\.worktrees\server-release-tags'` first failed inside the Codex sandbox with `ERROR: CreateFile C:\Users\reece\.docker\buildx\instances: Access is denied.`; rerunning outside the sandbox reported Docker unavailable: `ERROR: failed to connect to the docker API at npipe:////./pipe/dockerDesktopLinuxEngine; check if the path is correct and if the daemon is running: open //./pipe/dockerDesktopLinuxEngine: The system cannot find the file specified.`
- Docker: `docker build --pull --progress plain -t empty-s2s:release-tags C:\Users\reece\VSCodeProjects\empty-s2s\.worktrees\server-release-tags` was skipped because Docker was unavailable with the exact daemon error recorded above.
- Docker: `docker build --pull --progress plain --build-arg EMPTY_S2S_IMAGE=empty-s2s:release-tags -t ttt-s2s:release-tags C:\Users\reece\VSCodeProjects\ttt-s2s\.worktrees\server-release-tags` was skipped because Docker was unavailable with the exact daemon error recorded above.
- Old `base`: `git -C C:\Users\reece\VSCodeProjects\base status --short` was blocked in the Codex sandbox by Git dubious-ownership checks; rerunning the same read-only command outside the sandbox exited 0 with empty output.
- Old `ttt`: `git -C C:\Users\reece\VSCodeProjects\ttt status --short` was blocked in the Codex sandbox by Git dubious-ownership checks; rerunning the same read-only command outside the sandbox exited 0 with empty output.

Skipped checks:

- Docker image builds were skipped because Docker Desktop's Linux daemon was unavailable. Do not claim Docker builds passed for this verification run.
