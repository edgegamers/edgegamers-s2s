# Manual GitHub Setup

Complete these steps in GitHub after the repository has `main` and `dev` branches.

## 1. Repository basics

1. Open repository settings and set the default branch to `main`.
2. Keep GitHub Actions enabled with default workflow permissions set to read-only.
3. Keep **Allow GitHub Actions to create and approve pull requests** enabled.
4. Do not enable `pull_request_target` workflows that run branch code with secrets.

## 2. Teams and CODEOWNERS

1. Create or confirm `@edgegamers/s2s-developer` for contributor access.
2. Create or confirm `@edgegamers/s2s-maintainers` for default review.
3. Create or confirm `@edgegamers/s2s-platform` for critical ownership.
4. Give both CODEOWNER teams, `s2s-maintainers` and `s2s-platform`, explicit repository write access and ensure they are visible to the repository.
5. Keep `s2s-developer` as a contributor group, not a CODEOWNER; its members
   may author code and Changesets, but their approval does not replace a
   required maintainer or platform review.
6. Treat `private: true` to `private: false` as a separate platform-reviewed
   public-promotion change. Generated plugins always start private.
7. Update [.github/CODEOWNERS](./CODEOWNERS) if the real team slugs differ.
8. Add plugin-specific teams only after real plugin ownership exists.

## 3. Labels

Create labels from [.github/labels.yml](./labels.yml):

1. `release`
2. `release:hotfix`
3. `sync-required`
4. `breaking-change`
5. `plugin`
6. `shared-package`
7. `ci`
8. `documentation`

## 4. Environments

Create `development` and limit deployment branches to `dev`.

Create `production`:

1. Restrict deployment branches to `main`.
2. Assign `s2s-platform` as the production environment reviewer.
3. Prevent self-review when team size permits.
4. Store `S2SCRIPT_TOKEN` in the environment.

## 5. dev ruleset

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

## 6. main ruleset

Target branch: `main`.

Enable the `dev` rules, then add:

1. Require two approvals when team size permits.
2. Restrict bypass to emergency maintainers.
3. Require the source branch policy check.
4. Allow normal promotion only from `dev`.
5. Allow direct hotfix pull requests only from `hotfix/*` with maintainer approval.

Required checks:

1. `Source branch policy`
2. `Lint, typecheck, test, and build`
3. `Changeset policy`

## 7. Release paths

The version workflow opens or updates `changeset-release/dev` -> `dev`; it
runs `s2s version`, consumes Changesets, and never publishes. Bot pull-request
workflow runs enter an approval-required state; a user with write access must
choose **Approve workflows to run** before required checks execute.

The Changeset-policy exception also requires the original PR author and current
workflow actor to be `github-actions[bot]`, a same-repository head, and only
generated Changeset removal, plugin manifest, and changelog paths. Do not push
human fixes to the bot branch; let the version workflow update it.

After reviewing and merging the version pull request, normal promotion targets
`main` from `dev`. The `main` workflow invokes `s2s deploy --ci` with the
production `S2SCRIPT_TOKEN`, while server repositories choose when to consume
the bundles and deploy their production images.

## GitLab trigger secrets

`edgegamers-s2s` needs these GitHub secrets:

- `GITLAB_URL`
- `GITLAB_PROJECT_ID_EMPTY_S2S`
- `GITLAB_TRIGGER_TOKEN_EMPTY_S2S`
- `GITLAB_PROJECT_ID_TTT_S2S`
- `GITLAB_TRIGGER_TOKEN_TTT_S2S`

Each server repository keeps its own GitLab SSH deployment secrets.
