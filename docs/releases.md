# Changesets and releases

Each publishable plugin is versioned independently. Contributors record release intent with Changesets; Source2Script applies the workspace-aware version changes and publishes eligible plugins.

## When a Changeset is required

| Change | Changeset? |
|---|---|
| Publishable runtime behavior or public contract | Yes |
| Compatible bug fix | Yes, patch |
| Backward-compatible feature | Yes, minor |
| Breaking contract or configuration | Yes, major |
| Documentation, tests, CI, or formatting | Normally no |
| Private-only tooling or private plugin | Normally no |

Add release intent from the repository root:

```powershell
npm.cmd run changeset
```

Validate pending Changesets with:

```powershell
npm.cmd run changeset:status
npm.cmd run changeset:check
```

The coverage check compares changed plugin paths with package metadata. It ignores private plugins and fails when a changed publishable plugin is missing from pending Changeset frontmatter. Local overrides use `ALLOW_MISSING_CHANGESET=true`; a future CI integration must derive any override from trusted pull-request metadata rather than arbitrary branch input.

## Licensing release checks

Before deployment:

- Run `npm run build`; its repository license gate and postbuild artifact-notice gate must both pass.
- Audit the code that will be bundled and its license terms and required notices when introducing or changing an `s2script.libraries` dependency. The repository checker rejects libraries that do not have an explicit first-party compliance path.

## Development builds

Development builds do not publish permanent registry releases for every commit:

```text
s2s build
    ↓
server bundle zip files
    ↓
GitHub Actions artifact upload
    ↓
GitLab server pipeline trigger
    ↓
server repository image build and SSH dev deploy
```

`edgegamers-s2s` does not SSH to game servers. Server repositories own compose,
host paths, image deployment, and restart behavior.

Build server bundles with:

```powershell
npm.cmd run build
npm.cmd run bundles:servers -- --environment development
```

The development workflow uploads bundles from `artifacts/server-bundles/` and triggers the associated server repository pipelines.

## Production releases

Production release intent is recorded with Changesets:

```text
pending Changesets
    ↓
s2s version
    ↓
review version, dependency-range, and changelog changes
    ↓
s2s deploy
    ↓
Source2Script registry
```

The corresponding root commands are:

```powershell
npm.cmd run version
npm.cmd run deploy -- --ci
```

`s2s version` applies Changesets and updates sibling interface ranges where required. Review its output before committing the release change.

`s2s deploy` builds the workspace, creates a deployment plan, skips private plugins, skips versions already present in the registry, and publishes eligible plugins in dependency order. Automated deployment uses `S2SCRIPT_TOKEN` and the CLI's `--ci` flag.

Production bundles are immutable CI artifacts created from `main`. Server
repositories choose when to consume a production bundle, build a production
image, and update production runtime selection. Production deploys do not force
restart unless the server repository's production deploy command explicitly
does so.

## Rollback boundary

Server repositories own development rollback and restart behavior. Registry
versions and CI bundle artifacts are immutable; never overwrite or delete a
published version as a rollback mechanism. Any production server selection
policy belongs to the system that consumes the bundle, outside this repository.
