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

- Run `npm run build`; its repository license gate and postbuild artifact-notice
  gate must both pass.
- Audit the code that will be bundled and its license terms and required
  notices when introducing or changing an `s2script.libraries` dependency.
  The repository checker rejects libraries that do not have an explicit
  first-party compliance path.

## Development builds

Development builds do not publish permanent registry releases for every commit:

```text
s2s build
    ↓
immutable .s2sp artifacts
    ↓
development-manifest.json
    ↓
development server SSH deployment and manifest-scoped reconciliation
```

Build and generate the manifest:

```powershell
npm.cmd run build
npm.cmd run manifest:dev
```

The manifest is written to `artifacts/development-manifest.json`. Entries are sorted by artifact path and contain the commit-derived `dev.<short-sha>` revision plus a SHA-256 digest.

Development deployment builds `.s2sp` files, writes `artifacts/development-manifest.json`, uploads a GitHub Actions artifact, and reconciles the managed files on the development server over SSH. The remote manifest `.edgegamers-development-manifest.json` is the ownership boundary: automation deletes only stale files listed by the previous managed manifest and leaves unmanaged files alone.

The SSH host must provide Node.js 20 or newer on the deploy user's
non-interactive `PATH`. Remote digest verification and manifest reconciliation
run with that `node` executable.

## Production releases

Production publication stops at the Source2Script registry:

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

On `main`, the repository builds `.s2sp` files and creates GitHub release
assets for every released plugin. The asset file name is stable:
`<plugin-name>.s2sp`. Server repositories resolve those GitHub releases at
tag time.

Plugins with `edgegamers.release.publishToRegistry: true` may also publish to
the Source2Script registry. EdgeGamers servers still install EdgeGamers plugins
from GitHub release assets.

## Rollback boundary

Development rollout uses SSH deployment and manifest-scoped reconciliation. The remote manifest is the ownership boundary: reconciliation deletes only stale files listed by the previous managed manifest and leaves unmanaged files untouched. Automated rollback is not provided; recovery requires manually redeploying the desired development artifact and manifest. Registry versions are immutable; never overwrite or delete a published version as a rollback mechanism. Any production server selection policy belongs to the system that consumes GitHub releases, outside this repository milestone.
