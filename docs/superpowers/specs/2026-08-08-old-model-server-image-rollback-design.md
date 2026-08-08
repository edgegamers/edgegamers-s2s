# Old-model server image rollback design

**Status:** Ready for review

**Date:** 2026-08-08

**Branch:** `dev`

## Goal

Return the Source2Script server deployment model to the old `base` and `ttt`
shape: build Docker images that are directly runnable as servers, then let the
server repository pipeline deploy those images.

The new experiment that split server state across payload images,
`ghcr.io/s2script/s2script-runtime-image`, mounted payload directories, and
runtime reconciliation should be removed from the server path. The server image
is the deployment unit again.

## Decisions

- `edgegamers-s2s` still builds server-scoped Source2Script plugin packages and
  triggers affected development server pipelines with GitLab trigger tokens.
- Triggered development server pipelines rebuild the affected server image with
  the new package, SSH the compose file to the development host, pull the new
  image, and restart the development container.
- Production server pipelines build/tag the production image and update the
  host compose file, but they do not force a production restart.
- Production hosts restart on their own at 10:00 and pull/use the selected
  production image during that scheduled restart.
- `empty-s2s` main is the CS2 base image consumed by other CS2 server repos.
- `empty-s2s` does not need a separate latest-tag release mechanism right now.
  Child CS2 server repos use the `empty-s2s:main` image by default.
- Keep the existing `cs2-data` shared CS2 install model for this pass. The CS2
  install/update system will be redesigned separately.
- Do not use `ghcr.io/s2script/s2script-runtime-image` in `empty-s2s`,
  `ttt-s2s`, or future EdgeGamers CS2 server compose files.

## Non-Goals

- Redesign the shared CS2 installation system.
- Replace the existing `cs2-data` volume/data-container workflow yet.
- Add Watchtower back.
- Build a Pterodactyl-like control plane.
- Keep payload extraction as the normal deployment path.
- Keep server addon state mounted as separately managed payload directories when
  those files can live in the server image.
- Make production deploys restart live servers immediately.

## Repository Ownership

### `edgegamers-s2s`

Owns:

- plugin source;
- npm and Source2Script workspace validation;
- `.s2sp` package builds;
- server-scoped plugin bundle/package creation;
- affected-server detection;
- GitLab trigger-token calls for affected development server pipelines;
- optional production plugin publication when a plugin should be published to
  the Source2Script registry.

Does not own:

- SSH access to game servers;
- Docker Compose commands on game servers;
- server image builds;
- server restarts;
- production image rollout timing;
- live server plugin-directory reconciliation.

### `base-s2s`

Owns the game-agnostic Source 2 / Source2Script base layer.

It should include shared runtime tools and helper scripts that are not tied to
CS2 server layout. It must not contain CS2-specific compose files, CS2 server
environment variables, CS2 addon overlays, or CS2 game installation policy.

This layer exists so future Source 2 games can share the same base without
inheriting CS2-specific paths and assumptions.

### `empty-s2s`

Owns the CS2 baseline server image.

It inherits from `base-s2s` and becomes the CS2 equivalent of the old `base`
repository. It owns common CS2/S2Script files, Metamod patching support, common
CS2 addon/config overlays, and a runnable CS2 server entrypoint that expects the
existing shared `cs2-data` install to be present.

`empty-s2s:main` is the default base image for child CS2 servers. `empty-s2s`
development deploys may use the development image directly, but other CS2
server repos should not need to consume `empty-s2s:dev` unless explicitly
testing base changes.

### Child CS2 Server Repositories

Example: `ttt-s2s`.

Own:

- server-specific Dockerfile;
- server-specific plugin/addon/config overlays;
- dev and prod compose files;
- GitLab image build;
- GitLab SSH deployment;
- development restart behavior;
- production compose/image selection without forced restart.

Each child server image should inherit from `empty-s2s:main` by default and
copy its server-specific files into the image. The running compose service
points at the child server image, not at a generic runtime image.

## Development Flow

1. A change lands in `edgegamers-s2s`.
2. GitHub Actions validates the plugin workspace and builds the affected
   `.s2sp` package output.
3. `edgegamers-s2s` determines which development server repos need the new
   package.
4. For each affected development server, `edgegamers-s2s` calls that server
   repo's GitLab trigger token.
5. The server repo pipeline downloads the relevant package/bundle metadata,
   builds a new server image, and pushes `:<branch-slug>` or `:dev`.
6. The server repo SSH job copies the dev compose file to the development host.
7. The server repo SSH job pulls the rebuilt image and restarts the development
   container.

Only affected development servers are triggered. `edgegamers-s2s` does not SSH
into game hosts.

## Production Flow

1. A production server repo build creates a production image from the approved
   source state.
2. The server repo copies or updates the production compose file on the host.
3. The pipeline does not force a live production restart.
4. The production host's scheduled 10:00 restart handles pulling/using the
   selected production image and restarting the container.

Production remains image-based. Runtime plugin resolution is not required for
this pass.

## Compose Model

Server compose files should point directly at EdgeGamers server images.

Development example:

```yaml
services:
  cs2-ttt-s2s-dev:
    image: registry.edgegamers.io/source2/cs2/servers/ttt-s2s:dev
    container_name: cs2-ttt-s2s-dev
    restart: unless-stopped
    network_mode: host
    volumes:
      - cs2-data:/cache
```

Production example:

```yaml
services:
  cs2-ttt-s2s:
    image: registry.edgegamers.io/source2/cs2/servers/ttt-s2s:main
    container_name: cs2-ttt-s2s
    restart: always
    network_mode: host
    volumes:
      - cs2-data:/cache
```

Exact ports, host IPs, secrets, and server environment variables remain
server-specific. Compose should not mount a read-only `./payload` directory or
reference `ghcr.io/s2script/s2script-runtime-image`.

## CS2 Install Handling For This Pass

Keep the old shared `cs2-data` install.

The server image entrypoint may continue to use the existing pattern where the
shared `/cache` install is copied or overlaid into `/app`, SteamCMD updates the
server tree, and `gameinfo.gi` is patched so Metamod loads.

The old setup to preserve conceptually is:

```bash
docker create --user 1000:1000 --name cs2-data --cpuset-cpus 0 -v cs2-data:/cache registry.edgegamers.io/source/steamcmd:alpaquita
docker run --rm -it --user 1000:1000 --cpuset-cpus 0 --dns 1.1.1.1 --volumes-from=cs2-data registry.edgegamers.io/source/steamcmd:alpaquita bash -c \
    "(rm /cache/steamapps/appmanifest_730.acf || true) && steamcmd \
    +@sSteamCmdForcePlatformType linux \
    +force_install_dir /cache \
    +login anonymous \
    +app_update 730 \
    +quit"
docker run --rm -it --user 1000:1000 --volumes-from cs2-data registry.edgegamers.io/source/steamcmd:alpaquita bash -c \
    "sed -i 's$\t\t\tGame_LowViolence\tcsgo_lv // Perfect World content override$\t\t\tGame\tcsgo/addons/metamod$' /cache/game/csgo/gameinfo.gi"
```

This is intentionally not cleaned up in this implementation. A follow-up CS2
install spec can replace it with a named-volume updater command or another
cleaner CS2 update mechanism once the image model is stable again.

## Server Image Model

`empty-s2s` should produce a runnable CS2 base image, not a payload image.

Child server Dockerfiles should look like the old `ttt` pattern:

```dockerfile
FROM registry.edgegamers.io/source2/cs2/servers/empty-s2s:main AS base

# Build or download server-specific plugins and assets.
# Copy them into the CS2 addon/config tree.

FROM registry.edgegamers.io/source2/cs2/servers/empty-s2s:main
COPY --from=base /tmp/app/. /app/
COPY csgo /app/game/csgo
```

The implementation may refine exact stages, but the rule is fixed: the final
image is runnable and includes the server overlay.

## Deployment Contract

Development deploys:

- copy `compose-dev.yml` to the host;
- pull the new server image;
- run `docker compose up -d --remove-orphans` or equivalent;
- restart the development server immediately.

Production deploys:

- copy `compose-prod.yml` to the host;
- optionally pull the image or leave pull to the 10:00 host job;
- do not force `docker compose up` against the live production service unless
  the operator explicitly chooses a manual restart.

The host-side 10:00 restart job is outside this repo pass, but the compose and
image model must be compatible with it.

## Cleanup Scope

Remove from active server deployment paths:

- `ghcr.io/s2script/s2script-runtime-image`;
- payload-only final Docker images;
- `/payload` extraction in SSH deploy jobs;
- `./payload:/srv/source2/server:ro` compose mounts;
- `SOURCE2_UPDATE_ON_START`;
- `SOURCE2_RUN_WATCHER`;
- Source2Script runtime watcher labels and state volumes;
- server addon volumes that only exist to receive extracted payload contents;
- tests/docs that assert the payload-runtime model.

Keep where still useful:

- server-scoped plugin bundle/package metadata in `edgegamers-s2s`;
- GitLab trigger-token integration from `edgegamers-s2s`;
- SSH deploy from server repos;
- dev restart after image rebuild;
- prod non-forced restart policy.

## Testing

Each repository should keep a small validation script instead of a large
framework.

`edgegamers-s2s` tests should cover:

- affected-server trigger request construction;
- server package/bundle generation;
- no SSH deployment from this repo.

`base-s2s` tests should cover:

- game-agnostic helper scripts exist and parse;
- no CS2 compose/deploy policy is present.

`empty-s2s` tests should cover:

- Dockerfile inherits from `base-s2s`;
- Dockerfile produces a runnable server image, not `/payload` only;
- compose does not use `ghcr.io/s2script/s2script-runtime-image`;
- compose still mounts the old shared `cs2-data` install.

`ttt-s2s` tests should cover:

- Dockerfile inherits from `empty-s2s:main`;
- server-specific overlays are copied into the image;
- compose points at `registry.edgegamers.io/source2/cs2/servers/ttt-s2s`;
- dev deploy restarts;
- prod deploy does not force restart.

## Migration Order

1. Strip `base-s2s` down to the game-agnostic base.
2. Convert `empty-s2s` into the runnable CS2 base image.
3. Convert `ttt-s2s` into a runnable child CS2 server image.
4. Keep `edgegamers-s2s` trigger-token behavior, but remove assumptions that
   server repos are payload-runtime consumers.
5. Update docs and validation to describe the old-model image deployment flow.

This order keeps downstream server repos from depending on a partially migrated
base image.
