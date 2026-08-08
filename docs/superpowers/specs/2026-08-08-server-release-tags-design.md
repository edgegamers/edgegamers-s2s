# Server release tags and plugin artifacts design

**Status:** Ready for written review

**Date:** 2026-08-08

**Milestone:** Tag-controlled server releases and Source2Script plugin delivery

## Goal

Define the release model for EdgeGamers Source2Script plugins and CS2 server
payload repositories.

Development servers should update quickly from `dev` artifacts and hot reload
plugin changes when Source2Script supports reload by file replacement.
Production servers should change only when a server repository receives a
release tag such as `26.08.08`. A production tag represents the full server
snapshot for that server until the next server tag.

This design replaces the older production boundary where `edgegamers-s2s`
production stopped at the Source2Script registry. EdgeGamers servers will
download all EdgeGamers Source2Script plugins from GitHub release assets.
Selected plugins may also publish to the Source2Script registry for external
consumers.

## Repositories

- `edgegamers-s2s`: Source2Script plugin monorepo. Owns plugin source,
  Changeset versioning, GitHub plugin releases, optional registry publication,
  and direct development artifact deployment.
- `empty-s2s`: common CS2 server payload. Owns common `csgo/` overlays, common
  `s2script-plugins.txt` intent, and common server release tags.
- `ttt-s2s`: child CS2 server payload. Owns TTT-specific overlays, plugin
  intent, compose templates, and TTT release tags.
- Future child server repositories follow the `ttt-s2s` pattern.

`empty-s2s` is the common base for child server repositories. Child servers
consume tags cut from `empty-s2s/main`. Child production servers adopt a new
common release only when the child server repository receives its own
production tag.

## Release Units

### Plugin releases

Every plugin behavior or public contract change that reaches
`edgegamers-s2s/main` requires a Changeset. Private plugins are not exempt from
the Changeset requirement when they affect server behavior.

On `main`, automation versions changed plugins, validates the workspace, builds
`.s2sp` artifacts, and creates GitHub releases for every released plugin.

Each plugin release uses a versioned GitHub tag and a stable artifact name:

```text
GitHub release tag: plugin/<plugin-name>/v<version>
GitHub asset name: <plugin-name>.s2sp
Live install name: <plugin-name>.s2sp
```

The version belongs to release metadata and generated manifests. The installed
file name stays stable so Source2Script reloads the same live path instead of
loading versioned duplicates.

Plugins with explicit metadata, such as
`edgegamers.release.publishToRegistry: true`, also publish to the
Source2Script registry. Registry publication is not the canonical server
install path.

### Common server releases

`empty-s2s/main` is the staging branch for common CS2 server payload changes.
An `empty-s2s` tag such as `26.08.08` creates a common release snapshot.

Child development servers auto-adopt the newest `empty-s2s` common release.
Child production servers adopt a common release only when their own server repo
is tagged.

### Child server releases

A child server tag such as `ttt-s2s` `26.08.08` represents the full production
snapshot for that server. The tag pipeline resolves all moving inputs at tag
time and writes a frozen release manifest.

Production startup uses the frozen manifest from the latest server tag already
deployed to the box. Production startup must not resolve live "latest" inputs
from branches.

## Branch Flow

### Development

`edgegamers-s2s/dev` builds all workspace `.s2sp` artifacts on push. The
workflow writes a development manifest containing commit, file names, and
SHA-256 digests. It then SSH-reconciles the artifacts into configured
development server plugin directories.

Development artifacts do not create GitHub plugin releases and do not publish
to the Source2Script registry.

Child development servers use:

- latest child server payload from that child repo's `dev` branch;
- latest server-specific Source2Script plugin artifacts from
  `edgegamers-s2s/dev`;
- latest tagged common release from `empty-s2s/main`.

`empty-s2s/dev` tests common changes on the empty development server before
they are promoted to `empty-s2s/main` and tagged.

### Production staging

`main` is the staging branch for production-ready changes. It is not the live
production selector by itself.

`edgegamers-s2s/main` creates plugin releases from Changesets. `empty-s2s/main`
stages common server payload changes. Child server `main` branches stage
server-specific production payload and plugin intent changes.

### Production release

Production changes only through server tags. A child server production tag
resolves latest approved plugin releases and the latest tagged common
`empty-s2s` release at tag time. The generated manifest freezes those choices
for the server release.

Hotpatch tags use the existing old-repo convention when a date tag already
exists:

```text
26.08.08-HOTPATCH-1
```

## Plugin Intent And Resolved Manifests

Server repositories commit human-authored plugin intent without hard-coded
plugin versions.

Example `server-plugins.json`:

```json
{
  "plugins": [
    { "name": "@edgegamers/common-admin", "enabled": true },
    { "name": "@edgegamers/ttt", "enabled": true },
    { "name": "@edgegamers/experimental-shop", "enabled": false }
  ]
}
```

The tag resolver reads plugin intent from `empty-s2s` and the child server
repo. It merges entries by plugin name. Child server entries override inherited
common entries so a child server can disable, enable, or replace common plugin
intent without editing `empty-s2s`.

The resolver writes `server-release-manifest.json` for each tag.

Example:

```json
{
  "schemaVersion": 1,
  "server": "ttt-s2s",
  "releaseTag": "26.08.08",
  "serverCommit": "server-commit-sha",
  "emptyS2s": {
    "releaseTag": "26.08.07",
    "manifestSha256": "empty-manifest-sha256"
  },
  "runtimeImage": {
    "image": "ghcr.io/s2script/s2script-runtime-image",
    "digest": "sha256:runtime-image-digest"
  },
  "plugins": [
    {
      "name": "@edgegamers/ttt",
      "version": "1.2.3",
      "releaseTag": "plugin/ttt/v1.2.3",
      "assetName": "ttt.s2sp",
      "installFileName": "ttt.s2sp",
      "enabled": true,
      "sha256": "plugin-artifact-sha256",
      "downloadUrl": "https://github.com/edgegamers/edgegamers-s2s/releases/download/plugin/ttt/v1.2.3/ttt.s2sp"
    }
  ]
}
```

The server release manifest must be immutable for the tag. Automation must
upload it as a release artifact and may also place it in the payload extracted
to the server box.

## Enabled And Disabled Plugins

Plugin inclusion and plugin enabled state are separate.

An included plugin with `enabled: true` installs to:

```text
addons/s2script/plugins/<plugin-name>.s2sp
```

An included plugin with `enabled: false` installs to:

```text
addons/s2script/plugins/disabled/<plugin-name>.s2sp
```

Disabled plugins still download and update. They do not load because they live
under `plugins/disabled/`.

Changing enabled state moves the stable file name between the enabled and
disabled paths. Removing a plugin from the desired manifest deletes it from
both managed locations.

## Reconcile Ownership

Development reconcile and production startup reconcile use the same ownership
rules.

The live plugin directory contains a managed manifest such as:

```text
addons/s2script/plugins/.edgegamers-s2script-managed.json
```

Automation deletes only files listed in the previous managed manifest. It
leaves manual files and third-party files alone unless a previous EdgeGamers
managed manifest claimed them.

Reconcile steps:

1. Ensure `addons/s2script/plugins` exists.
2. Ensure `addons/s2script/plugins/disabled` exists.
3. Read the previous managed manifest if present.
4. Read the desired development or server release manifest.
5. Download or copy each desired `.s2sp`.
6. Verify SHA-256 before live replacement.
7. Write to a temporary file in the target directory.
8. Move the temp file into the enabled or disabled path.
9. Delete stale managed files from enabled and disabled paths.
10. Write the new managed manifest.

Required plugins fail startup or deployment when download or digest validation
fails. Optional plugins are deferred work. Default behavior treats plugins as
required.

## Tag Resolver Flow

An `empty-s2s` tag pipeline:

1. Validates tag format.
2. Validates the tag points at `main`.
3. Builds the common payload image.
4. Resolves common plugin intent against latest GitHub plugin releases from
   `edgegamers-s2s/main`.
5. Resolves image and payload digests.
6. Writes the frozen common release manifest.
7. Publishes the release manifest as a tag artifact.
8. Deploys the empty production server only if the tag is intended for that
   server.

A child server tag pipeline:

1. Validates tag format.
2. Validates the tag points at `main`.
3. Builds the child payload image from the tagged commit.
4. Resolves the latest tagged `empty-s2s` release.
5. Merges inherited common plugin intent with child server plugin intent.
6. Resolves each plugin to the latest GitHub release asset from
   `edgegamers-s2s/main`.
7. Records stable install file names, enabled state, versions, tags, URLs, and
   SHA-256 digests.
8. Resolves runtime and payload image digests.
9. Writes `server-release-manifest.json`.
10. Publishes the manifest as a tag artifact.
11. Deploys the tagged payload and manifest to the production box.

## Runtime And Payload Images

The running server uses `ghcr.io/s2script/s2script-runtime-image`. Server
repositories provide payload images and extracted payload directories for
server-specific files.

Tag manifests record the digest of the runtime image and payload images used
for the release. Compose files may continue to reference a tag such as
`latest`, but the release manifest records the digest resolved at tag time for
audit and rollback.

## Validation

Implementation is complete when fresh checks show:

- `edgegamers-s2s` rejects plugin changes that reach `main` without
  Changesets.
- `edgegamers-s2s/main` creates GitHub releases with stable `.s2sp` asset
  names for changed plugins.
- Registry publication runs only for plugins that opt in.
- Development reconcile supports enabled plugins, disabled plugins, digest
  checks, and stale managed removal.
- `empty-s2s` tag pipelines validate `YY.MM.DD` tags and generate immutable
  common release manifests.
- Child dev servers auto-adopt the latest tagged `empty-s2s` common release.
- Child server tag pipelines resolve the latest tagged `empty-s2s` release and
  latest GitHub plugin releases at tag time.
- Child server manifests let child plugin intent override inherited common
  plugin intent by plugin name.
- Production startup reconciles enabled and disabled plugin files from the
  frozen server release manifest.
- Production startup removes stale managed plugins and leaves unmanaged files
  untouched.

## Deferred Work

- Discord notification automation for release tags and changelog posts.
- Canary policy for high-risk server releases.
- Optional plugin semantics with `required: false`.
- Automated rollback commands beyond redeploying a previous server tag.
- Registry consumer documentation for public Source2Script plugins.
