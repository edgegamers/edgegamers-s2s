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

## Development builds

Development builds do not publish permanent registry releases for every commit:

```text
s2s build
    ↓
immutable .s2sp artifacts
    ↓
development-manifest.json
    ↓
EdgeGamers development transport and reconciliation (deferred)
```

Build and generate the manifest:

```powershell
npm.cmd run build
npm.cmd run manifest:dev
```

The manifest is written to `artifacts/development-manifest.json`. Entries are sorted by artifact path and contain the commit-derived `dev.<short-sha>` revision plus a SHA-256 digest. Generated artifacts remain local until later infrastructure connects an upload destination and development servers.

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

This repository does not need a second production upload system, production server manifest, installation command, or server-reconciliation layer. Registry deployment is the production boundary requested for this project.

## Rollback boundary

Development rollout and rollback depend on the future EdgeGamers artifact transport. Registry versions are immutable; never overwrite or delete a published version as a rollback mechanism. Any production server selection policy belongs to the system that consumes the registry, outside this repository milestone.
