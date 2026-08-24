# Documentation overhaul design

## Purpose

Reorganize the repository documentation around the journeys readers actually
follow while preserving the repository's implemented branch, review, release,
deployment, ownership, and licensing behavior.

This change documents the current system. It does not change workflows,
scripts, CODEOWNERS, branch policy, plugin behavior, or deployment behavior.

## Readers and outcomes

The documentation serves four overlapping audiences:

1. Contributors need one path from an empty workstation to a reviewed pull
   request targeting `dev`.
2. Plugin authors need focused guidance for workspace placement, runtime
   interfaces, local builds, and Changesets.
3. Maintainers need the existing development, promotion, release, and hotfix
   flows written as an operational sequence.
4. Repository administrators need reproducible GitHub setup instructions with
   the reason for every team, ruleset, environment, permission, label, and
   secret.

## Canonical documentation map

`docs/navigation.md` remains the central navigation page. It groups pages by
reader intent instead of presenting an unstructured file list.

The canonical pages are:

- `docs/developer-guide.md`: prerequisites, clone and install, branch naming,
  editing, local checks, Changesets, pushing, the pull request to `dev`,
  development-server validation, version review, and promotion to `main`.
- `docs/repository-setup.md`: local repository foundations and remote GitHub
  administration, including explicit justifications and a verification
  checklist.
- `docs/architecture.md`: durable workspace, dependency, Source2Script, and
  server-deployment boundaries.
- `docs/plugin-development.md`: plugin creation and runtime-interface authoring.
- `docs/releases.md`: ownership, publication state, Changesets, version PRs,
  production promotion, registry deployment, retirement, recovery, and
  hotfix synchronization.
- `docs/licensing.md`: contribution licensing, first-party scope, artifact
  notices, third-party exclusions, and license validation.
- `docs/decisions/2026-08-24-documentation-overhaul.md`: this structural
  decision and its consolidation rationale.

The root README stays concise and routes readers to the navigation and
developer guides. `.github/CONTRIBUTING.md` remains GitHub's conventional
entry point but delegates detailed instructions to the developer guide.
`.github/MANUAL_SETUP.md` remains an administrator entry point but delegates
canonical setup details to the repository setup guide. `licenses/README.md`
continues to map the authoritative legal files and points to the operational
licensing guide.

## Consolidation

Useful material from `docs/getting-started.md`, `docs/local-development.md`,
`docs/SETUP.md`, and `docs/DESIGN.md` moves into the canonical pages. Those
four redundant pages are then removed so commands and policy are not described
differently in multiple places.

Tracked planning artifacts under `docs/superpowers/` are removed. The exact
root-relative path `/docs/superpowers/` is added to `.gitignore`; the existing
`/.superpowers/` ignore continues to cover local execution scratch data.

## Branch and delivery journeys

Normal work follows the current integration path:

1. Start from an up-to-date `dev` branch.
2. Create a focused branch such as `feat/<topic>`, `fix/<topic>`,
   `docs/<topic>`, `chore/<topic>`, or another descriptive category.
3. Implement and validate locally. Add PR-local Changesets for every affected
   public plugin when release-affecting behavior, configuration, or interfaces
   change.
4. Push the branch and open a pull request targeting `dev`.
5. Required checks and CODEOWNERS review protect the merge.
6. A merge to `dev` builds development bundles, publishes the moving
   `dev-latest` development release, and triggers every development-server
   pipeline represented in the generated bundle index.
7. The version workflow opens or updates the bot-owned
   `changeset-release/dev` pull request targeting `dev` when Changesets exist.
8. After development validation and any version PR merge, maintainers promote
   `dev` through a pull request targeting `main`.
9. A push to `main` validates, builds production bundles, updates the `latest`
   release, and deploys eligible public plugin versions to the Source2Script
   registry through the protected production environment.

Hotfixes follow the implemented exception:

1. Branch `hotfix/<topic>` from the current `main` branch.
2. Make the smallest production correction, including release intent and
   validation when a public plugin changes.
3. Open the hotfix pull request directly against `main` for maintainer and
   CODEOWNERS review.
4. Merging triggers the normal production workflow. Production server bundles
   update immediately; the registry deploy step runs but cannot publish a new
   public plugin version until its Changeset has been applied to a manifest.
5. The sync workflow opens a `main` to `dev` pull request so the correction and
   its Changeset are not lost during the next promotion.
6. After that sync merges, the normal bot version PR applies the Changeset on
   `dev`; a subsequent `dev` to `main` promotion publishes the new registry
   version. The guide must call out this delay instead of implying that an
   unversioned hotfix is immediately available from the registry.

Documentation must distinguish contributor actions from maintainer,
administrator, bot, server-repository, and Source2Script responsibilities.

## Repository setup rationale

The repository setup guide explains both the setting and why it exists:

- `main` represents reviewed production state; `dev` is the integration and
  development-server branch.
- `s2s-developer` grants contributor access without ownership approval;
  `s2s-maintainers` owns ordinary changes; `s2s-platform` owns critical policy,
  manifests, automation, and production controls.
- Read-only default Actions permissions limit ambient authority; workflows
  request only the permissions their jobs require.
- Branch rules prevent force pushes and deletion, require PRs, checks,
  conversation resolution, and CODEOWNERS review, and constrain production
  promotion to `dev` or the audited `hotfix/*` exception.
- The `development` and `production` environments separate branch access and
  secret exposure; production adds platform review and self-review protection
  where team size permits.
- GitLab trigger secrets hand development delivery to server repositories;
  `S2SCRIPT_TOKEN` is production-only registry authority.

The guide reports remote settings as required setup and verification work. It
must not claim they are active merely because configuration files exist.

## Licensing model

First-party repository work remains licensed under `MIT OR Apache-2.0`.
Contributors must have authority to submit their material under those terms.
Dependencies, Source2Script, third-party assets, names, logos, and Valve
software retain their own terms.

Distributed `.s2sp` artifacts use the MIT option and must retain the complete
MIT notice. `npm run license:check`, `npm run build`, and the post-build
artifact check enforce the implemented repository policy. The authoritative
terms remain `LICENSE` and the files under `licenses/`.

## Verification

The overhaul is complete when:

- all retained local Markdown links resolve;
- navigation reaches every canonical guide;
- no retained page links to a removed document or `docs/superpowers/`;
- documented commands exist in `package.json` and match the workflows;
- normal, version, production-promotion, and hotfix flows match current GitHub
  Actions and branch-policy scripts;
- licensing text matches `LICENSE`, package metadata, and license scripts;
- documentation-only changes pass `npm run license:check`, `npm test`, and
  `git diff --check`.
