# Plugin bundle server pipeline overhaul design

**Status:** Ready for review

**Date:** 2026-08-08

**Branch:** `dev`

## Goal

Return the release flow to a simple repository boundary:

- `edgegamers-s2s` builds Source2Script plugin bundles.
- Server repositories build images and deploy servers.
- Development deploys may restart automatically through the server repository's
  SSH deploy job.
- Production images are built and tagged, but production servers only move when
  the production server deployment flow selects that image.

This replaces the current mixed model where `edgegamers-s2s` builds plugin
artifacts and also SSH-reconciles files directly into live server plugin
directories.

## Non-Goals

- Keep Watchtower.
- Keep direct plugin-directory SSH deployment from `edgegamers-s2s`.
- Keep development manifest reconciliation in `edgegamers-s2s`.
- Move compose files, host paths, Docker deploy behavior, or server overlay
  ownership into `edgegamers-s2s`.
- Build a large server release resolver framework in the minimal server repos.
- Require production servers to resolve live "latest" plugin state at runtime.

## Repository Ownership

### `edgegamers-s2s`

Owns:

- plugin source;
- npm and Source2Script workspace validation;
- `.s2sp` package builds;
- server-scoped plugin bundle creation;
- optional public Source2Script registry publication for plugins that need it;
- triggering downstream GitLab server pipelines.

Does not own:

- SSH access to game servers;
- Docker Compose commands;
- server payload extraction;
- development or production restarts;
- runtime server image selection.

### Server repositories

Examples: `empty-s2s`, `ttt-s2s`.

Own:

- server overlays;
- compose templates;
- Docker image build and tagging;
- SSH deployment to the correct host path;
- dev restart behavior;
- production image selection and deployment policy.

Server repos should stay small. They should not grow their own Node release
resolver, plugin registry resolver, or cross-repo manifest service unless the
runtime proves it is needed later.

## Bundle Contract

`edgegamers-s2s` produces one immutable bundle per server and environment.

Example output:

```text
artifacts/server-bundles/
  ttt-s2s/
    development/
      ttt-s2s-development.zip
      ttt-s2s-development.sha256
    production/
      ttt-s2s-production.zip
      ttt-s2s-production.sha256
```

Each zip contains:

```text
plugins/
  reference-api.s2sp
  reference-consumer.s2sp
plugin-bundle.json
```

`plugin-bundle.json` is audit metadata, not a runtime resolver:

```json
{
  "schemaVersion": 1,
  "managedBy": "edgegamers-s2s",
  "server": "ttt-s2s",
  "environment": "development",
  "commit": "abcdef1234567890",
  "generatedAt": "2026-08-08T12:00:00.000Z",
  "plugins": [
    {
      "packageName": "@edgegamers/reference-api",
      "fileName": "reference-api.s2sp",
      "sha256": "..."
    }
  ]
}
```

The installed file name is stable and unversioned. Versioning belongs to the
bundle metadata and CI records, not to the live plugin filename.

## Server Plugin Selection

The server plugin list should be explicit and low ceremony.

Preferred source of truth:

```text
edgegamers-s2s/server-bundles/<server>.txt
```

Example:

```text
# One plugin package per line.
@edgegamers/reference-api
@edgegamers/reference-consumer
```

The bundle builder maps package names to built workspace artifacts. It fails if
a listed plugin has no built `.s2sp` file, if two selected plugins produce the
same file name, or if the list contains a package outside the workspace.

This replaces older attempts to move full server payloads and compose ownership
into `edgegamers-s2s`.

## Development Flow

On push to `edgegamers-s2s/dev`:

1. Install dependencies.
2. Run lint, typecheck, tests, and `s2s build`.
3. Build server development bundles.
4. Upload the bundles as GitHub Actions artifacts.
5. Trigger each configured GitLab server pipeline with a trigger token.

The GitLab trigger variables include:

```text
PLUGIN_BUNDLE_SERVER=ttt-s2s
PLUGIN_BUNDLE_ENV=development
PLUGIN_BUNDLE_COMMIT=<edgegamers-s2s commit sha>
PLUGIN_BUNDLE_URL=<download URL or API locator>
PLUGIN_BUNDLE_SHA256=<zip sha256>
PLUGIN_BUNDLE_ARTIFACT_NAME=ttt-s2s-development
```

The server repo pipeline then:

1. Validates its own small repo.
2. Downloads the plugin bundle.
3. Verifies the bundle SHA-256.
4. Extracts bundle `plugins/*.s2sp` into the payload image or payload staging
   directory.
5. Builds and pushes the server image tag for `dev`.
6. SSHs to the development host.
7. Pulls or extracts the new payload.
8. Runs the compose update command for the dev server.

Development restarts are owned by the server repository. A dev deploy may force
recreate or restart because these servers are not production.

## Production Flow

On `edgegamers-s2s/main`:

1. Validate and build plugins.
2. Build production plugin bundles.
3. Publish immutable production bundle artifacts.
4. Optionally publish selected plugins to the public Source2Script registry.

Production server repositories consume production bundles from an explicit
server release path, not from a runtime "latest" resolver.

Recommended production server flow:

1. Merge desired server repo changes to `main`.
2. Trigger or tag the server repo production pipeline.
3. The server repo downloads the chosen production plugin bundle.
4. The server repo builds and pushes a production image tag.
5. The server repo may update production compose/image selection over SSH.
6. The server does not force restart unless the production deployment command
   explicitly says to.

This keeps production runtime behavior predictable: the image contains the
plugins selected by the pipeline, and the host moves only when the server repo
deploys it.

## GitLab Trigger Setup

`edgegamers-s2s` stores no GitLab host SSH keys.

Required GitHub secrets or variables:

```text
GITLAB_URL
GITLAB_TRIGGER_TOKEN_TTT_S2S
GITLAB_PROJECT_ID_TTT_S2S
```

The trigger call uses GitLab's pipeline trigger endpoint:

```text
POST /api/v4/projects/:id/trigger/pipeline
```

The trigger target ref is:

- `dev` for development bundles;
- `main` or a protected production tag/ref for production bundle consumption.

Server repos keep their existing deploy SSH secrets in GitLab.

## What Gets Removed

From `edgegamers-s2s`:

- `scripts/deploy-development-artifacts.mjs`;
- remote development reconciliation helpers that only exist for SSH deploy;
- `deploy:dev` npm script;
- GitHub `DEV_SSH_*` secrets and docs;
- workflow steps that write SSH keys or copy files to a live plugin directory;
- tests that assert SSH deploy and remote manifest reconciliation;
- docs that say development deployment is owned by `edgegamers-s2s`.

From server repos:

- stale `s2script-plugins.txt` registry-package runtime install path for
  EdgeGamers-owned plugins, once plugin bundles replace it;
- server release manifest resolver plans from the abandoned tag-manifest
  design;
- unnecessary package manager/test-runner scaffolding unless a server repo
  already needs it for real code.

Kept in server repos:

- Dockerfile;
- compose files;
- minimal shell validation;
- SSH deploy job;
- server overlays.

## Runtime Layout

The server payload should contain EdgeGamers plugin files under a predictable
payload path, for example:

```text
/payload/s2script/plugins/*.s2sp
```

The compose-mounted payload is then applied by the runtime image into:

```text
addons/s2script/plugins/*.s2sp
```

If the current runtime image only supports `s2script-plugins.txt` registry
installation, add the smallest possible payload copy behavior:

```text
copy /srv/source2/server/s2script/plugins/*.s2sp
to   <game-dir>/addons/s2script/plugins/*.s2sp
```

No registry resolution is needed for EdgeGamers bundled plugins.

## Error Handling

`edgegamers-s2s` fails before triggering GitLab when:

- validation fails;
- build fails;
- a server bundle list references a missing package;
- a package has no built `.s2sp`;
- duplicate live plugin filenames would be produced;
- bundle zip SHA-256 cannot be written.

Server repos fail before deployment when:

- the bundle cannot be downloaded;
- the bundle SHA-256 does not match;
- the zip does not contain `plugin-bundle.json`;
- the bundle server or environment does not match the pipeline variables;
- Docker build or push fails.

Development SSH deploy failures fail the server repo pipeline. They do not
require cleanup logic in `edgegamers-s2s`.

## Testing And Verification

`edgegamers-s2s` verification:

- unit tests for bundle list parsing;
- unit tests for package-to-artifact resolution;
- unit tests for duplicate filename rejection;
- unit tests for GitLab trigger command construction;
- workflow tests proving dev builds bundles and triggers GitLab instead of SSH;
- `npm run lint`;
- `npm run typecheck`;
- `npm test`;
- `npm run build`;
- local bundle build command.

Server repo verification:

- shell validation confirms bundle download/extract commands exist;
- CI verifies SHA-256 before Docker build;
- Docker build includes copied `.s2sp` files in the payload;
- dev deploy runs the SSH compose update path.

Runtime image verification, only if payload plugin copy support is missing:

- shell test proves payload `.s2sp` files copy into
  `addons/s2script/plugins`;
- existing registry package list behavior remains for non-EdgeGamers public
  packages if still needed.

## Migration Order

1. Add this design spec.
2. Add `edgegamers-s2s` server bundle list files.
3. Add bundle creation scripts and tests.
4. Replace `deploy-dev.yml` SSH deployment with bundle upload and GitLab
   triggers.
5. Remove `edgegamers-s2s` dev SSH scripts, tests, secrets, and docs.
6. Update server repos to accept `PLUGIN_BUNDLE_*` variables.
7. Update server Dockerfiles to copy plugin bundle files into payload.
8. Keep dev SSH deploy in server repos and make it restart/recreate dev.
9. Adjust production server pipeline to consume explicit production bundles
   without forced restarts.
10. Remove stale server manifest/tag resolver docs from the abandoned design.

## Open Decisions

- Exact GitLab project IDs and trigger secret names per server.
- Whether production bundle selection is by `edgegamers-s2s/main` artifact,
  GitHub release asset, or a manually supplied bundle URL.
- Whether `empty-s2s` should receive its own plugin bundle or only child server
  repos should receive bundles.

The recommended first implementation should support `ttt-s2s` end to end, then
generalize only the small pieces that are proven necessary for the next server.
