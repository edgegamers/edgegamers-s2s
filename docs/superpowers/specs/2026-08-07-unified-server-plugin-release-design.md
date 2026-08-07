# Unified Server Plugin Release Design

## Status

Approved for implementation planning.

## Purpose

`edgegamers-s2s` is the authority for EdgeGamers Source2Script plugins, server
payload content, and server plugin selection. GitLab remains the authority for
server infrastructure: compose files, deployment jobs, hosts, secrets, and
environment-specific rollout mechanics. Development servers consume the latest
plugin artifacts built from `dev`. Production servers consume the latest plugin
artifacts built from `main` when a protected per-server production tag is
created.

Changesets remain the package change tracking and changelog mechanism. Server
operators do not maintain explicit plugin versions in server configuration.

## Goals

- Keep plugin source, server payload content, and server plugin selection in one
  repository.
- Support more Source 2 games without mixing game-specific APIs.
- Let development servers hot-reload the latest `dev` plugin artifacts.
- Let production server tags deploy the latest approved `main` plugin artifacts.
- Publish only selected plugins to the public Source2Script registry.
- Preserve auditability by recording the exact commit, artifacts, and checksums
  used by each deployment.

## Non-Goals

- Human-maintained plugin version pins in server repositories.
- Publishing every EdgeGamers plugin to the public Source2Script registry.
- Allowing global plugins to depend on a game-specific runtime API.
- Encoding every server's plugin set in CI workflow files.
- Managing server infrastructure, compose files, deployment jobs, host paths, or
  secrets in `edgegamers-s2s`.

## Repository Layout

The monorepo is organized by plugin scope and server game:

```text
edgegamers-s2s/
  plugins/
    global/
      core/
      permissions-api/
      admin-menu/

    games/
      cs2/
        cs2-api/
        rtv/
        ttt/
        karma/

  servers/
    games/
      cs2/
        empty/
          server.json
          s2script-plugins.txt
          payload/
            csgo/

        ttt/
          server.json
          s2script-plugins.txt
          payload/
            csgo/

  packages/
    global/
      shared-utils/

    games/
      cs2/
        cs2-shared/
```

`plugins/global/*` contains game-agnostic Source2Script plugins and plugin APIs.
`plugins/games/<game>/*` contains plugins and APIs tied to one game. `servers/`
contains server payload content and the declared plugin list for each server.
It does not contain authoritative compose files or GitLab deployment
infrastructure.

## Plugin Metadata

Every plugin package declares EdgeGamers metadata in `package.json`.

Global plugin:

```json
{
  "name": "@edgegamers/permissions-api",
  "private": true,
  "edgegamers": {
    "scope": "global",
    "publicRegistry": false
  }
}
```

Game-specific plugin:

```json
{
  "name": "@edgegamers/cs2-api",
  "private": true,
  "edgegamers": {
    "scope": "game",
    "game": "cs2",
    "publicRegistry": false
  }
}
```

Public registry plugin:

```json
{
  "name": "@edgegamers/example-public-plugin",
  "private": false,
  "edgegamers": {
    "scope": "game",
    "game": "cs2",
    "publicRegistry": true
  }
}
```

`private: false` alone is not enough for public publication. A package must also
set `edgegamers.publicRegistry: true`.

## Dependency Rules

The repository enforces dependency compatibility before build, release, and
server deployment.

Allowed:

- `plugins/global/*` may depend on other `plugins/global/*` packages.
- `plugins/games/cs2/*` may depend on `plugins/global/*`.
- `plugins/games/cs2/*` may depend on other `plugins/games/cs2/*` packages.
- Future `plugins/games/<game>/*` may depend on `plugins/global/*`.
- Future `plugins/games/<game>/*` may depend on packages from the same game.

Rejected:

- `plugins/global/*` depending on `plugins/games/*`.
- `plugins/games/deadlock/*` depending on `plugins/games/cs2/*`.
- Any server plugin list containing a plugin from a different game.
- Any plugin path whose location contradicts its `edgegamers` metadata.

These rules apply to `s2script.pluginDependencies`,
`s2script.optionalPluginDependencies`, and runtime imports checked by repository
policy.

## Server Metadata

Each server declares its identity and game in `server.json`:

```json
{
  "name": "ttt",
  "game": "cs2",
  "environments": ["development", "production"],
  "pluginChannel": {
    "development": "dev",
    "production": "main"
  }
}
```

Each server declares desired plugins by package name only:

```text
# servers/games/cs2/ttt/s2script-plugins.txt
@edgegamers/core
@edgegamers/permissions-api
@edgegamers/cs2-api
@edgegamers/rtv
@edgegamers/ttt
@edgegamers/karma
```

The resolver maps those package names to the latest artifacts from the
environment channel. Operators do not edit versions in this file.

## Artifact Channels

`edgegamers-s2s` publishes private artifact manifests for two internal
channels:

- `dev`: latest successful build from the `dev` branch.
- `main`: latest successful build from the `main` branch.

Each channel manifest contains:

```json
{
  "schemaVersion": 1,
  "managedBy": "edgegamers-s2s",
  "channel": "main",
  "commit": "abcdef1234567890",
  "generatedAt": "2026-08-07T18:00:00.000Z",
  "plugins": [
    {
      "name": "@edgegamers/ttt",
      "scope": "game",
      "game": "cs2",
      "artifact": "plugins/games/cs2/ttt/dist/ttt.s2sp",
      "fileName": "ttt.s2sp",
      "sha256": "..."
    }
  ]
}
```

Manifests are immutable for a given commit and replaceable for a channel alias.
Deployment records must store the resolved commit and checksum list.

## Development Flow

On push to `dev`:

1. Validate metadata, dependency rules, server plugin lists, and Changeset
   policy.
2. Build all workspace plugins.
3. Publish/update the private `dev` channel manifest and artifacts.
4. Reconcile affected development servers by copying selected `.s2sp` files into
   their server-specific `addons/s2script/plugins` volume.
5. Write a deployment record beside the live plugin directory.

Source2Script hot reloads changed plugins when files are overwritten.

## Production Flow

Production deployment is triggered by protected per-server GitLab tags. Example:

```text
ttt-prod-2026.08.07
empty-prod-2026.08.07
```

On a production server tag, GitLab deployment infrastructure:

1. Selects the server under `servers/games/<game>/<server>`.
2. Deploys that server's payload content into the GitLab-managed server
   infrastructure.
3. Resolve the latest `main` channel plugin manifest from `edgegamers-s2s`.
4. Filter artifacts through the server's `s2script-plugins.txt`.
5. Reject any plugin that is not global or for the server's game.
6. Copy selected `.s2sp` files into the production addon volume.
7. Write a deployment record containing the server tag, channel, resolved
   `edgegamers-s2s` commit, plugin names, and checksums.
8. Start or restart the server according to the GitLab-managed deployment
   policy.

This keeps production controlled by server tags while still consuming the latest
approved plugin artifacts from `main`.

## Public Registry Publication

The Source2Script registry is for public releases only. Production servers do
not need to consume EdgeGamers private plugins from the public registry.

Public deployment requires all of:

- package is not private;
- `edgegamers.publicRegistry` is `true`;
- package metadata path and scope are valid;
- Changeset release intent exists when required.

Private packages build and deploy to EdgeGamers servers through GitHub artifacts,
but `s2s deploy` must skip them.

## Safety Checks

Add repository policy checks for:

- plugin metadata presence and path alignment;
- dependency compatibility across global and game scopes;
- server plugin list compatibility;
- duplicate artifact file names;
- public registry allowlist compliance;
- artifact manifest integrity;
- deployment record creation.

CI should fail before publishing artifacts or touching server addon volumes if
any safety check fails.

## Migration Plan

1. Add metadata policy checks while preserving the existing `plugins/*` layout.
2. Move reference plugins into `plugins/global` or `plugins/games/cs2`.
3. Move server payload content and plugin lists into `servers/games/cs2`.
4. Update workspace discovery to include the nested plugin directories.
5. Replace development artifact collection with channel manifests containing
   metadata.
6. Add server plugin list resolution and compatibility checks.
7. Update development deployment to reconcile selected plugins per server.
8. Add production tag deployment that resolves the `main` channel manifest.
9. Tighten public registry deploys to require `edgegamers.publicRegistry: true`.

## Initial Decisions

- Protected production server tags use
  `<server>-prod-YYYY.MM.DD[.N]`, for example `ttt-prod-2026.08.07` and
  `ttt-prod-2026.08.07.2`.
- Development deploys automatically update affected development servers after a
  successful `dev` channel build.
- Deployment records are written beside each server's live plugin directory and
  uploaded as CI artifacts for audit history.
