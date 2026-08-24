# Repository setup guide

## Purpose and current-state warning

This is the canonical guide for administering the `edgegamers-s2s` GitHub
repository. Tracked files describe the desired configuration and the workflows
that rely on it; they do **not** prove the current remote GitHub state. An
administrator must inspect GitHub after applying this guide to confirm teams,
repository settings, labels, environments, rulesets, and secrets. Never place
secret values in this repository or this document.

## Local repository foundation

Use Node.js `>=24 <25` (the committed `.nvmrc` selects Node 24) and npm
`>=11`; `package.json` declares `npm@11.16.0`. Keeping those toolchain bounds
and the npm version explicit makes local and CI installs reproducible.

The root workspace package must remain `private: true` and has no supported
publication path. Generated plugin manifests also begin `private: true`; only
those manifests may be promoted to `private: false` in a separate,
platform-reviewed public-promotion change. Commit `package-lock.json` whenever
dependencies change so CI and contributors resolve the same dependency tree.

The npm workspace globs are `plugins/*/**` and `packages/*/**`. They link
workspace packages locally instead of requiring unpublished packages to be
installed from a registry. Source2Script discovers plugin workspaces through
the narrower `plugins/*/**` glob, which keeps SDK plugin discovery aligned with
the workspace layout. The `@s2script/cli` dependency is installed locally, so
the `s2s` commands in npm scripts use the repository-managed CLI rather than a
developer's global installation.

## Workspace and scope policy

`workspace-policy.json` allows the `cs2` game scope. The first directory below
`plugins/` or `packages/` is the policy boundary: `global` is game-agnostic and
`cs2` is game-specific. Directories below that scope are free-form.

The policy classifies `@s2script/sdk` as `global` and `@s2script/cs2` as
`cs2`. Global packages may only reference global packages; `cs2` packages may
reference global packages and other `cs2` packages. The workspace-boundary
check enforces these rules for manifests and source imports. This prevents a
game-neutral package from gaining a CS2 dependency and makes the supported SDK
surface explicit.

## Why the repository uses main and dev

`dev` is the integration branch: development artifacts are built there and
version pull requests target it. `main` is the production branch: a push runs
the production deployment workflow using the production environment. This
separation lets changes be reviewed and exercised before promotion while
preserving a clear production source. Normal promotion is `dev` to `main`.

A direct `hotfix/*` pull request to `main` is an exception for an urgent,
reviewed production fix. After a merged hotfix, the synchronization workflow
opens a `main` to `dev` pull request so the integration branch regains the
production fix before the next promotion.

## GitHub teams and ownership

Use these exact organization team slugs unless the organization has deliberately
chosen different ones (and update `.github/CODEOWNERS` if it has):

| Team | Responsibility |
| --- | --- |
| `s2s-developer` | Contributor access. Members can author code and Changesets, but this team is not a CODEOWNER and its approval cannot substitute for required maintainer or platform review. |
| `s2s-maintainers` | Default CODEOWNER for ordinary code, tests, documentation, and release intent. |
| `s2s-platform` | CODEOWNER for critical manifests, automation, ownership, release policy, environments, and production controls. |

Give both CODEOWNER teams (`s2s-maintainers` and `s2s-platform`) visible
repository write access. GitHub must be able to resolve the teams and request
their reviews for CODEOWNERS protection to be meaningful. Keep
`s2s-developer` as a contributor group rather than a CODEOWNER so an author
cannot replace the independent ownership review. Do not add plugin-specific
teams until actual, stable plugin ownership boundaries exist; premature teams
create nominal review paths without real accountability.

## Repository settings

Configure the following in GitHub repository settings:

| Setting | Desired state and reason |
| --- | --- |
| Default branch | `main`. This identifies the production history and aligns repository navigation with the production deployment workflow. |
| GitHub Actions default workflow permissions | Read-only. This is the least-privilege baseline; individual workflows request only the additional permissions needed. |
| Allow GitHub Actions to create and approve pull requests | Enabled. The versioning and synchronization automation must be able to open their repository-maintenance pull requests; reviews and branch protections still control merges. |
| `pull_request_target` workflows that run branch code with secrets | Disabled/not added. Avoid exposing secrets to untrusted pull-request code. |

## Labels

Create and maintain the labels declared in `.github/labels.yml`; they make
release state, risk, and ownership visible in triage:

| Label | Meaning |
| --- | --- |
| `release` | Release planning or release automation work. |
| `release:hotfix` | Production hotfix allowed to target `main` directly. |
| `sync-required` | `main` must be synchronized back into `dev` before the next promotion. |
| `breaking-change` | Plugin behavior, configuration, or runtime interface breaks compatibility. |
| `plugin` | Work scoped to one or more Source2Script plugins. |
| `shared-package` | Work scoped to private shared npm workspace packages. |
| `ci` | GitHub Actions, validation, release, or repository automation. |
| `documentation` | Documentation-only work. |

Also preserve the tracked label colors and descriptions when creating or
updating these labels; the file is the source of truth for those details.

## Environments and secrets

Create two GitHub Actions environments:

| Environment | Configuration and reason |
| --- | --- |
| `development` | Restrict deployment branches to `dev`. This keeps development bundle creation and downstream server triggers on the integration branch. |
| `production` | Restrict deployment branches to `main`; require `s2s-platform` as a reviewer; prevent self-review where GitHub and team size permit. This separates production authority from authorship and protects promotion integrity. |

Store `S2SCRIPT_TOKEN` only as a production environment secret. The production
workflow supplies it to `s2s deploy -- --ci`; keeping it environment-scoped
limits registry credentials to the production deployment path.

Configure these GitHub repository secrets for the development server pipeline,
without recording their values anywhere in the repository:

| Secret | Purpose |
| --- | --- |
| `GITLAB_URL` | GitLab base URL used for development pipeline triggers. |
| `GITLAB_PROJECT_ID_EMPTY_S2S` | GitLab project identifier for the empty development server. |
| `GITLAB_TRIGGER_TOKEN_EMPTY_S2S` | Trigger token for that empty server project. |
| `GITLAB_PROJECT_ID_TTT_S2S` | GitLab project identifier for the TTT development server. |
| `GITLAB_TRIGGER_TOKEN_TTT_S2S` | Trigger token for that TTT server project. |

The server repositories retain their own GitLab SSH deployment secrets. This
keeps server and host deployment authority with the repository that owns the
server image rather than granting this plugin repository broader access.

## Branch rulesets

Create rulesets (or the equivalent branch protection configuration) for `dev`
and `main`. Use the exact required-check display names from
`.github/workflows/validate.yml`:

- `Source branch policy`
- `Lint, typecheck, test, and build`
- `Changeset policy`

### dev ruleset

Target `dev` and block branch deletion and force pushes. Require a pull request
before merge, at least one approval, dismissal of stale approvals after new
commits, CODEOWNERS review, and resolution of all conversations. Require the
three checks listed above and require the branch to be up to date before merge,
or enable a merge queue that provides the equivalent current-head validation.
These controls ensure that the integration branch only accepts reviewed,
validated changes and that a later commit cannot reuse an obsolete review.

### main ruleset

Target `main` and retain all `dev` protections: no deletion or force pushes,
pull requests, stale-review dismissal, CODEOWNERS, conversation resolution,
the exact required checks, and up-to-date branch or merge-queue validation.
Require two approvals where team size permits and limit bypass to emergency
maintainers. The stronger review and narrow bypass are appropriate because
`main` activates production deployment.

For source policy, normal pull requests to `main` must come from `dev`. Allow a
reviewed `hotfix/*` pull request as the emergency exception; the `Source branch
policy` check enforces this distinction. A hotfix still needs maintainer review
and then must be synchronized back to `dev`.

## Release-path administration

On `dev`, the version workflow opens or updates
`changeset-release/dev` to `dev`, runs `s2s version`, consumes Changesets, and
does not publish. Bot pull-request workflow runs may enter an
approval-required state; a user with write access must choose **Approve
workflows to run** before required checks can execute. The narrowly scoped
Changeset-policy exception requires the original PR author and workflow actor
to be `github-actions[bot]`, a same-repository head, and only generated
Changeset removal, plugin manifest, and changelog paths. Do not push human
fixes to the bot branch; let the version workflow update it.

After review and merge of the version pull request, promote `dev` to `main`.
The `main` workflow deploys Source2Script packages with the production
`S2SCRIPT_TOKEN`, publishes production bundles, and leaves each server
repository to decide when to consume bundles and deploy its production image.
That boundary preserves server-repository ownership.

## Verification and smoke tests

After configuring GitHub, verify both the settings and the behavior they are
meant to protect:

1. Confirm `s2s-maintainers` and `s2s-platform` are visible to the repository,
   have write access, and receive the expected CODEOWNER review requests;
   confirm `s2s-developer` does not replace either request.
2. Attempt protected-branch deletion and force-push operations with a safe test
   branch or ruleset simulation, and confirm the `dev` and `main` rulesets
   reject them. Verify a pull request requires the intended approvals,
   CODEOWNERS, conversation resolution, and all three required checks.
3. Open or update a bot version pull request and confirm a user with write
   access can approve the workflow run, after which the required checks report
   the exact display names above.
4. Merge a safe `dev` change and confirm the development workflow builds the
   bundle release tagged `dev-latest`. Confirm every GitLab server pipeline
   represented in the generated `bundles.json` receives the development trigger
   and that no secret value appears in logs.
5. Promote a reviewed `dev` change to `main` and confirm the production
   environment requires `s2s-platform` approval without self-review where
   available. Confirm registry authentication succeeds through
   `S2SCRIPT_TOKEN` without exposing it.
6. Verify the source policy accepts `dev` to `main`, rejects an ordinary branch
   to `main`, and accepts a reviewed `hotfix/*` exception. After merging a
   test hotfix, confirm the automated `main` to `dev` synchronization pull
   request opens and is merged before the next promotion.

## Ongoing administration

Review this guide whenever a workflow, CODEOWNERS path, workspace policy,
label, or release path changes. Re-run the smoke tests after changing remote
rulesets, environments, teams, or secret bindings. The remote configuration is
operational state; record its intended shape here, but verify it in GitHub.
