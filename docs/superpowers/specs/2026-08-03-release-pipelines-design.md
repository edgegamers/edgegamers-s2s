# EdgeGamers Source2Script release pipelines design

**Status:** Approved for implementation planning

**Date:** 2026-08-03

**Milestone:** Source2Script plugin and server image release pipelines

## Goal

Finish the release pipeline design for EdgeGamers Source2Script plugins and
the new server images that consume them.

Production plugins publish to the Source2Script registry from
`edgegamers-s2s` `main`. Development plugins never publish to the registry;
CI builds `.s2sp` files from `dev` and pushes them directly to the development
server's Source2Script plugin directory with a managed-file reconciliation
step. Server images split platform runtime from game-specific behavior:
`base-s2s` stays Source 2 and Source2Script focused, while `ttt-s2s` owns CS2,
TTT, config overlays, compose files, and server startup.

## Repositories

The active editable repositories are:

- `edgegamers-s2s`: GitHub plugin monorepo, branch model `dev` to `main`.
- `base-s2s`: GitLab image repository for the game-agnostic Source2Script base.
- `ttt-s2s`: GitLab image repository for the CS2 TTT server image.

The reference-only repositories are:

- `base`: old base image, useful for dependency and CI patterns only.
- `ttt`: old TTT image, useful for compose files, startup behavior, config
  overlays, and helper-script patterns only.

No implementation task may edit `base` or `ttt`.

## Source2Script facts

The pipeline follows the current Source2Script docs:

- Runtime install overlays files under `game/csgo/` and requires Metamod in
  `gameinfo.gi` as the first search path.
- Source2Script config and data directories must be writable.
- Built plugins are `.s2sp` artifacts.
- The runtime watches `addons/s2script/plugins/`; copying a `.s2sp` into that
  directory loads it, replacing it hot-reloads it, and deleting it unloads it.
- Production registry publication uses `s2s deploy --ci` with
  `S2SCRIPT_TOKEN`.
- Server operators install registry plugins with `s2s install @scope/plugin`.

## Branch and release model

### Plugin development

Ordinary plugin work lands in `edgegamers-s2s` `dev` through pull requests.
Validation runs lint, typecheck, tests, Source2Script build, license checks,
and Changeset coverage for publishable plugin edits.

On push to `dev`, CI builds the workspace, generates
`artifacts/development-manifest.json`, collects `.s2sp` files, uploads the
bundle as a GitHub Actions artifact, and deploys the same bundle to the
development server over SSH.

Development deployment never runs `s2s deploy` and never writes registry
versions.

### Plugin production

Production promotion uses pull requests from `dev` to `main`. Publishable
plugin edits require pending Changesets before the PR can merge.

On push to `main`, CI validates the workspace and runs
`npm run deploy -- --ci` when pending Changesets exist. The Source2Script CLI
builds packages, skips private plugins, skips already-published versions, and
publishes eligible packages in dependency order.

Production server image builds consume registry versions with `s2s install`.
They do not copy raw `.s2sp` artifacts from the plugin repository.

### Hotfixes

Production hotfix PRs may target `main` from `hotfix/*` only when maintainers
explicitly allow them. After a hotfix merges, automation opens a `main` to
`dev` synchronization pull request so the integration branch catches up before
the next promotion.

## Development server deployment

The development deployment target is a user account on the server box. CI uses
SSH credentials stored as GitHub environment secrets.

Required GitHub development secrets:

- `DEV_SSH_HOST`
- `DEV_SSH_USER`
- `DEV_SSH_KEY`

Required GitHub production secrets:

- `S2SCRIPT_TOKEN`

Each development server records its live Source2Script plugin directory in
`servers/games/<game>/<server>/server.json` as
`development.pluginDirectory`. For CS2 Docker volumes this is normally the
host path ending in `_data/s2script/plugins`.

The deploy script must:

1. Build a local staging directory containing `.s2sp` files and
   `development-manifest.json`.
2. Upload staging files to a timestamped remote staging directory.
3. Verify SHA-256 digests on the remote host against the manifest.
4. Read the previous EdgeGamers-managed manifest from the live plugin
   directory when it exists.
5. Delete only stale `.s2sp` files listed in the previous managed manifest and
   absent from the new manifest.
6. Copy current `.s2sp` files into the live plugin directory.
7. Write the new managed manifest beside the live plugin files.
8. Leave unmanaged manual or third-party plugin files untouched.

The manifest is the ownership boundary. A file not named by a prior
EdgeGamers-managed manifest is not deleted by automation.

The deployment should be fast enough for normal development. Source2Script hot
reload handles plugin load, reload, and unload effects after file changes.

## Daily rebuild and restart

The running server restarts daily at 10:00 UTC and performs a full rebuild and
update. The image repositories provide deterministic images and compose files;
the server box owns the scheduled restart until EdgeGamers adds a Discord bot
or other control plane.

The future bot should call a narrow server-side script or API that already
implements the same operations as the scheduled restart. CI should not grow a
Discord-specific release path.

## `base-s2s` image

`base-s2s` is game-agnostic for Source 2 and Source2Script. It must not bake in
CS2-only behavior, TTT assets, CounterStrikeSharp plugins, MAUL, map lists, or
server-specific configuration.

The image owns:

- minimal Linux runtime packages;
- Metamod install logic where Source2Script needs it;
- Source2Script runtime and CLI availability;
- writable `addons/s2script/configs`, `addons/s2script/data`, and
  `addons/s2script/plugins` paths;
- helper scripts that patch a game's `gameinfo.gi` when a downstream image
  provides the game directory; and
- GitLab CI that builds and pushes `registry.edgegamers.io/source2/base-s2s`
  tags for `dev` and `main`.

The base image may expose helper scripts under `/usr/local/bin`, but downstream
game images decide when to call them and which game directory to target.

## `ttt-s2s` image

`ttt-s2s` owns all CS2 and TTT-specific behavior. It may use
`joeedwards/cs2`, the existing EdgeGamers SteamCMD image, or another
CS2-compatible base if implementation proves it matches the shared-install
requirement better.

The image owns:

- CS2 app install and update behavior;
- startup command for `cs2`;
- CS2-specific environment variables;
- TTT-specific `cfg/` and selected `addons/` overlays;
- compose files for development and production;
- registry plugin installation with `s2s install @edgegamers/...`;
- a live plugin directory compatible with development SSH reconcile; and
- preserving the old behavior where repo files can copy over generated or
  installed files at container start.

The entrypoint must keep the old override pattern:

1. SteamCMD updates or confirms the CS2 install.
2. Base helpers patch `gameinfo.gi` for Metamod.
3. Repo-owned `cfg/` files copy over the live `game/csgo/cfg/` tree.
4. Repo-owned selected `addons/` files copy over the live `game/csgo/addons/`
   tree.
5. Environment placeholders render after overlays so server secrets and host
   values win.
6. The process starts CS2.

Production images install released plugins from the registry at build time or
container start, depending on which option gives reliable caching and
credential handling. Development images can start from the registry baseline;
direct SSH deployment supplies fresh dev `.s2sp` files after push.

## Compose and environment files

The server box may continue owning compose and `.env` files. Repository compose
files serve as the canonical templates. Operators may copy them to the box and
adjust host IPs, secrets, volumes, and network names.

Development compose keeps fast iteration:

- watchtower or manual restart can refresh images;
- development `.s2sp` files arrive through SSH reconcile;
- persistent CS2 data stays in a shared volume;
- the plugin directory path remains stable for Source2Script hot reload.

Production compose keeps the old manual reliability model:

- image tag points at `main`;
- secrets live in the box's `.env`;
- data, dumps, and persistent game state use volumes;
- no production plugin artifact copy from GitHub Actions occurs.

## Security boundaries

Production registry deploy uses `S2SCRIPT_TOKEN` only in the GitHub production
environment.

Development SSH credentials live only in the GitHub development environment.
The SSH user should have the smallest practical access: write to a staging
directory and the Source2Script plugin directories listed by server metadata,
and no broad sudo rights.

The deploy script must quote paths, reject empty destination variables, reject
root-like destinations, and fail when digest verification fails. It must not
delete files outside the resolved target server plugin directory.

GitLab image builds must avoid baking deploy tokens, SSH keys, database
credentials, or Steam tokens into images.

## Verification

Implementation is complete when fresh checks show:

- `edgegamers-s2s` pull request validation runs lint, typecheck, tests, build,
  license checks, and Changeset coverage.
- A publishable plugin edit without a Changeset fails the PR gate.
- A `dev` push builds `.s2sp` files, writes a manifest, uploads an artifact,
  and runs the SSH reconcile script.
- The reconcile script deletes only files from the previous managed manifest
  and leaves unmanaged files untouched in tests.
- A `main` push validates and runs `s2s deploy --ci` only for releaseable
  changes.
- `base-s2s` builds a game-agnostic Source2Script base image in GitLab CI.
- `ttt-s2s` builds a CS2 TTT image in GitLab CI.
- `ttt-s2s` keeps the old config and addon override behavior.
- Compose templates document required environment variables and volumes.
- No editable task modifies `base` or `ttt`.

## Deferred work

- Discord bot controls for leadership members.
- Fine-grained server API for restart, rebuild, rollback, and status.
- Production canary policy.
- Automated rollback of development plugin deployments.
- Multi-game consumers of `base-s2s` beyond TTT.

## References

- [Source2Script getting started](https://www.s2script.com/docs/getting-started)
- [Source2Script authoring plugins](https://www.s2script.com/docs/authoring)
- [Source2Script publishing to the registry](https://www.s2script.com/docs/publishing)
- `C:\Users\reece\VSCodeProjects\edgegamers-s2s`
- `C:\Users\reece\VSCodeProjects\base-s2s`
- `C:\Users\reece\VSCodeProjects\ttt-s2s`
- `C:\Users\reece\VSCodeProjects\base`
- `C:\Users\reece\VSCodeProjects\ttt`
