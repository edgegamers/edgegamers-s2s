# Changesets, ownership, and releases

This is the canonical guide for contributing release intent and administering
the release path for EdgeGamers Source2Script plugins.

Use the [developer guide](./developer-guide.md) for contributor setup, local
commands, branches, and pull-request steps. Use the
[repository setup guide](./repository-setup.md) to configure and verify the
protected branches, environments, teams, and secrets that this release path
depends on.

## Team review responsibilities

The repository uses three organization teams:

- `s2s-developer` provides contributor access. Its members can change plugin
  code and author every Changeset/versioning input, but this group is not a
  CODEOWNER and its approval does not satisfy required ownership review.
- `s2s-maintainers` is the default CODEOWNER. Maintainers review ordinary code,
  tests, documentation, and developer-authored release intent.
- `s2s-platform` owns critical manifests, repository ownership, release policy,
  and automation.

These exact team slugs are encoded in [CODEOWNERS](../.github/CODEOWNERS).
GitHub teams, access, rulesets, and environments still need the administrator
setup in [Manual GitHub Setup](../.github/MANUAL_SETUP.md); this guide does not
claim those remote settings have been applied.

## Private and public plugins

Every plugin manifest must declare an explicit boolean `private` value:

- `private: true` is internal and exempt from Changeset coverage and registry publication.
- `private: false` is public and enforced by Changeset coverage.
- Omitting `private` is invalid.

The plugin generator always creates `private: true` manifests. Public promotion
is a separate pull request changing `private: true` to `private: false`, adding
the public plugin's Changeset, and receiving both normal maintainer review and
platform review of the manifest. A public plugin cannot be directly deleted or
changed back to private; use the staged retirement process under
[Failure recovery](#failure-recovery).

## When a Changeset is required

Add a Changeset for every affected public plugin when its behavior,
configuration, or interface changes. Use a patch for a compatible fix, a minor
for backward-compatible behavior, and a major for a behavior, configuration,
or interface break.

Runtime/source files and manifests are release-affecting. Plugin-local README
variants, `docs/**`, `test/**`, `tests/**`, conventional `*.test.*` and
`*.spec.*` files, and unambiguous plugin-local CI metadata do not require a
Changeset. Private-only changes are also exempt. These cases pass because the
policy classifies their paths and publication state, not because a label or
local environment variable bypasses coverage.

## Create and validate a Changeset

From the repository root, create and validate release intent with:

```powershell
npm.cmd run changeset
npm.cmd run changeset:status
npm.cmd run changeset:check
```

Any developer may add a Changeset. Include every affected public plugin in its
frontmatter before opening the pull request. Only Changeset Markdown added or
modified in the current pull request can satisfy that pull request; an older
pending Changeset already on `dev` cannot be reused as coverage.

## Version-packages pull requests

After changes merge to `dev`, the version workflow opens or updates the bot
pull request `changeset-release/dev` -> `dev`. It runs `s2s version`, consumes
pending Changesets, and never publishes packages. Review its version,
dependency-range, and changelog changes as release intent.

The narrow policy exception trusts only a `pull_request` targeting `dev` from
the exact `changeset-release/dev` branch when both the original author and the
current workflow actor are `github-actions[bot]`, the head repository is this
repository, and every change is generated version output. Generated output is
limited to removed release Changeset Markdown plus plugin `package.json` and
`CHANGELOG.md` files. A fork, human synchronization, lookalike path, source
file, workflow, or policy-file change is rejected.

GitHub may show **Approve workflows to run** for this bot pull request. A user
with write access must approve the run before required checks execute.

## Development delivery after merge to dev

After a pull request merges to `dev`, the development workflow installs the
locked dependencies, runs lint and typechecking, builds the Source2Script
workspace, and creates development server bundles. It moves the `dev-latest`
tag and prerelease to that commit, uploads the bundle index and archives, and
triggers the affected development server repositories through their GitLab
pipelines. Those repositories build and deploy their runnable development
images.

The version workflow also runs on pushes to `dev`. When pending Changesets
exist, it opens or updates the bot-owned version pull request described above.
Development delivery does not publish plugin versions to the Source2Script
registry.

## Maintainer dev to main promotion

After the merged change has been validated on development servers, and after
any required version-packages pull request has been reviewed and merged,
maintainers open the repository promotion pull request from `dev` to `main`.
Normal feature branches do not target `main`. The checked-in source-policy
validation accepts `dev` as the normal pull-request source for `main` and
rejects an ordinary topic branch. If administrators have applied and verified
the [documented repository setup](./repository-setup.md), the remote `main`
ruleset additionally requires its configured checks and CODEOWNERS review, and
the production workflow uses the configured protected environment. Tracked
policy and workflow files do not prove those remote protections are active.

## Production registry deployment

Every push to `main` validates and builds the workspace, creates production
server bundles, and moves the `latest` tag and GitHub release to that commit.
It then invokes `s2s deploy --ci` using the protected production
`S2SCRIPT_TOKEN`. Source2Script skips private plugins and versions already
present in the registry. Read
[Publishing to the registry](https://www.s2script.com/docs/publishing) for
registry behavior and publication requirements.

The corresponding root commands are:

```powershell
npm.cmd run version
npm.cmd run deploy -- --ci
```

## Hotfix from main directly to main

For an urgent production correction, branch `hotfix/<topic>` from the current
`main`, make the smallest focused fix, and add a PR-local Changeset when a
public plugin's behavior, configuration, or interface changes. Open this pull
request directly against `main`. The checked-in source-policy validation
accepts `hotfix/*` as the exception to the normal `dev` source requirement and
rejects other topic branches. If administrators have applied and verified the
documented `main` ruleset, its configured maintainer and applicable CODEOWNERS
review requirements also protect the hotfix pull request; tracked policy files
alone do not establish that remote enforcement.

Merging the hotfix pushes directly to `main`, so it runs the same production
bundle and registry workflow as a normal `dev` to `main` promotion.

## Automatic post-hotfix main to dev synchronization

After a `hotfix/*` pull request is merged into `main`, the synchronization
workflow checks for an existing open `main` to `dev` pull request and opens one
when needed. Review, resolve conflicts, and merge that synchronization pull
request before the next production promotion so `dev` regains both the fix and
its release intent.

When the synchronized Changeset reaches `dev`, the normal version workflow can
apply it through the bot-owned `changeset-release/dev` pull request.

## Immediate hotfix bundles versus delayed registry versions

A merged hotfix updates the production `latest` bundle output in its
merge-triggered workflow, without waiting for a version pull request, even when
the public plugin manifest still has its previously published version. The
registry deployment step runs in that same workflow, but it does not turn a
Changeset into a version: Source2Script skips a version already present in the
registry.

Therefore an unversioned public hotfix is available in the new production
server bundle before it is available as a new public registry version. The new
registry version is published only after the `main` to `dev` synchronization
merges, the bot version pull request applies the Changeset on `dev`, and a
later `dev` to `main` promotion runs the registry deployment again. Server
repositories still decide when to consume the refreshed bundle and deploy it.

## Typed interface publication

Public runtime-only plugins omit `publishes` and `types`. Interface publishers
must keep the published interface version aligned through `s2s version` and
ship the declaration file referenced by `types`.

## Failure recovery

Missing tokens, declaration types, or versions fail the release without a
partial overwrite. Recover with a patch, minor, or major follow-up release as
appropriate, or yank the affected registry version when that is the supported
registry recovery path. Do not overwrite a published version.

For a planned retirement, first publish and promote a release that deprecates
the plugin and gives users a migration path. After that release is deployed,
request a platform-reviewed yank through the publisher dashboard or registry
API. Registry versions are never overwritten or deleted. Direct repository
deletion or `private: false` to `private: true` is rejected; removal remains
blocked until platform maintainers define an auditable retirement mechanism
that verifies the staged release and yank.

Troubleshoot policy and automation failures as follows:

- **Missing Changeset:** run `npm.cmd run changeset`, select every affected
  public package, choose the semantic bump, commit the new Markdown, and rerun
  `npm.cmd run changeset:check`.
- **Wrong Changeset:** edit the current pull request's Changeset frontmatter so
  package names and bump levels match the actual public changes. Do not rely on
  an unrelated pending Changeset from `dev`.
- **Blocked version PR checks:** confirm the PR is the bot-authored
  `changeset-release/dev` -> `dev` PR and contains only generated outputs. Use
  **Approve workflows to run** when GitHub requests approval. If a human or
  unexpected file synchronized the branch, do not bypass the check; let the
  version workflow recreate/update a clean bot revision.
- **Missing credentials, types, or duplicate version:** verify the protected
  production `S2SCRIPT_TOKEN`, ship the referenced declaration file, and let
  `s2s version` create a new version. Already-published versions are skipped,
  not overwritten.

## Server bundle boundary

This repository builds production server bundles from `main`; server
repositories decide when to consume a bundle, build an image, and deploy it.
They own host paths, compose configuration, restart behavior, and rollback.

Development server pipelines build their runnable images and restart their
development containers. Production server delivery updates the selected image
and compose configuration without a live restart; the scheduled host restart
at 10:00 applies the selected image.
