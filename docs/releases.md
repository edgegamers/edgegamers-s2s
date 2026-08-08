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
| Private-only tooling | Normally no |
| Private plugin behavior or public contract | Yes |

Add release intent from the repository root:

```powershell
npm.cmd run changeset
```

Validate pending Changesets with:

```powershell
npm.cmd run changeset:status
npm.cmd run changeset:check
```

The coverage check compares changed plugin paths with package metadata. Private
plugins are included when they affect server behavior, and the check fails when
a changed plugin is missing from pending Changeset frontmatter. Local overrides
use `ALLOW_MISSING_CHANGESET=true`; CI must derive any override from trusted
pull-request metadata rather than arbitrary branch input.

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

Development deployment builds `.s2sp` files, writes
`artifacts/development-manifest.json`, uploads a GitHub Actions artifact, and
reconciles the managed files on affected development servers over SSH. Server
targets and their live plugin directories are defined in
`config/development-servers.json`; GitHub secrets only hold the SSH host, user,
key, and optional port. The remote manifest
`.edgegamers-development-manifest.json` is the ownership boundary: automation
deletes only stale files listed by the previous managed manifest and leaves
unmanaged files alone.

The SSH host must provide Node.js 20 or newer on the deploy user's
non-interactive `PATH`. Remote digest verification and manifest reconciliation
run with that `node` executable.

Disabled development plugins are still managed. They install under
`plugins/disabled/<plugin-name>.s2sp`, receive updates from the generated
manifest, and remain part of stale-file cleanup.

Each development target lists the plugin packages it consumes. A `dev` push
deploys only to targets whose plugin set intersects the changed plugin
packages. Shared package or workspace-level changes are treated as unknown
impact and reconcile every configured target with plugins.

## Operator release order

Use this order for server production releases:

1. Merge plugin changes through `edgegamers-s2s/main` with Changesets.
2. Let `edgegamers-s2s/main` create GitHub plugin release assets.
3. Merge common server changes to `empty-s2s/main`.
4. Tag `empty-s2s` with `YY.MM.DD`.
5. Let child dev servers auto-adopt the new common release.
6. Test child servers on `dev`.
7. Merge child server changes to `main`.
8. Tag the child server with `YY.MM.DD`.

Use `YY.MM.DD-HOTPATCH-N` when the date tag already exists.

Production servers adopt common files, plugin selections, and plugin versions
only when their own server repository is tagged. A new `empty-s2s` tag updates
child development servers automatically, but it does not change child production
servers by itself.

Server tag jobs write `server-release-manifest.json` as the production frozen
plugin snapshot at tag time.

## Production releases

Production plugin publication creates GitHub release assets first:

```text
pending Changesets
    ↓
s2s version
    ↓
review version, dependency-range, and changelog changes
    ↓
build .s2sp artifacts
    ↓
plugin release plan for packages named in Changesets
    |
GitHub release assets named <plugin-name>.s2sp
    |
server tag resolvers consume GitHub assets

optional branch from the release plan:
publishToRegistry: true -> Source2Script registry deploy
```

The corresponding root commands are:

```powershell
npm.cmd run version
npm.cmd run build
npm.cmd run release:plan
npm.cmd run release:github-plugins
npm.cmd run deploy:registry-opt-ins
```

`s2s version` applies Changesets and updates sibling interface ranges where required. Review its output before committing the release change.

`npm run deploy:registry-opt-ins` reads `artifacts/plugin-release-plan.json`,
narrows the Source2Script workspace to releases with
`publishToRegistry: true`, runs `s2s deploy --ci`, and restores the root
workspace config. If no planned release opts into registry publication, the
step skips cleanly. Automated registry deployment uses `S2SCRIPT_TOKEN`.

On `main`, the repository builds `.s2sp` files, detects pending Changesets, and
creates GitHub release assets only for plugin packages named in pending
Changeset frontmatter. The asset file name is stable: `<plugin-name>.s2sp`.
Server repositories resolve those GitHub releases at tag time.

Plugins with `edgegamers.release.publishToRegistry: true` may also publish to
the Source2Script registry. EdgeGamers servers still install EdgeGamers plugins
from GitHub release assets.

Required operator credentials:

- `edgegamers-s2s` GitHub Actions needs `contents: write` to create GitHub
  release assets and `S2SCRIPT_TOKEN` for registry opt-ins.
- Server GitLab tag resolvers need GitHub access for EdgeGamers plugin releases;
  configure `GH_TOKEN` when the releases are private or rate-limited.
- Child server GitLab tag resolvers need `GITLAB_API_TOKEN` that can read
  `empty-s2s` release artifacts.
- Production deploy jobs need SSH deploy credentials for their server path.

## Rollback boundary

Development rollout uses SSH deployment and manifest-scoped reconciliation. The remote manifest is the ownership boundary: reconciliation deletes only stale files listed by the previous managed manifest and leaves unmanaged files untouched. Automated rollback is not provided; recovery requires manually redeploying the desired development artifact and manifest. Registry versions are immutable; never overwrite or delete a published version as a rollback mechanism. Any production server selection policy belongs to the system that consumes GitHub releases, outside this repository milestone.
