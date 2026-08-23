# Changesets, ownership, and releases

This is the canonical guide for contributing release intent and administering
the release path for EdgeGamers Source2Script plugins.

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

## Promote and deploy

The normal production promotion is `dev` -> `main`. Every push to `main`
invokes `s2s deploy --ci` using the production `S2SCRIPT_TOKEN` secret.
Source2Script skips private plugins and versions already present in the
registry. Read [Publishing to the registry](https://www.s2script.com/docs/publishing)
for registry behavior and publication requirements.

The corresponding root commands are:

```powershell
npm.cmd run version
npm.cmd run deploy -- --ci
```

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
