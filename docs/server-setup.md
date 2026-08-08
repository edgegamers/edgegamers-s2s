# Server Setup

This is the checklist for adding or rebuilding an EdgeGamers Source2Script server.

## Canonical Plugin Source

Use `server-plugins.json` only. Do not maintain `s2script-plugins.txt` in EdgeGamers server repos.

Server intent stays versionless:

```json
{
  "plugins": [
    {
      "name": "@edgegamers/ttt",
      "enabled": true
    },
    {
      "name": "@edgegamers/experimental-plugin",
      "enabled": false
    }
  ]
}
```

Allowed fields are `name` and optional `enabled`. Production tags resolve the latest plugin releases available at tag time and freeze exact versions, URLs, and SHA-256 digests into `server-release-manifest.json`.

## Repository Layout

Use one GitLab repo per server under:

```text
source2/cs2/servers/<server-name>-s2s
```

Use `empty-s2s` for the shared CS2 base. Child servers, such as `ttt-s2s`, inherit from the latest tagged `empty-s2s` release.

Required server repo files:

- `server-plugins.json`: canonical plugin intent for that server.
- `Dockerfile`: payload image that copies `server-plugins.json` and `csgo/`.
- `compose-dev.yml` and `compose-prod.yml`: runtime compose files.
- `.gitlab-ci.yml`: validate, build, release manifest, and deploy jobs.
- `scripts/resolve-server-release.mjs`: resolves versionless intent into a frozen manifest.
- `scripts/validate.sh`: fast repo validation.
- `csgo/`: server overlay files.

## Host Layout

Each deployed server lives at:

```text
/opt/cs2/<server-name>-s2s/
```

Create this directory before first deploy. It must contain:

```text
/opt/cs2/<server-name>-s2s/.env
```

CI deploys and updates:

```text
/opt/cs2/<server-name>-s2s/compose.yml
/opt/cs2/<server-name>-s2s/payload/
/opt/cs2/<server-name>-s2s/server-release-manifest.json
```

The `.env` file is host-owned and must not be committed. Typical CS2 values:

```dotenv
SRCDS_TOKEN=
CS2_RCONPW=
CS2_PW=
APP_SERVER_MONTHLY_PASSWORD=true
```

## Docker Volumes

CS2 servers share the game install and update state:

```text
source2-cs2-data
source2-cs2-state
```

Each server gets its own addon volume:

```text
<server-name>-s2s-addons
```

For development plugin hot reload, point `config/development-servers.json` at the host path for that addon volume's Source2Script plugin directory:

```text
/var/lib/docker/volumes/<server-name>-s2s-addons/_data/s2script/plugins
```

If the compose file uses a bind mount instead of a named addon volume, use the bind-mounted host path plus `/s2script/plugins`.

## CI Variables

In `edgegamers-s2s` GitHub development environment:

- `DEV_GITLAB_TOKEN`: can clone development server repos from GitLab.
- `DEV_GITLAB_USER`: optional. Leave unset for a personal or project access
  token, which uses GitLab's `oauth2` username. Set it for a GitLab deploy
  token.
- `DEV_SSH_HOST`: development server host.
- `DEV_SSH_PORT`: optional; defaults to `22`.
- `DEV_SSH_USER`: SSH user for plugin reconcile.
- `DEV_SSH_KEY`: private key for plugin reconcile.

`DEV_GITLAB_TOKEN` must have `read_repository` access to every server repo that
the development workflow clones, including `empty-s2s` and each child server
repo. In GitLab, give the token at least Reporter access to those projects or
create a group/project deploy token with repository read permission.

In `edgegamers-s2s` GitHub production environment:

- `S2SCRIPT_TOKEN`: only needed for plugins that opt into Source2Script registry publishing.

In each GitLab server repo:

- `GH_TOKEN`: optional for public GitHub release assets, required for private releases or higher API limits.
- `GITLAB_API_TOKEN`: required for child servers that read `empty-s2s` tags and artifacts.
- `REGISTRY_PULL_USER` and `REGISTRY_PULL_PASSWORD`: required when a child build pulls the private `empty-s2s` base image.
- `DEPLOY_SSH_PRIVATE_KEY`
- `DEPLOY_KNOWN_HOSTS`
- `DEPLOY_DEV_HOST`
- `DEPLOY_DEV_USER`
- `DEPLOY_PROD_HOST`
- `DEPLOY_PROD_USER`

## Adding A Plugin

1. Add plugin source under `plugins/global/<plugin>` for shared services or `plugins/cs2/<plugin>` for CS2-only plugins.
2. Declare runtime plugin dependencies in the plugin package metadata.
3. Add a Changeset before merging to `main`.
4. Merge to `dev` for development servers to auto-adopt.
5. Merge to `main` after testing.
6. Let the release workflow create GitHub release assets with stable `.s2sp` names.
7. Add the package name to the target server repo's `server-plugins.json`.

Common/base plugins go in `empty-s2s/server-plugins.json`. Child-server-only plugins go in that child repo's `server-plugins.json`.

## Adding A New Development Server

1. Create the GitLab server repo from the nearest existing server repo.
2. Add or update its `server-plugins.json`.
3. Create `/opt/cs2/<server-name>-s2s/.env` on the development host.
4. Confirm the compose addon volume name and plugin directory path.
5. Add an entry to `edgegamers-s2s/config/development-servers.json`.
6. Add a clone line for that server repo in `.github/workflows/deploy-dev.yml`.
7. Merge the server repo to `dev` so its payload deploys.
8. Merge `edgegamers-s2s` to `dev` so plugin reconcile can read the new intent and update the server.

Development reconcile removes no-longer-listed managed plugins and keeps disabled plugins updated under:

```text
addons/s2script/plugins/disabled/<plugin-name>.s2sp
```

## Production Release Flow

1. Merge plugin changes through `edgegamers-s2s/main` with Changesets.
2. Wait for GitHub plugin release assets.
3. Merge common server changes to `empty-s2s/main`.
4. Tag `empty-s2s` with `YY.MM.DD`.
5. Test child servers on `dev`; they auto-adopt the new common release.
6. Merge child server changes to that repo's `main`.
7. Tag the child server repo with `YY.MM.DD`.

Use `YY.MM.DD-HOTPATCH-N` if the date tag already exists.

Production servers use the frozen `server-release-manifest.json` from their server repo tag until the next tag.

## First Deploy Checklist

Run these locally before opening the server repo merge request:

```bash
bash scripts/validate.sh
docker build --pull --progress plain -t <server-name>-s2s:local .
```

On the host:

```bash
sudo mkdir -p /opt/cs2/<server-name>-s2s
sudo chown <deploy-user>:<deploy-user> /opt/cs2/<server-name>-s2s
```

Create `.env`, configure GitLab variables, merge to `dev`, then verify:

```bash
docker compose -f /opt/cs2/<server-name>-s2s/compose.yml ps
docker logs <container-name> --tail 100
```

After dev smoke testing, merge to `main` and tag production.
