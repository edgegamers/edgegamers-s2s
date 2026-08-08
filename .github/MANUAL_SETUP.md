# Manual GitHub Setup

Complete these steps in GitHub after the repository has `main` and `dev` branches.

## 1. Repository Basics

1. Open repository settings.
2. Set the default branch to `main`.
3. Keep GitHub Actions enabled.
4. Set default workflow permissions to read-only.
5. Allow workflows to create pull requests if the hotfix sync workflow or future release PR automation needs it.
6. Do not enable `pull_request_target` workflows that run branch code with secrets.

## 2. Teams And CODEOWNERS

1. Create or confirm `@edgegamers/s2s-maintainers`.
2. Create or confirm `@edgegamers/s2s-platform`.
3. Update [.github/CODEOWNERS](./CODEOWNERS) if the real team slugs differ.
4. Add plugin-specific teams only after real plugin ownership exists.

## 3. Labels

Create labels from [.github/labels.yml](./labels.yml):

1. `no-changeset`
2. `release`
3. `release:hotfix`
4. `sync-required`
5. `breaking-change`
6. `plugin`
7. `shared-package`
8. `ci`
9. `documentation`

Only maintainers should apply `no-changeset` and `release:hotfix`.

## 4. Environments

Create `development`.

1. Limit deployment branches to `dev`.
2. Add `DEV_SSH_HOST`.
3. Add `DEV_SSH_PORT`.
4. Add `DEV_SSH_USER`.
5. Add `DEV_SSH_KEY`.
6. Add `DEV_S2SCRIPT_PLUGIN_DIR`.
7. Scope the SSH user to the remote staging path and Source2Script plugin directory.
8. Install Node.js 20 or newer on the SSH host and ensure `node` is available in
   the deploy user's non-interactive `PATH`. The remote reconciliation script uses
   Node.js for digest verification and manifest-scoped file operations.

Create `production`.

1. Limit deployment branches to `main`.
2. Require production reviewers.
3. Prevent self-review when the team size allows it.
4. Add `S2SCRIPT_TOKEN`.
5. Do not add production server SSH credentials. Production plugin delivery stops at the Source2Script registry.

## 5. dev Ruleset

Target branch: `dev`.

Enable:

1. Block deletions.
2. Block force pushes.
3. Require a pull request before merging.
4. Require at least one approval.
5. Dismiss stale approvals after new commits.
6. Require CODEOWNERS review.
7. Require conversation resolution.
8. Require status checks.
9. Require branch to be up to date, or enable merge queue.

Required checks:

1. `Source branch policy`
2. `Lint, typecheck, test, and build`
3. `Changeset policy`

## 6. main Ruleset

Target branch: `main`.

Enable the `dev` rules, then add:

1. Require two approvals when team size permits.
2. Restrict bypass to emergency maintainers.
3. Require the source branch policy check.
4. Allow normal promotion only from `dev`.
5. Allow direct hotfix PRs only from `hotfix/*` with maintainer approval.

Required checks:

1. `Source branch policy`
2. `Lint, typecheck, test, and build`
3. `Changeset policy`

## 7. Release Paths

Development releases build and reconcile managed plugin files over SSH. Production plugin delivery stops at the Source2Script registry.
