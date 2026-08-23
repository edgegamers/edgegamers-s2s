# Code Ownership and Release Governance Design

**Date:** 2026-08-23

**Status:** Approved in chat; awaiting written-spec review

## Purpose

Establish team-based code ownership and a reviewable Changesets release flow for the EdgeGamers Source2Script workspace. Developers must be able to author Changesets without platform-team intervention, while critical release machinery remains platform-owned. Plugins explicitly marked public must be independently versioned and deployed to the Source2Script registry after the version changes have been reviewed.

## Goals

- Make repository review responsibility explicit through GitHub teams and CODEOWNERS.
- Require a Changeset for every behavior or contract change to a public plugin.
- Let any developer author Changesets as part of an ordinary pull request.
- Accumulate release intent on `dev` and turn it into a reviewable version-packages pull request.
- Publish versioned public plugins to the Source2Script registry from `main`.
- Make private/public status explicit so omission cannot publish a plugin accidentally.
- Give contributors and administrators one guide for authoring, approval, versioning, deployment, and registry recovery.

## Non-goals

- Publishing the current private fixture plugins.
- Publishing private shared workspace packages.
- Replacing the existing `dev` to `main` promotion policy.
- Changing development server-bundle delivery or the GitLab server deployment boundary.
- Automatically yanking or overwriting an immutable registry version.
- Giving `s2s-developer` CODEOWNER approval authority.

## Team Responsibilities

### `@edgegamers/s2s-maintainers`

This is the default repository CODEOWNER. Maintainers review plugin source, tests, normal documentation, and developer-authored Changeset Markdown. A Changeset is ordinary release metadata attached to a code change; creating one does not require platform membership.

### `@edgegamers/s2s-platform`

This team owns critical repository and release surfaces:

- `.github/CODEOWNERS`
- GitHub Actions workflows
- `.changeset/config.json`
- Changeset enforcement and release-policy scripts and tests
- workspace boundary policy
- security configuration
- plugin `package.json` manifests

Plugin manifests are platform-owned because they define package identity, dependency and interface contracts, version state, and the private/public boundary. A pull request may therefore require both maintainer and platform approval when it changes code and critical metadata.

### `@edgegamers/s2s-developer`

This is a contributor/access group. Its members may create code changes and Changesets, but the team is not a required CODEOWNER and its approval does not replace a required maintainer or platform approval.

## Explicit Publication State

Every plugin manifest must contain a boolean `private` field:

- `"private": true` means internal-only. The plugin does not require Changesets and must not be sent to the registry.
- `"private": false` means public-release eligible. Changeset coverage and independent versioning are mandatory, and the main release workflow may deploy it.

An omitted or non-boolean `private` field is invalid. Although package tooling commonly treats an omitted field as public, this repository requires an explicit value to prevent accidental publication.

Changing `private` from `true` to `false` is a critical manifest change and requires platform review through CODEOWNERS. Making a plugin public does not itself bypass the normal maintainer review of its implementation and release notes.

Typed inter-plugin interfaces are a separate concern from public registry eligibility. A public runtime-only plugin omits `s2script.publishes`. A plugin that publishes an interface must define `s2script.publishes` and point `types` to an existing `.d.ts` file, as required by the Source2Script registry.

## Changeset Policy

A public plugin needs a Changeset for any change that affects its runtime behavior or supported contract:

- compatible fixes use `patch`;
- backward-compatible features use `minor`;
- breaking behavior, configuration, or interface changes use `major`.

Documentation, tests, formatting, CI-only work, private tooling, and changes limited to private plugins normally need no Changeset.

Pull-request validation compares changed plugin paths with explicit publication state. Every affected public plugin must be named in pending Changeset frontmatter. Failures list the missing package names and direct contributors to the repository Changeset command.

The current `.changeset/spicy-lands-divide.md` names only the two private fixture plugins. It must be removed during implementation because it cannot represent a deployable public release.

## Version and Release Flow

### 1. Developer pull request

A developer targets `dev` with code, tests, and a Changeset when a public plugin is affected. CI runs linting, type checking, tests, builds, workspace checks, and Changeset coverage. Maintainers review ordinary code and Changeset content. Platform review is additionally required for critical files such as plugin manifests or release automation.

### 2. Accumulation on `dev`

Merged Changesets remain pending on `dev`. `.changeset/config.json` uses `dev` as its base branch so status and version calculations match the integration branch.

### 3. Automated version-packages pull request

A dedicated workflow runs after changes reach `dev`. Changesets automation maintains one bot-authored version-packages pull request against `dev` and invokes the repository's `npm run version` command (`s2s version`). The pull request:

- applies patch, minor, and major increments independently per public plugin;
- updates dependency ranges when required by Source2Script workspace interfaces;
- writes changelog entries;
- removes the consumed Changeset files;
- does not deploy packages.

The generated version pull request receives normal CODEOWNER review. Maintainers cover the consumed release intent and generated release notes; platform covers generated manifest/version changes and the critical release boundary.

Because the release pull request consumes Changesets while modifying public plugin manifests, ordinary coverage would reject it. Validation grants a narrow exemption only when GitHub event metadata identifies both the expected release branch and a pull request authored by `github-actions[bot]`. A contributor-controlled environment variable, branch name alone, label alone, or fork cannot qualify.

### 4. Promotion to `main`

After the version-packages pull request merges to `dev`, the normal reviewed `dev` to `main` promotion carries already-versioned manifests and changelogs. Existing main source-branch policy remains in force.

### 5. Registry deployment

The main release workflow always runs:

```text
npm run deploy -- --ci
```

It authenticates with the protected `S2SCRIPT_TOKEN` in the `production` environment. Source2Script builds the workspace, refuses invalid typed-interface packages, skips private plugins, skips versions already present in the registry, and publishes eligible versions in dependency order. Running deploy without a new public version is therefore a safe no-op and is preferable to looking for pending Changeset files, because a correct version pull request has already consumed those files.

The protected `production` environment remains the final deployment gate. Its branch restriction, reviewers, secret, and self-review policy are maintained outside the repository as documented manual GitHub configuration.

## Failure and Recovery Behavior

- A changed public plugin without a Changeset fails pull-request validation and names each uncovered package.
- A plugin with an omitted or non-boolean `private` field fails workspace validation before build or deploy.
- A private plugin is excluded from Changeset coverage and registry deployment.
- A malformed Changeset fails with its file path and invalid frontmatter line.
- A release automation failure leaves pending Changesets or the release pull request intact; it does not deploy from `dev`.
- A missing `S2SCRIPT_TOKEN` causes `s2s deploy --ci` to fail without prompting.
- A public interface publisher without an existing `.d.ts` `types` entry fails the Source2Script publication gate.
- An already-published version is skipped rather than overwritten.
- A bad public release is recovered by a new patch release. A registry version may be yanked through the publisher dashboard or registry API, but it is never overwritten or deleted as rollback.

## Repository Changes

Implementation is expected to touch these areas:

- `.github/CODEOWNERS` for default maintainer and critical platform ownership.
- `.github/workflows/validate.yml` for the trusted release-PR exemption.
- a new `dev` version-packages workflow using Changesets automation.
- `.github/workflows/release.yml` to deploy versioned public plugins regardless of pending Changeset files.
- `.changeset/config.json` to make `dev` the base branch.
- Changeset and workspace policy modules and tests for explicit publication state.
- plugin creation behavior/tests so new manifests retain an explicit private state.
- contributor, release, plugin-development, pull-request, and manual GitHub setup documentation.
- removal of the Changeset that targets only private fixtures.

Exact files, action versions, commands, and test cases will be specified in the implementation plan after this design is approved.

## Guide Requirements

The contributor-facing guide must explain:

1. the three team roles and which reviews a pull request needs;
2. how to select `patch`, `minor`, or `major`;
3. how any developer creates and locally validates a Changeset;
4. why private plugin changes do not need Changesets;
5. how platform reviewers intentionally change `private` to `false`;
6. how version-packages pull requests are generated, reviewed, and promoted;
7. how the main workflow authenticates and deploys to the Source2Script registry;
8. the additional `publishes` and `types` requirements for typed interfaces;
9. how to diagnose missing Changesets, credentials, types, and duplicate versions;
10. why registry versions are immutable and how yanking differs from releasing a fix.

The administrator section must list the required teams, branch rulesets, required checks, labels, `production` environment protection, and `S2SCRIPT_TOKEN` secret.

## Test Strategy

Automated policy tests must cover:

- explicit `private: true` classification;
- explicit `private: false` classification;
- rejection of missing and non-boolean publication state;
- Changeset coverage for public plugins;
- exclusion of private plugins;
- multiple affected public plugins;
- malformed Changeset frontmatter;
- nested plugin directories and package-name prefix collisions;
- the trusted bot release path and rejection of developer-controlled lookalikes where that logic is implemented in repository code;
- plugin creation retaining a valid explicit private state.

Repository verification must run the complete existing validation sequence plus focused policy tests. Workflow changes must be reviewed for least-privilege permissions, protected secret use, safe pull-request execution, and correct `dev`/`main` branch targeting.

## Acceptance Criteria

- CODEOWNERS expresses the approved team boundaries without naming an individual approver.
- Developers can add Changesets without platform-only approval.
- Public plugin behavior cannot merge without matching release intent, except for the trusted generated release pull request.
- Private plugin changes do not demand Changesets and private plugins cannot deploy.
- No plugin can become public accidentally through an omitted manifest field.
- Version changes are visible in an approved pull request before reaching `main`.
- Every new public version reaching `main` is offered to the Source2Script registry through `s2s deploy --ci`.
- The workflow safely skips private and already-published versions.
- The repository guide fully documents contributor and administrator procedures.
