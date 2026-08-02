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
2. Add no production credentials.
3. Add development deployment secrets only after EdgeGamers chooses the artifact transport.

Create `production`.

1. Limit deployment branches to `main`.
2. Require production reviewers.
3. Prevent self-review when the team size allows it.
4. Add `S2SCRIPT_TOKEN` only after registry publishing is approved.
5. Do not add server rollout credentials until production server install paths and reconcile commands are known.

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

## 7. Release Path Stubs

The repository can build Source2Script packages and upload GitHub Actions artifacts now. EdgeGamers still needs to choose the server release paths.

Development release path to define:

1. Artifact destination.
2. Development server plugin directory.
3. Integrity verification method.
4. Atomic activation process.
5. Rollback pointer or previous-release directory.
6. Reconcile command or API.

Production release path to define:

1. Whether production servers pull from the Source2Script registry only.
2. Exact manifest format if a production manifest remains required.
3. Production server plugin directory.
4. Registry token scope.
5. Reconcile command or API.
6. Canary and rollback procedure.

Until those details exist, workflows stop after building artifacts or publishing to Source2Script. They intentionally do not run server deployment commands.
