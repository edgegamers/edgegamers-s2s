# Changesets, ownership, and releases

This is the canonical guide for contributing release intent and administering
the release path for EdgeGamers Source2Script plugins.

## Team review responsibilities

Developers author Changesets. Maintainers review ordinary code and release
intent. The platform team reviews critical manifests, repository ownership, and
automation, as defined by [CODEOWNERS](../.github/CODEOWNERS).

## Private and public plugins

Every plugin manifest must declare an explicit boolean `private` value:

- `private: true` is internal and exempt from Changeset coverage and registry publication.
- `private: false` is public and enforced by Changeset coverage.
- Omitting `private` is invalid.

Documentation-only and private-only changes pass policy because the policy
classifies them correctly, not because a label overrides CI. No label or local
environment variable bypasses public-plugin Changeset coverage.

## When a Changeset is required

Add a Changeset for every affected public plugin when its behavior,
configuration, or interface changes. Use a patch for a compatible fix, a minor
for backward-compatible behavior, and a major for a behavior, configuration,
or interface break.

## Create and validate a Changeset

From the repository root, create and validate release intent with:

```powershell
npm.cmd run changeset
npm.cmd run changeset:status
npm.cmd run changeset:check
```

Any developer may add a Changeset. Include every affected public plugin in its
frontmatter before opening the pull request.

## Version-packages pull requests

After changes merge to `dev`, the version workflow opens or updates the bot
pull request `changeset-release/dev` -> `dev`. It runs `s2s version`, consumes
pending Changesets, and never publishes packages. Review its version,
dependency-range, and changelog changes as release intent.

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

## Server bundle boundary

This repository builds production server bundles from `main`; server
repositories decide when to consume a bundle, build an image, and deploy it.
They own host paths, compose configuration, restart behavior, and rollback.
