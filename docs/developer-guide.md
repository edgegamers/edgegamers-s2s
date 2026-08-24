# Developer guide

## The branch and release path

Use a short-lived topic branch for ordinary work, merge it into `dev`, and
validate it on development servers before maintainers promote `dev` to `main`.
The initial contributor PR targets `dev`; the later `dev` to `main` PR is the
repository promotion PR, not a second feature PR.

```text
feat/*, fix/*, docs/*, chore/* -> dev -> development servers
                                      -> changeset-release/dev -> dev
                                      -> dev-to-main PR -> main -> production

main -> hotfix/* -> main -> automated main-to-dev PR -> dev
```

## Prerequisites

Use the Node.js and npm versions declared in `.nvmrc` and `package.json`, Git,
and an account that can open GitHub pull requests. Contributors without direct
push access should fork the repository, clone their fork, and add the upstream
repository as an `upstream` remote so they can update their topic branch from
`upstream/dev`. Contributors with access may push their topic branch directly
to the repository.

## Clone and install

Clone the repository, start from the current `dev`, and install dependencies:

```powershell
git clone https://github.com/edgegamers/edgegamers-s2s.git
Set-Location edgegamers-s2s
git switch dev
git pull --ff-only origin dev
npm.cmd install
```

For a fork clone, replace the clone URL with your fork and fetch `upstream`
before switching to or updating from `upstream/dev`.

## Choose or create work

Choose a focused issue or repository change, read the relevant plugin and
documentation, and keep tests with behavior changes. For a new plugin, use
the repository's plugin generator and follow the workspace scope rules.

## Create a topic branch from dev

Create a category-prefixed topic branch from the updated `dev` branch:

```powershell
git switch -c feat/<descriptive-topic>
```

`<descriptive-topic>` is illustrative, not literal. Use `fix/`, `docs/`,
`chore/`, or another clear category when it better describes the change.

## Develop a plugin or repository change

Make the focused change and include tests when behavior changes. Ordinary code,
tests, documentation, and developer-authored Changesets receive maintainer
review. Platform reviewers own critical paths such as workflows, manifests,
repository policy, and automation under `CODEOWNERS`.

## Add release intent when required

For a public runtime, configuration, or interface change, create release
intent for every affected public plugin and check it locally:

```powershell
npm.cmd run changeset
npm.cmd run changeset:status
npm.cmd run changeset:check
```

Use a patch for a compatible fix, a minor for backward-compatible behavior,
and a major for a breaking behavior, configuration, or interface change.
Documentation-only and private-only changes do not require a Changeset.

## Validate locally

Run the full local gate from the repository root before opening a pull request:

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
npm.cmd run changeset:check
```

## Push and open the pull request to dev

Push the current topic branch:

```powershell
git push -u origin HEAD
```

Open a pull request to `dev`. For forks, GitHub presents the fork branch as
the PR source; do not try to push directly to the upstream repository unless
you have that access. Ordinary feature PRs target `dev`, not `main`.

## Respond to checks and review

The pull request validation runs linting, typechecking, tests, a build, and
the Changeset policy. Address failures and review feedback on the topic branch.
Maintainers review ordinary work, while platform review is required for
critical paths owned in `CODEOWNERS`.

## Test the merged change on development servers

After a merge to `dev`, automation validates and builds the workspace,
publishes `dev-latest` server bundles, and triggers affected development server
pipelines. Test the merged behavior on the development servers before a
production promotion.

## Version packages

After changes merge to `dev`, the Changesets Action opens or updates the
`changeset-release/dev` pull request targeting `dev`. It runs `s2s version`
to consume pending Changesets, but does not publish packages. Review its
version, dependency-range, and changelog changes, then merge it to `dev` when
ready.

## Promote dev to main

After development validation, maintainers open the repository promotion PR
from `dev` to `main`. This is the later promotion stage; a contributor's
initial topic-branch PR remains a PR to `dev`. Do not open arbitrary feature
branches directly against `main`.

## Production outcomes

When `main` receives the approved promotion, automation builds production
bundles, updates the `latest` GitHub release, and runs `s2s deploy --ci` using
the protected production token. Registry publication follows the versioned
packages on `main`; private packages and already-published versions are
skipped.

## Hotfix workflow

For an urgent production fix, branch `hotfix/*` from current `main`, make the
minimal fix, add PR-local release intent when required, and open the pull
request to `main`. After it merges, `main` builds and deploys production
bundles immediately, then automation opens a `main` to `dev` synchronization
PR. Merge that synchronization before the next production promotion.

An unversioned public hotfix reaches production server bundles immediately,
but reaches the registry only after synchronization to `dev`, bot versioning,
and a later `dev` to `main` promotion.

## Troubleshooting

- For a missing or incorrect Changeset, run `npm.cmd run changeset`, ensure it
  covers every affected public plugin in the current PR, and rerun
  `npm.cmd run changeset:check`.
- If the version PR is blocked, confirm it is the bot-authored
  `changeset-release/dev` to `dev` PR with generated output only. A user with
  write access may need to approve its workflow run.
- If a fork is behind, fetch `upstream`, update from `upstream/dev`, resolve
  conflicts locally, and push the topic branch back to the fork.
- If a production deployment fails, check the protected production token,
  required declaration types, and version status. Published registry versions
  are not overwritten.
