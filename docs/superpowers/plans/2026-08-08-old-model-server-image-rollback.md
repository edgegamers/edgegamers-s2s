# Old-model Server Image Rollback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Return EdgeGamers Source2Script server deployment to runnable server images built by server repositories, with `edgegamers-s2s` only building packages and triggering affected dev server pipelines.

**Architecture:** `base-s2s` becomes the game-agnostic Source 2/S2Script base layer. `empty-s2s` becomes the runnable CS2 base server image that keeps the existing `cs2-data` shared install model. `ttt-s2s` becomes a runnable child CS2 server image inheriting from `empty-s2s:main`; server repo GitLab pipelines build images, SSH compose files, restart dev, and leave prod restarts to the 10:00 host schedule.

**Tech Stack:** GitHub Actions, GitLab CI, Docker, Docker Compose, Bash, SSH/scp, Node.js 24, npm 11, Source2Script CLI, Vitest.

## Global Constraints

- Do not use `ghcr.io/s2script/s2script-runtime-image` in EdgeGamers server compose files.
- Keep the existing `cs2-data` shared CS2 install model for this pass.
- Do not redesign the CS2 update/install flow in this pass.
- `edgegamers-s2s` still triggers affected development server pipelines with GitLab trigger tokens.
- `edgegamers-s2s` must not SSH into game servers.
- Server repositories own Docker image builds, compose files, SSH deploys, dev restarts, and production deploy policy.
- Development server pipelines pull the rebuilt image and restart the development container.
- Production deploy pipelines do not force live production restarts; production hosts restart at 10:00.
- `empty-s2s:main` is the default base image for child CS2 server repos.
- Delete payload-runtime tooling instead of preserving compatibility shims.
- Leave untracked user files alone unless the task explicitly claims them and the worker verifies they are obsolete generated setup docs.

---

## File Structure

### `C:\Users\reece\VSCodeProjects\edgegamers-s2s`

- Keep: `scripts/build-server-bundles.mjs`, `scripts/trigger-gitlab-server-pipelines.mjs`, `scripts/lib/server-bundle-list.mjs`, `scripts/lib/server-bundle-plan.mjs`.
- Modify: `.github/workflows/deploy-dev.yml`, `.github/workflows/release.yml`, `package.json`, `docs/architecture.md`, `docs/releases.md`, `docs/implementation-status.md`, `.github/MANUAL_SETUP.md`, tests that describe workflow/deploy boundaries.
- Delete: `scripts/create-dev-manifest.mjs`, `scripts/collect-local-artifacts.mjs`, `scripts/lib/development-manifest.mjs`, and their tests.
- Keep trigger-token variables for affected development server repos.

### `C:\Users\reece\VSCodeProjects\base-s2s`

- Modify: `Dockerfile`, `README.md`, `docs/system-design.md`, `scripts/validate.sh`.
- Keep: helper scripts that install Source2/S2Script runtime pieces without CS2-specific paths.
- Delete payload-packaging scripts: `scripts/package-source2-s2s-addons.sh`, `scripts/apply-source2-s2s-base.sh`.
- Move CS2-specific gameinfo patching responsibility out of this repo.

### `C:\Users\reece\VSCodeProjects\empty-s2s`

- Replace: `Dockerfile`, `.gitlab-ci.yml`, `compose-dev.yml`, `README.md`, `docs/system-design.md`, `scripts/validate.sh`.
- Create: `docker-entrypoint.sh`, `tail-logs.sh`.
- Delete: `scripts/download-plugin-bundle.sh`, `tests/download-plugin-bundle.test.sh`, `plugin-bundle/plugins/.gitkeep`, `s2script-plugins.txt`.
- Preserve: `csgo/cfg/server.cfg`.
- Produce image: `registry.edgegamers.io/source2/cs2/servers/empty-s2s:$CI_COMMIT_REF_SLUG`.

### `C:\Users\reece\VSCodeProjects\ttt-s2s`

- Replace: `Dockerfile`, `.gitlab-ci.yml`, `compose-dev.yml`, `compose-prod.yml`, `README.md`, `docs/system-design.md`, `scripts/validate.sh`.
- Do not create a TTT entrypoint; inherit the `empty-s2s` entrypoint.
- Delete: `scripts/download-plugin-bundle.sh`, `tests/download-plugin-bundle.test.sh`, `plugin-bundle/plugins/.gitkeep`.
- Preserve: tracked `csgo/` overlays and `DEPLOYMENT_SETUP.md`.
- Do not touch untracked `NEW_SERVER_SETUP.md` and `SERVER_REBUILD_SETUP.md` until a worker inspects whether they are user-authored.
- Produce image: `registry.edgegamers.io/source2/cs2/servers/ttt-s2s:$CI_COMMIT_REF_SLUG`.

---

### Task 1: Trim `edgegamers-s2s` To Package Build And Dev Trigger Ownership

**Files:**
- Modify: `C:\Users\reece\VSCodeProjects\edgegamers-s2s\package.json`
- Modify: `C:\Users\reece\VSCodeProjects\edgegamers-s2s\.github\workflows\deploy-dev.yml`
- Modify: `C:\Users\reece\VSCodeProjects\edgegamers-s2s\.github\workflows\release.yml`
- Modify: `C:\Users\reece\VSCodeProjects\edgegamers-s2s\scripts\test\github-workflows.test.mjs`
- Modify: `C:\Users\reece\VSCodeProjects\edgegamers-s2s\scripts\test\trigger-gitlab-server-pipelines.test.mjs`
- Delete: `C:\Users\reece\VSCodeProjects\edgegamers-s2s\scripts\create-dev-manifest.mjs`
- Delete: `C:\Users\reece\VSCodeProjects\edgegamers-s2s\scripts\collect-local-artifacts.mjs`
- Delete: `C:\Users\reece\VSCodeProjects\edgegamers-s2s\scripts\lib\development-manifest.mjs`
- Delete: `C:\Users\reece\VSCodeProjects\edgegamers-s2s\scripts\test\create-dev-manifest.test.mjs`
- Delete: `C:\Users\reece\VSCodeProjects\edgegamers-s2s\scripts\test\collect-local-artifacts.test.mjs`
- Delete: `C:\Users\reece\VSCodeProjects\edgegamers-s2s\scripts\test\development-manifest.test.mjs`

**Interfaces:**
- Consumes: existing `npm run build`, `npm run bundles:servers`, and `npm run trigger:servers`.
- Produces: `edgegamers-s2s` package/build workflow with no SSH deployment and no local development manifest tooling.

- [ ] **Step 1: Write failing workflow boundary tests**

In `scripts/test/github-workflows.test.mjs`, add assertions that the dev workflow builds server bundles and triggers GitLab, but does not use SSH, scp, rsync, runtime-image, payload extraction, or development manifests:

```js
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path) => readFileSync(path, "utf8");

describe("GitHub workflow server boundary", () => {
  it("keeps development deploys to package build and GitLab triggers", () => {
    const workflow = read(".github/workflows/deploy-dev.yml");

    expect(workflow).toContain("npm run build");
    expect(workflow).toContain("npm run bundles:servers -- --environment development");
    expect(workflow).toContain("npm run trigger:servers -- --environment development --ref dev");

    for (const forbidden of [
      "ssh ",
      "scp ",
      "rsync",
      "DEV_SSH",
      "manifest:dev",
      "artifacts:local",
      "ghcr.io/s2script/s2script-runtime-image",
      "SOURCE2_UPDATE_ON_START",
      "payload",
    ]) {
      expect(workflow).not.toContain(forbidden);
    }
  });

  it("keeps production release package-oriented and server-repo agnostic", () => {
    const workflow = read(".github/workflows/release.yml");

    expect(workflow).toContain("npm run build");
    expect(workflow).toContain("npm run bundles:servers -- --environment production");
    expect(workflow).toContain("npm run deploy -- --ci");

    for (const forbidden of [
      "ssh ",
      "scp ",
      "rsync",
      "docker compose",
      "SOURCE2_UPDATE_ON_START",
      "ghcr.io/s2script/s2script-runtime-image",
    ]) {
      expect(workflow).not.toContain(forbidden);
    }
  });
});
```

If `scripts/test/github-workflows.test.mjs` already contains overlapping tests, replace the overlapping cases with the two cases above instead of duplicating imports.

- [ ] **Step 2: Run tests to verify the old tooling fails the new boundary**

Run:

```powershell
npm.cmd test -- scripts/test/github-workflows.test.mjs
```

Expected: FAIL while the workflow or package scripts still reference removed local artifact/development-manifest behavior.

- [ ] **Step 3: Remove local manifest scripts and package commands**

In `package.json`, remove these script entries:

```json
"manifest:dev": "node scripts/create-dev-manifest.mjs",
"artifacts:local": "npm run build && npm run manifest:dev && node scripts/collect-local-artifacts.mjs"
```

Do not remove:

```json
"bundles:servers": "node scripts/build-server-bundles.mjs",
"trigger:servers": "node scripts/trigger-gitlab-server-pipelines.mjs"
```

Delete the obsolete local manifest files listed in this task's `Delete` section. After deletion, run:

```powershell
rg -n "create-dev-manifest|collect-local-artifacts|development-manifest|manifest:dev|artifacts:local" package.json scripts .github docs
```

Expected: no hits outside old historical plan/spec documents under `docs/superpowers/`.

- [ ] **Step 4: Keep trigger payload focused on server image rebuilds**

In `scripts/trigger-gitlab-server-pipelines.mjs`, keep the existing trigger token flow and ensure each request still sends:

```text
variables[PLUGIN_BUNDLE_SERVER]
variables[PLUGIN_BUNDLE_ENV]
variables[PLUGIN_BUNDLE_COMMIT]
variables[PLUGIN_BUNDLE_GITHUB_REPOSITORY]
variables[PLUGIN_BUNDLE_GITHUB_RUN_ID]
variables[PLUGIN_BUNDLE_ACTIONS_ARTIFACT_NAME]
variables[PLUGIN_BUNDLE_ARTIFACT_NAME]
variables[PLUGIN_BUNDLE_SHA256]
```

In `scripts/test/trigger-gitlab-server-pipelines.test.mjs`, update the test name to describe image rebuilds:

```js
it("creates one dev image-rebuild GitLab trigger request per configured server bundle", () => {
  // keep existing expected request assertions
});
```

No SSH, host path, compose, or restart variable may be added to this trigger payload.

- [ ] **Step 5: Run edge tests**

Run:

```powershell
npm.cmd test -- scripts/test/github-workflows.test.mjs scripts/test/trigger-gitlab-server-pipelines.test.mjs scripts/test/build-server-bundles.test.mjs scripts/test/server-bundle-plan.test.mjs scripts/test/server-bundle-list.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```powershell
git add package.json .github/workflows/deploy-dev.yml .github/workflows/release.yml scripts scripts/test
git commit -m "ci: keep server triggers image-owned"
```

---

### Task 2: Make `base-s2s` Game-Agnostic And Remove Payload Packaging

**Files:**
- Modify: `C:\Users\reece\VSCodeProjects\base-s2s\Dockerfile`
- Modify: `C:\Users\reece\VSCodeProjects\base-s2s\scripts\validate.sh`
- Modify: `C:\Users\reece\VSCodeProjects\base-s2s\README.md`
- Modify: `C:\Users\reece\VSCodeProjects\base-s2s\docs\system-design.md`
- Delete: `C:\Users\reece\VSCodeProjects\base-s2s\scripts\package-source2-s2s-addons.sh`
- Delete: `C:\Users\reece\VSCodeProjects\base-s2s\scripts\apply-source2-s2s-base.sh`
- Delete: `C:\Users\reece\VSCodeProjects\base-s2s\scripts\patch-gameinfo-metamod.sh`

**Interfaces:**
- Consumes: Source2Script CLI install and helper scripts that can run against any Source 2 game directory.
- Produces: `registry.edgegamers.io/source2/base-s2s:$CI_COMMIT_REF_SLUG` as a game-agnostic base with no prebuilt `/opt/source2-s2s` payload and no CS2 path assumptions.

- [ ] **Step 1: Replace validation with game-agnostic assertions**

Replace `scripts/validate.sh` with:

```bash
#!/usr/bin/env bash
set -euo pipefail

test -f Dockerfile
test -f scripts/install-metamod-source2.sh
test -f scripts/install-s2script-runtime.sh
test -f scripts/install-s2script-plugins.sh
test -f scripts/ensure-s2script-dirs.sh

grep -q 'npm install -g @s2script/sdk' Dockerfile
grep -q 'COPY scripts/install-metamod-source2.sh /usr/local/bin/install-metamod-source2' Dockerfile
grep -q 'COPY scripts/install-s2script-runtime.sh /usr/local/bin/install-s2script-runtime' Dockerfile
grep -q 'COPY scripts/install-s2script-plugins.sh /usr/local/bin/install-s2script-plugins' Dockerfile
grep -q 'COPY scripts/ensure-s2script-dirs.sh /usr/local/bin/ensure-s2script-dirs' Dockerfile

if grep -R --exclude='validate.sh' -n 'csgo\|CS2_\|SOURCE2_GAME\|compose-dev\|compose-prod\|/payload\|/opt/source2-s2s\|package-source2-s2s-addons\|apply-source2-s2s-base\|patch-gameinfo-metamod' Dockerfile README.md docs scripts; then
  echo "base-s2s must stay game-agnostic and payload-free" >&2
  exit 1
fi

bash -n scripts/install-metamod-source2.sh
bash -n scripts/install-s2script-runtime.sh
bash -n scripts/install-s2script-plugins.sh
bash -n scripts/ensure-s2script-dirs.sh

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/game"
bash scripts/ensure-s2script-dirs.sh "$tmp/game"
test -d "$tmp/game/addons/s2script/plugins"
test -d "$tmp/game/addons/s2script/configs"
test -d "$tmp/game/addons/s2script/data"

printf '%s\n' "base-s2s validation passed"
```

- [ ] **Step 2: Run validation to verify it fails**

Run from `C:\Users\reece\VSCodeProjects\base-s2s`:

```powershell
& 'C:\Program Files\Git\bin\bash.exe' -lc 'bash scripts/validate.sh'
```

Expected: FAIL because `Dockerfile` still packages `/opt/source2-s2s` and references removed helper scripts.

- [ ] **Step 3: Simplify the Dockerfile**

Replace the active `Dockerfile` body with a base that installs generic tools and helper scripts only:

```dockerfile
# syntax=docker/dockerfile:1.7
FROM debian:bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive
ARG S2SCRIPT_CLI_VERSION=latest

RUN apt-get update \
    && apt-get install --no-install-recommends -y \
      ca-certificates \
      curl \
      unzip \
      tar \
      xz-utils \
    && curl --fail --location --silent --show-error \
      https://nodejs.org/dist/v20.19.0/node-v20.19.0-linux-x64.tar.xz \
      -o /tmp/node.tar.xz \
    && tar -xJf /tmp/node.tar.xz -C /usr/local --strip-components=1 \
    && rm /tmp/node.tar.xz \
    && if [ "$S2SCRIPT_CLI_VERSION" = "latest" ]; then npm install -g @s2script/sdk; else npm install -g "@s2script/sdk@$S2SCRIPT_CLI_VERSION"; fi \
    && rm -rf /var/lib/apt/lists/*

COPY scripts/install-metamod-source2.sh /usr/local/bin/install-metamod-source2
COPY scripts/install-s2script-runtime.sh /usr/local/bin/install-s2script-runtime
COPY scripts/resolve-github-release-asset.sh /usr/local/bin/resolve-github-release-asset
COPY scripts/install-s2script-plugins.sh /usr/local/bin/install-s2script-plugins
COPY scripts/ensure-s2script-dirs.sh /usr/local/bin/ensure-s2script-dirs

RUN chmod +x \
      /usr/local/bin/install-metamod-source2 \
      /usr/local/bin/install-s2script-runtime \
      /usr/local/bin/resolve-github-release-asset \
      /usr/local/bin/install-s2script-plugins \
      /usr/local/bin/ensure-s2script-dirs
```

Delete the three payload/CS2-patching scripts listed above.

- [ ] **Step 4: Rewrite docs**

Rewrite `README.md` and `docs/system-design.md` so they state:

- `base-s2s` is game-agnostic.
- It installs common shell, archive, Node, and Source2Script helper tooling.
- It does not create `/opt/source2-s2s`.
- It does not own CS2, compose, deployment, Metamod gameinfo patching, or server image selection.
- `empty-s2s` applies these helpers to CS2.

- [ ] **Step 5: Run validation**

Run:

```powershell
& 'C:\Program Files\Git\bin\bash.exe' -lc 'bash scripts/validate.sh'
```

Expected: PASS.

- [ ] **Step 6: Build if Docker is available**

Run:

```powershell
docker build --pull --progress plain -t registry.edgegamers.io/source2/base-s2s:local .
```

Expected: PASS if the Docker daemon is available. If Docker is unavailable in the local Codex environment, record that GitLab CI must validate the image build.

- [ ] **Step 7: Commit**

Run:

```powershell
git add Dockerfile README.md docs/system-design.md scripts
git commit -m "refactor: make base s2s game agnostic"
```

---

### Task 3: Convert `empty-s2s` To A Runnable CS2 Base Image

**Files:**
- Replace: `C:\Users\reece\VSCodeProjects\empty-s2s\Dockerfile`
- Replace: `C:\Users\reece\VSCodeProjects\empty-s2s\scripts\validate.sh`
- Create: `C:\Users\reece\VSCodeProjects\empty-s2s\docker-entrypoint.sh`
- Create: `C:\Users\reece\VSCodeProjects\empty-s2s\tail-logs.sh`
- Modify: `C:\Users\reece\VSCodeProjects\empty-s2s\README.md`
- Modify: `C:\Users\reece\VSCodeProjects\empty-s2s\docs\system-design.md`
- Delete: `C:\Users\reece\VSCodeProjects\empty-s2s\scripts\download-plugin-bundle.sh`
- Delete: `C:\Users\reece\VSCodeProjects\empty-s2s\tests\download-plugin-bundle.test.sh`
- Delete: `C:\Users\reece\VSCodeProjects\empty-s2s\plugin-bundle\plugins\.gitkeep`
- Delete: `C:\Users\reece\VSCodeProjects\empty-s2s\s2script-plugins.txt`

**Interfaces:**
- Consumes: `registry.edgegamers.io/source2/base-s2s:main` helper layer.
- Produces: runnable CS2 baseline server image at `registry.edgegamers.io/source2/cs2/servers/empty-s2s:$CI_COMMIT_REF_SLUG`.

- [ ] **Step 1: Replace validation with runnable-image assertions**

Replace `scripts/validate.sh` with:

```bash
#!/usr/bin/env bash
set -euo pipefail

test -f Dockerfile
test -f docker-entrypoint.sh
test -f tail-logs.sh
test -f compose-dev.yml
test -f csgo/cfg/server.cfg

grep -q 'FROM registry.edgegamers.io/source2/base-s2s:main AS source2-base' Dockerfile
grep -q 'FROM registry.edgegamers.io/source/steamcmd:alpaquita' Dockerfile
grep -q 'COPY --from=source2-base /usr/local/bin/install-metamod-source2 /usr/local/bin/install-metamod-source2' Dockerfile
grep -q 'COPY --chmod=755 docker-entrypoint.sh /docker-entrypoint.sh' Dockerfile
grep -q 'ENTRYPOINT \["/docker-entrypoint.sh"\]' Dockerfile

grep -q 'image: registry.edgegamers.io/source2/cs2/servers/empty-s2s:dev' compose-dev.yml
grep -q 'cs2-data:/cache' compose-dev.yml

if grep -R --exclude='validate.sh' -n 'ghcr.io/s2script/s2script-runtime-image\|/payload\|payload-out\|SOURCE2_UPDATE_ON_START\|SOURCE2_RUN_WATCHER\|download-plugin-bundle\|PLUGIN_BUNDLE\|s2script-plugins.txt\|source2-cs2-state\|empty-s2s-addons' Dockerfile compose-dev.yml README.md docs scripts tests 2>/dev/null; then
  echo "empty-s2s still contains payload-runtime tooling" >&2
  exit 1
fi

bash -n docker-entrypoint.sh
bash -n tail-logs.sh

printf '%s\n' "empty-s2s validation passed"
```

- [ ] **Step 2: Run validation to verify it fails**

Run from `C:\Users\reece\VSCodeProjects\empty-s2s`:

```powershell
& 'C:\Program Files\Git\bin\bash.exe' -lc 'bash scripts/validate.sh'
```

Expected: FAIL because the repo still uses payload-runtime compose and plugin bundle download tooling.

- [ ] **Step 3: Replace Dockerfile with layered runnable image**

Replace `Dockerfile` with:

```dockerfile
# syntax=docker/dockerfile:1.7

FROM registry.edgegamers.io/source2/base-s2s:main AS source2-base

FROM debian:bookworm-slim AS cs2-addons

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
    && apt-get install --no-install-recommends -y ca-certificates curl grep tar unzip \
    && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /tmp/app/game/csgo

COPY --from=source2-base /usr/local/bin/install-metamod-source2 /usr/local/bin/install-metamod-source2
COPY --from=source2-base /usr/local/bin/install-s2script-runtime /usr/local/bin/install-s2script-runtime
COPY --from=source2-base /usr/local/bin/resolve-github-release-asset /usr/local/bin/resolve-github-release-asset
COPY --from=source2-base /usr/local/bin/ensure-s2script-dirs /usr/local/bin/ensure-s2script-dirs

RUN chmod +x /usr/local/bin/install-metamod-source2 /usr/local/bin/install-s2script-runtime /usr/local/bin/resolve-github-release-asset /usr/local/bin/ensure-s2script-dirs \
    && METAMOD_SOURCE="$(resolve-github-release-asset alliedmodders/metamod-source '^mmsource-2[.]0[.]0-.*-linux[.]tar[.]gz$' '' all)" \
    && install-metamod-source2 /tmp/app/game/csgo "$METAMOD_SOURCE" \
    && install-s2script-runtime latest /tmp/app/game/csgo

# MultiAddonManager
RUN MAM_URL="$(curl -fsSL https://api.github.com/repos/Source2ZE/MultiAddonManager/releases/latest \
    | grep browser_download_url \
    | grep 'linux.tar.gz"' \
    | head -n 1 \
    | cut -d '"' -f 4)" \
    && test -n "$MAM_URL" \
    && curl -fL "$MAM_URL" -o /tmp/multiaddonmanager.tar.gz \
    && tar -xzf /tmp/multiaddonmanager.tar.gz -C /tmp/app/game/csgo \
    && rm /tmp/multiaddonmanager.tar.gz

# ServerListPlayersFix
RUN SLPF_URL="$(curl -fsSL https://api.github.com/repos/Source2ZE/ServerListPlayersFix/releases/latest \
    | grep browser_download_url \
    | grep 'linux.tar.gz"' \
    | head -n 1 \
    | cut -d '"' -f 4)" \
    && test -n "$SLPF_URL" \
    && curl -fL "$SLPF_URL" -o /tmp/serverlistplayersfix.tar.gz \
    && tar -xzf /tmp/serverlistplayersfix.tar.gz -C /tmp/app/game/csgo \
    && rm /tmp/serverlistplayersfix.tar.gz

# BeamCrashFix
RUN BCF_URL="$(curl -fsSL https://api.github.com/repos/SlynxCZ/BeamCrashFix_mm/releases/latest \
    | grep browser_download_url \
    | grep 'linux.tar.gz"' \
    | head -n 1 \
    | cut -d '"' -f 4)" \
    && test -n "$BCF_URL" \
    && curl -fL "$BCF_URL" -o /tmp/beamcrashfix.tar.gz \
    && tar -xzf /tmp/beamcrashfix.tar.gz -C /tmp/app/game/csgo \
    && rm /tmp/beamcrashfix.tar.gz

FROM registry.edgegamers.io/source/steamcmd:alpaquita

WORKDIR /app

COPY --from=source2-base /usr/local/bin/install-s2script-plugins /usr/local/bin/install-s2script-plugins
COPY --from=source2-base /usr/local/bin/ensure-s2script-dirs /usr/local/bin/ensure-s2script-dirs
COPY --from=cs2-addons --chown=1000:1000 /tmp/app/. /app/
COPY --chmod=755 docker-entrypoint.sh /docker-entrypoint.sh
COPY --chmod=755 tail-logs.sh /app/tail-logs.sh
COPY --chown=1000:1000 csgo /app/game/csgo

VOLUME ["/app"]

ENTRYPOINT ["/docker-entrypoint.sh"]
```

This intentionally keeps the old SteamCMD image as the final runtime base and copies game-agnostic helper binaries from `base-s2s`.

- [ ] **Step 4: Add CS2 entrypoint**

Create `docker-entrypoint.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

patch_gameinfo_metamod() {
  local gameinfo="/app/game/csgo/gameinfo.gi"
  test -f "$gameinfo"

  if ! grep -Fq "csgo/addons/metamod" "$gameinfo"; then
    sed -i '/Game_LowViolence[[:space:]].*csgo_lv/a\
			Game    csgo/addons/metamod
' "$gameinfo"
  fi

  if ! grep -Fq "csgo/addons/metamod" "$gameinfo"; then
    echo "ERROR: Failed to add Metamod to $gameinfo" >&2
    exit 1
  fi
}

APP_SERVER_NAME="${APP_SERVER_NAME:-EdgeGamers Empty Development | EdgeGamers.com}"
APP_SERVER_IP="${APP_SERVER_IP:-0.0.0.0}"
APP_SERVER_PORT="${APP_SERVER_PORT:-27030}"
APP_SERVER_STEAMTOKEN="${APP_SERVER_STEAMTOKEN:-${SRCDS_TOKEN:-}}"
APP_SERVER_PASSWORD="${APP_SERVER_PASSWORD:-${CS2_PW:-}}"
APP_SERVER_RCON_PASSWORD="${APP_SERVER_RCON_PASSWORD:-${CS2_RCONPW:-}}"
APP_SERVER_MAXPLAYERS="${APP_SERVER_MAXPLAYERS:-64}"
APP_SERVER_GAMETYPE="${APP_SERVER_GAMETYPE:-3}"
APP_SERVER_GAMEMODE="${APP_SERVER_GAMEMODE:-0}"
APP_SERVER_STARTMAP="${APP_SERVER_STARTMAP:-de_inferno}"
APP_SERVER_ADDITIONAL_ARGS="${APP_SERVER_ADDITIONAL_ARGS:-${CS2_ADDITIONAL_ARGS:-}}"

if [ "${APP_SERVER_MONTHLY_PASSWORD:-false}" = "true" ]; then
  date_string="$(date +'%y.%m')"
  APP_SERVER_PASSWORD="$(printf '%s' "$date_string" | sha256sum | cut -d ' ' -f 1)"
fi

if [ "${APP_SERVER_RANDOM_RCON_PASSWORD:-false}" = "true" ]; then
  APP_SERVER_RCON_PASSWORD="$(tr -dc 'a-zA-Z0-9' </dev/urandom | head -c 16)"
fi

if [ ! -f "/app/game/csgo/steam.inf" ]; then
  cp -afs /cache/* /app 2>/dev/null || true
  if [ -d /cache ]; then
    cd /cache
    find . -type f \( -name '*.cfg' -o -name '*.so*' -o -name '*.txt' -o -name 'cs2' \) -exec cp -af --parents --remove-destination {} /app \;
  fi
fi

steamcmd \
  +@sSteamCmdForcePlatformType linux \
  +force_install_dir /app \
  +login anonymous \
  +app_update 730 \
  +quit

patch_gameinfo_metamod

if [ -d /app/game/csgo/cfg ]; then
  find /app/game/csgo/cfg -type f -name '*.cfg' -exec sed -i \
    -e "s/{APP_SERVER_NAME}/${APP_SERVER_NAME}/g" \
    -e "s/{APP_SERVER_RCON_PASSWORD}/${APP_SERVER_RCON_PASSWORD}/g" \
    -e "s/{APP_SERVER_PASSWORD}/${APP_SERVER_PASSWORD}/g" \
    -e "s/{APP_SERVER_STEAMTOKEN}/${APP_SERVER_STEAMTOKEN}/g" \
    {} +
fi

if [ ! -f "/home/steam/.steam/sdk64/steamclient.so" ]; then
  mkdir -p /home/steam/.steam/sdk64
  cp /home/steam/steamcmd/linux64/steamclient.so /home/steam/.steam/sdk64
fi

export DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=1
export LD_LIBRARY_PATH="/app/game/csgo/bin/linuxsteamrt64:${LD_LIBRARY_PATH:-}"

/app/tail-logs.sh /app/game/csgo/addons/s2script/logs /app/game/csgo/addons/counterstrikesharp/logs &

exec /app/game/bin/linuxsteamrt64/cs2 \
  -dedicated \
  -condebug \
  -ip "$APP_SERVER_IP" \
  -port "$APP_SERVER_PORT" \
  -maxplayers "$APP_SERVER_MAXPLAYERS" \
  -usercon \
  +hostname "$APP_SERVER_NAME" \
  +game_type "$APP_SERVER_GAMETYPE" \
  +game_mode "$APP_SERVER_GAMEMODE" \
  +sv_password "$APP_SERVER_PASSWORD" \
  +sv_setsteamaccount "$APP_SERVER_STEAMTOKEN" \
  +map "$APP_SERVER_STARTMAP" \
  $APP_SERVER_ADDITIONAL_ARGS
```

- [ ] **Step 5: Add log tail helper**

Create `tail-logs.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

for dir in "$@"; do
  mkdir -p "$dir"
done

while true; do
  find "$@" -type f -name '*.log' -print0 2>/dev/null | xargs -0r tail -n 0 -F
  sleep 5
done
```

- [ ] **Step 6: Remove payload tooling files**

Delete:

```text
scripts/download-plugin-bundle.sh
tests/download-plugin-bundle.test.sh
plugin-bundle/plugins/.gitkeep
s2script-plugins.txt
```

Remove empty `tests/` and `plugin-bundle/` directories after the files are gone.

- [ ] **Step 7: Rewrite docs**

Rewrite `README.md` and `docs/system-design.md` to state:

- `empty-s2s` is the runnable CS2 base image.
- It inherits helper tooling from `base-s2s`.
- It keeps the old `cs2-data:/cache` model for now.
- It does not use the GHCR runtime image.
- It does not use payload extraction.
- Child CS2 servers inherit from `empty-s2s:main`.

- [ ] **Step 8: Run validation**

Run:

```powershell
& 'C:\Program Files\Git\bin\bash.exe' -lc 'bash scripts/validate.sh'
```

Expected: PASS.

- [ ] **Step 9: Build if Docker is available**

Run:

```powershell
docker build --pull --progress plain --build-arg BASE_S2S_IMAGE=registry.edgegamers.io/source2/base-s2s:main -t registry.edgegamers.io/source2/cs2/servers/empty-s2s:local .
```

Expected: PASS if Docker is available. If Docker is unavailable, record that GitLab CI must validate the image build.

- [ ] **Step 10: Commit**

Run:

```powershell
git add Dockerfile docker-entrypoint.sh tail-logs.sh README.md docs/system-design.md scripts compose-dev.yml csgo
git add -u
git commit -m "refactor: restore runnable empty cs2 image"
```

---

### Task 4: Replace `empty-s2s` GitLab Deploy With Image Deploy

**Files:**
- Replace: `C:\Users\reece\VSCodeProjects\empty-s2s\.gitlab-ci.yml`
- Replace: `C:\Users\reece\VSCodeProjects\empty-s2s\compose-dev.yml`
- Modify: `C:\Users\reece\VSCodeProjects\empty-s2s\scripts\validate.sh`

**Interfaces:**
- Consumes: runnable `empty-s2s` image from Task 3.
- Produces: branch builds plus development SSH deploy that copies compose, pulls image, and restarts dev without payload extraction.

- [ ] **Step 1: Extend validation for CI deploy policy**

Append these assertions to `scripts/validate.sh`:

```bash
test -f .gitlab-ci.yml
grep -q 'CONTAINER_IMAGE="${CI_REGISTRY}/source2/cs2/servers/empty-s2s:${CI_COMMIT_REF_SLUG}"' .gitlab-ci.yml
grep -q 'sudo docker compose -f.*pull' .gitlab-ci.yml
grep -q 'sudo docker compose -f.*up -d --remove-orphans --force-recreate' .gitlab-ci.yml

if grep -n 'docker cp\|docker create.*PAYLOAD\|DEPLOY_PAYLOAD_IMAGE\|payload.next\|prepare_plugin_bundle\|PLUGIN_BUNDLE' .gitlab-ci.yml; then
  echo "empty-s2s CI still contains payload bundle deployment" >&2
  exit 1
fi
```

- [ ] **Step 2: Run validation to verify it fails**

Run:

```powershell
& 'C:\Program Files\Git\bin\bash.exe' -lc 'bash scripts/validate.sh'
```

Expected: FAIL while `.gitlab-ci.yml` still extracts payload images.

- [ ] **Step 3: Replace compose-dev**

Replace `compose-dev.yml` with:

```yaml
services:
  cs2-empty-s2s-dev:
    image: registry.edgegamers.io/source2/cs2/servers/empty-s2s:dev
    container_name: cs2-empty-s2s-dev
    restart: unless-stopped
    network_mode: host
    volumes:
      - cs2-data:/cache
    tty: true
    stdin_open: true
    environment:
      APP_SERVER_MONTHLY_PASSWORD: "true"
      APP_SERVER_NAME: "EdgeGamers Empty Development | EdgeGamers.com"
      APP_SERVER_IP: "66.118.246.78"
      APP_SERVER_PORT: "27030"
      APP_SERVER_MAXPLAYERS: "64"
      APP_SERVER_STEAMTOKEN: "${SRCDS_TOKEN:-}"
      APP_SERVER_RCON_PASSWORD: "${CS2_RCONPW:-}"
      APP_SERVER_GAMETYPE: "3"
      APP_SERVER_GAMEMODE: "0"
      APP_SERVER_STARTMAP: "de_inferno"
      APP_SERVER_ADDITIONAL_ARGS: "+sv_hibernate_when_empty 0"

volumes:
  cs2-data:
    external: true
    name: cs2-data
```

- [ ] **Step 4: Replace GitLab CI**

Replace `.gitlab-ci.yml` with:

```yaml
stages:
  - validate
  - build
  - deploy

validate:
  stage: validate
  image: alpine:3.20
  before_script:
    - apk add --no-cache bash grep
  script:
    - bash scripts/validate.sh
  tags:
    - docker

build:
  stage: build
  image: docker:24.0.7
  services:
    - docker:24.0.7-dind
  variables:
    DOCKER_BUILDKIT: "1"
    DOCKER_HOST: tcp://docker:2375
    DOCKER_TLS_CERTDIR: ""
  before_script:
    - echo "$CI_JOB_TOKEN" | docker login -u gitlab-ci-token --password-stdin "$CI_REGISTRY"
  script:
    - export CONTAINER_IMAGE="${CI_REGISTRY}/source2/cs2/servers/empty-s2s:${CI_COMMIT_REF_SLUG}"
    - test -n "$CI_REGISTRY"
    - test -n "$CI_COMMIT_REF_SLUG"
    - docker pull "$CONTAINER_IMAGE" || true
    - docker build
      --pull
      --progress plain
      --build-arg BUILDKIT_INLINE_CACHE=1
      --cache-from "$CONTAINER_IMAGE"
      -t "$CONTAINER_IMAGE"
      .
    - docker push "$CONTAINER_IMAGE"
  rules:
    - if: '$CI_COMMIT_BRANCH'
  tags:
    - docker

deploy_dev:
  stage: deploy
  image: alpine:3.20
  services: []
  variables:
    DEPLOY_PATH: "/opt/cs2/empty-s2s"
    COMPOSE_FILE: "compose-dev.yml"
  before_script:
    - apk add --no-cache openssh-client
    - test -n "$DEPLOY_SSH_PRIVATE_KEY"
    - test -n "$DEPLOY_KNOWN_HOSTS"
    - test -n "$DEPLOY_DEV_HOST"
    - test -n "$DEPLOY_DEV_USER"
    - mkdir -p ~/.ssh
    - chmod 700 ~/.ssh
    - printf '%s\n' "$DEPLOY_SSH_PRIVATE_KEY" | tr -d '\r' > ~/.ssh/id_ed25519
    - chmod 600 ~/.ssh/id_ed25519
    - printf '%s\n' "$DEPLOY_KNOWN_HOSTS" > ~/.ssh/known_hosts
    - chmod 644 ~/.ssh/known_hosts
  script:
    - ssh "$DEPLOY_DEV_USER@$DEPLOY_DEV_HOST" "test -d '$DEPLOY_PATH' && test -f '$DEPLOY_PATH/.env'"
    - scp "$COMPOSE_FILE" "$DEPLOY_DEV_USER@$DEPLOY_DEV_HOST:$DEPLOY_PATH/compose.yml.next"
    - |
      ssh "$DEPLOY_DEV_USER@$DEPLOY_DEV_HOST" "
        set -e
        if [ ! -f '$DEPLOY_PATH/compose.yml' ] || ! cmp -s '$DEPLOY_PATH/compose.yml' '$DEPLOY_PATH/compose.yml.next'; then
          mv '$DEPLOY_PATH/compose.yml.next' '$DEPLOY_PATH/compose.yml'
          chmod 664 '$DEPLOY_PATH/compose.yml'
        else
          rm '$DEPLOY_PATH/compose.yml.next'
        fi
        sudo docker compose -f '$DEPLOY_PATH/compose.yml' pull
        sudo docker compose -f '$DEPLOY_PATH/compose.yml' up -d --remove-orphans --force-recreate
      "
  environment:
    name: development
  rules:
    - if: '$CI_COMMIT_BRANCH == "dev"'
  tags:
    - docker
```

- [ ] **Step 5: Run validation**

Run:

```powershell
& 'C:\Program Files\Git\bin\bash.exe' -lc 'bash scripts/validate.sh'
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```powershell
git add .gitlab-ci.yml compose-dev.yml scripts/validate.sh README.md docs/system-design.md
git commit -m "ci: deploy empty dev as image"
```

---

### Task 5: Convert `ttt-s2s` To A Runnable Child CS2 Image

**Files:**
- Replace: `C:\Users\reece\VSCodeProjects\ttt-s2s\Dockerfile`
- Replace: `C:\Users\reece\VSCodeProjects\ttt-s2s\scripts\validate.sh`
- Modify: `C:\Users\reece\VSCodeProjects\ttt-s2s\README.md`
- Modify: `C:\Users\reece\VSCodeProjects\ttt-s2s\docs\system-design.md`
- Delete: `C:\Users\reece\VSCodeProjects\ttt-s2s\scripts\download-plugin-bundle.sh`
- Delete: `C:\Users\reece\VSCodeProjects\ttt-s2s\tests\download-plugin-bundle.test.sh`
- Delete: `C:\Users\reece\VSCodeProjects\ttt-s2s\plugin-bundle\plugins\.gitkeep`

**Interfaces:**
- Consumes: `registry.edgegamers.io/source2/cs2/servers/empty-s2s:main`.
- Produces: runnable TTT server image with server-specific overlays and downloaded package bundle files copied into `/app/game/csgo/addons/s2script/plugins`.

- [ ] **Step 1: Replace validation with runnable TTT assertions**

Replace `scripts/validate.sh` with:

```bash
#!/usr/bin/env bash
set -euo pipefail

test -f Dockerfile
test -f compose-dev.yml
test -f compose-prod.yml
test -d csgo

grep -q 'ARG EMPTY_S2S_IMAGE=registry.edgegamers.io/source2/cs2/servers/empty-s2s:main' Dockerfile
grep -q 'FROM ${EMPTY_S2S_IMAGE} AS empty-base' Dockerfile
grep -q 'FROM ${EMPTY_S2S_IMAGE}' Dockerfile
grep -q 'COPY --from=ttt-addons --chown=1000:1000 /tmp/app/. /app/' Dockerfile
grep -q 'COPY --chown=1000:1000 csgo /app/game/csgo' Dockerfile
grep -q 'registry.edgegamers.io/source2/cs2/servers/ttt-s2s:dev' compose-dev.yml
grep -q 'registry.edgegamers.io/source2/cs2/servers/ttt-s2s:main' compose-prod.yml
grep -q 'cs2-data:/cache' compose-dev.yml
grep -q 'cs2-data:/cache' compose-prod.yml

if grep -R --exclude='validate.sh' -n 'ghcr.io/s2script/s2script-runtime-image\|/payload\|payload-out\|SOURCE2_UPDATE_ON_START\|SOURCE2_RUN_WATCHER\|download-plugin-bundle\|source2-cs2-state\|ttt-addons:' Dockerfile compose-dev.yml compose-prod.yml README.md docs scripts tests 2>/dev/null; then
  echo "ttt-s2s still contains payload-runtime tooling" >&2
  exit 1
fi

printf '%s\n' "ttt-s2s validation passed"
```

- [ ] **Step 2: Run validation to verify it fails**

Run from `C:\Users\reece\VSCodeProjects\ttt-s2s`:

```powershell
& 'C:\Program Files\Git\bin\bash.exe' -lc 'bash scripts/validate.sh'
```

Expected: FAIL because the repo still uses payload-runtime compose and bundle download tooling.

- [ ] **Step 3: Replace Dockerfile**

Replace `Dockerfile` with:

```dockerfile
# syntax=docker/dockerfile:1.7
ARG EMPTY_S2S_IMAGE=registry.edgegamers.io/source2/cs2/servers/empty-s2s:main

FROM ${EMPTY_S2S_IMAGE} AS empty-base

FROM debian:bookworm-slim AS ttt-addons

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
    && apt-get install --no-install-recommends -y ca-certificates curl grep unzip \
    && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /tmp/app/game/csgo/addons

# StripperCS2
RUN mkdir -p /tmp/stripper \
    && curl -fsSL https://api.github.com/repos/Source2ZE/StripperCS2/releases/latest \
        | grep browser_download_url \
        | grep '\.zip"' \
        | head -n 1 \
        | cut -d '"' -f 4 \
        | xargs curl -fL -o /tmp/stripper.zip \
    && unzip -q /tmp/stripper.zip -d /tmp/stripper \
    && cp -a /tmp/stripper/addons/. /tmp/app/game/csgo/addons/ \
    && rm -rf /tmp/stripper /tmp/stripper.zip

FROM ${EMPTY_S2S_IMAGE}

WORKDIR /app

COPY --from=ttt-addons --chown=1000:1000 /tmp/app/. /app/
COPY --chown=1000:1000 csgo /app/game/csgo
```

This inherits the `empty-s2s` entrypoint and CS2 startup behavior.

- [ ] **Step 4: Remove payload tooling files**

Delete:

```text
scripts/download-plugin-bundle.sh
tests/download-plugin-bundle.test.sh
plugin-bundle/plugins/.gitkeep
```

Remove empty `tests/` and `plugin-bundle/` directories after the files are gone.

- [ ] **Step 5: Rewrite docs**

Rewrite `README.md` and `docs/system-design.md` to state:

- `ttt-s2s` is a runnable child CS2 server image.
- It inherits from `empty-s2s:main`.
- It does not use GHCR runtime-image or payload extraction.
- Plugin package changes are delivered by rebuilding the server image through a triggered GitLab pipeline.
- Dev restarts immediately; prod waits for the 10:00 host restart.

- [ ] **Step 6: Run validation**

Run:

```powershell
& 'C:\Program Files\Git\bin\bash.exe' -lc 'bash scripts/validate.sh'
```

Expected: PASS.

- [ ] **Step 7: Build if Docker is available**

Run:

```powershell
docker build --pull --progress plain --build-arg EMPTY_S2S_IMAGE=registry.edgegamers.io/source2/cs2/servers/empty-s2s:main -t registry.edgegamers.io/source2/cs2/servers/ttt-s2s:local .
```

Expected: PASS if Docker is available. If Docker is unavailable, record that GitLab CI must validate the image build.

- [ ] **Step 8: Commit**

Run:

```powershell
git add Dockerfile README.md docs/system-design.md scripts compose-dev.yml compose-prod.yml csgo DEPLOYMENT_SETUP.md
git add -u
git commit -m "refactor: restore runnable ttt image"
```

---

### Task 6: Replace `ttt-s2s` Compose And GitLab Deploy With Image Deploy

**Files:**
- Replace: `C:\Users\reece\VSCodeProjects\ttt-s2s\.gitlab-ci.yml`
- Replace: `C:\Users\reece\VSCodeProjects\ttt-s2s\compose-dev.yml`
- Replace: `C:\Users\reece\VSCodeProjects\ttt-s2s\compose-prod.yml`
- Modify: `C:\Users\reece\VSCodeProjects\ttt-s2s\scripts\validate.sh`
- Modify: `C:\Users\reece\VSCodeProjects\ttt-s2s\DEPLOYMENT_SETUP.md`

**Interfaces:**
- Consumes: runnable TTT image from Task 5 and triggered plugin-bundle variables from `edgegamers-s2s`.
- Produces: dev image deploy with forced recreate and prod compose update without forced restart.

- [ ] **Step 1: Extend validation for dev and prod deploy policy**

Append these assertions to `scripts/validate.sh`:

```bash
test -f .gitlab-ci.yml
grep -q 'CONTAINER_IMAGE="${CI_REGISTRY}/source2/cs2/servers/ttt-s2s:${CI_COMMIT_REF_SLUG}"' .gitlab-ci.yml
grep -q 'EMPTY_S2S_TAG: "main"' .gitlab-ci.yml
grep -q 'deploy_dev:' .gitlab-ci.yml
grep -q 'deploy_prod:' .gitlab-ci.yml
grep -q 'sudo docker compose -f.*pull' .gitlab-ci.yml
grep -q 'sudo docker compose -f.*up -d --remove-orphans --force-recreate' .gitlab-ci.yml
grep -q 'Production deploy intentionally does not restart' .gitlab-ci.yml

if grep -n 'docker cp\|docker create.*PAYLOAD\|DEPLOY_PAYLOAD_IMAGE\|payload.next\|prepare_plugin_bundle' .gitlab-ci.yml; then
  echo "ttt-s2s CI still contains payload deployment" >&2
  exit 1
fi
```

- [ ] **Step 2: Run validation to verify it fails**

Run:

```powershell
& 'C:\Program Files\Git\bin\bash.exe' -lc 'bash scripts/validate.sh'
```

Expected: FAIL while `.gitlab-ci.yml` and compose files still use runtime-image/payload deployment.

- [ ] **Step 3: Replace compose-dev**

Replace `compose-dev.yml` with:

```yaml
services:
  cs2-ttt-s2s-dev:
    image: registry.edgegamers.io/source2/cs2/servers/ttt-s2s:dev
    container_name: cs2-ttt-s2s-dev
    restart: unless-stopped
    network_mode: host
    volumes:
      - cs2-data:/cache
    tty: true
    stdin_open: true
    environment:
      APP_SERVER_MONTHLY_PASSWORD: "true"
      APP_SERVER_NAME: "EdgeGamers TTT Development | EdgeGamers.com"
      APP_SERVER_IP: "66.118.246.78"
      APP_SERVER_PORT: "27031"
      APP_SERVER_MAXPLAYERS: "64"
      APP_SERVER_STEAMTOKEN: "${SRCDS_TOKEN:-}"
      APP_SERVER_RCON_PASSWORD: "${CS2_RCONPW:-}"
      APP_SERVER_GAMETYPE: "3"
      APP_SERVER_GAMEMODE: "0"
      APP_SERVER_STARTMAP: "de_inferno"
      APP_SERVER_ADDITIONAL_ARGS: "+sv_hibernate_when_empty 0"

volumes:
  cs2-data:
    external: true
    name: cs2-data
```

- [ ] **Step 4: Replace compose-prod**

Replace `compose-prod.yml` with:

```yaml
services:
  cs2-ttt-s2s:
    image: registry.edgegamers.io/source2/cs2/servers/ttt-s2s:main
    container_name: cs2-ttt-s2s
    restart: always
    network_mode: host
    volumes:
      - cs2-data:/cache
    tty: true
    stdin_open: true
    environment:
      APP_SERVER_NAME: "=(eGO)= Trouble in Terrorist Town | TTT | Karma | Shop"
      APP_SERVER_IP: "66.118.246.22"
      APP_SERVER_PORT: "27015"
      APP_SERVER_MAXPLAYERS: "64"
      APP_SERVER_STEAMTOKEN: "${SRCDS_TOKEN:-}"
      APP_SERVER_RCON_PASSWORD: "${CS2_RCONPW:-}"
      APP_SERVER_PASSWORD: "${CS2_PW:-}"
      APP_SERVER_GAMETYPE: "3"
      APP_SERVER_GAMEMODE: "0"
      APP_SERVER_STARTMAP: "de_inferno"
      APP_SERVER_ADDITIONAL_ARGS: "+sv_hibernate_when_empty 0"

volumes:
  cs2-data:
    external: true
    name: cs2-data
```

- [ ] **Step 5: Replace GitLab CI**

Replace `.gitlab-ci.yml` with:

```yaml
variables:
  EMPTY_S2S_TAG: "main"

stages:
  - validate
  - build
  - deploy

validate:
  stage: validate
  image: alpine:3.20
  before_script:
    - apk add --no-cache bash grep
  script:
    - bash scripts/validate.sh
  tags:
    - docker

build:
  stage: build
  image: docker:24.0.7
  services:
    - docker:24.0.7-dind
  variables:
    DOCKER_BUILDKIT: "1"
    DOCKER_HOST: tcp://docker:2375
    DOCKER_TLS_CERTDIR: ""
  before_script:
    - echo "$CI_JOB_TOKEN" | docker login -u gitlab-ci-token --password-stdin "$CI_REGISTRY"
  script:
    - export CONTAINER_IMAGE="${CI_REGISTRY}/source2/cs2/servers/ttt-s2s:${CI_COMMIT_REF_SLUG}"
    - test -n "$CI_REGISTRY"
    - test -n "$CI_COMMIT_REF_SLUG"
    - test -n "${REGISTRY_PULL_USER:-}"
    - test -n "${REGISTRY_PULL_PASSWORD:-}"
    - docker pull "$CONTAINER_IMAGE" || true
    - echo "$REGISTRY_PULL_PASSWORD" | docker login -u "$REGISTRY_PULL_USER" --password-stdin "$CI_REGISTRY"
    - docker build
      --pull
      --progress plain
      --build-arg BUILDKIT_INLINE_CACHE=1
      --cache-from "$CONTAINER_IMAGE"
      --build-arg EMPTY_S2S_IMAGE="registry.edgegamers.io/source2/cs2/servers/empty-s2s:${EMPTY_S2S_TAG}"
      -t "$CONTAINER_IMAGE"
      .
    - echo "$CI_JOB_TOKEN" | docker login -u gitlab-ci-token --password-stdin "$CI_REGISTRY"
    - docker push "$CONTAINER_IMAGE"
  rules:
    - if: '$CI_COMMIT_BRANCH'
  tags:
    - docker

.deploy_template:
  stage: deploy
  image: alpine:3.20
  services: []
  variables:
    DEPLOY_PATH: "/opt/cs2/ttt-s2s"
  before_script:
    - apk add --no-cache openssh-client
    - test -n "$DEPLOY_SSH_PRIVATE_KEY"
    - test -n "$DEPLOY_KNOWN_HOSTS"
    - test -n "$DEPLOY_HOST"
    - test -n "$DEPLOY_USER"
    - test -n "$COMPOSE_FILE"
    - mkdir -p ~/.ssh
    - chmod 700 ~/.ssh
    - printf '%s\n' "$DEPLOY_SSH_PRIVATE_KEY" | tr -d '\r' > ~/.ssh/id_ed25519
    - chmod 600 ~/.ssh/id_ed25519
    - printf '%s\n' "$DEPLOY_KNOWN_HOSTS" > ~/.ssh/known_hosts
    - chmod 644 ~/.ssh/known_hosts
  script:
    - ssh "$DEPLOY_USER@$DEPLOY_HOST" "test -d '$DEPLOY_PATH' && test -f '$DEPLOY_PATH/.env'"
    - scp "$COMPOSE_FILE" "$DEPLOY_USER@$DEPLOY_HOST:$DEPLOY_PATH/compose.yml.next"
    - |
      ssh "$DEPLOY_USER@$DEPLOY_HOST" "
        set -e
        if [ ! -f '$DEPLOY_PATH/compose.yml' ] || ! cmp -s '$DEPLOY_PATH/compose.yml' '$DEPLOY_PATH/compose.yml.next'; then
          mv '$DEPLOY_PATH/compose.yml.next' '$DEPLOY_PATH/compose.yml'
          chmod 664 '$DEPLOY_PATH/compose.yml'
        else
          rm '$DEPLOY_PATH/compose.yml.next'
        fi
        $DEPLOY_COMMAND
      "
  tags:
    - docker

deploy_dev:
  extends: .deploy_template
  variables:
    DEPLOY_HOST: "$DEPLOY_DEV_HOST"
    DEPLOY_USER: "$DEPLOY_DEV_USER"
    COMPOSE_FILE: "compose-dev.yml"
    DEPLOY_COMMAND: "sudo docker compose -f '/opt/cs2/ttt-s2s/compose.yml' pull && sudo docker compose -f '/opt/cs2/ttt-s2s/compose.yml' up -d --remove-orphans --force-recreate"
  environment:
    name: development
  rules:
    - if: '$CI_COMMIT_BRANCH == "dev"'

deploy_prod:
  extends: .deploy_template
  variables:
    DEPLOY_HOST: "$DEPLOY_PROD_HOST"
    DEPLOY_USER: "$DEPLOY_PROD_USER"
    COMPOSE_FILE: "compose-prod.yml"
    DEPLOY_COMMAND: "echo 'Production deploy intentionally does not restart; host scheduled restart at 10:00 will pull/use this compose selection.'"
  environment:
    name: production
  rules:
    - if: '$CI_COMMIT_BRANCH == "main"'
    - if: '$CI_COMMIT_TAG'
```

- [ ] **Step 6: Update deployment setup docs**

In `DEPLOYMENT_SETUP.md`, document:

- dev pipeline copies compose and restarts immediately;
- prod pipeline copies compose and does not restart;
- host restart at 10:00 owns prod container restart;
- `cs2-data` must already exist on the host;
- compose uses the server image directly.

- [ ] **Step 7: Run validation**

Run:

```powershell
& 'C:\Program Files\Git\bin\bash.exe' -lc 'bash scripts/validate.sh'
```

Expected: PASS.

- [ ] **Step 8: Commit**

Run:

```powershell
git add .gitlab-ci.yml compose-dev.yml compose-prod.yml scripts/validate.sh DEPLOYMENT_SETUP.md README.md docs/system-design.md
git commit -m "ci: deploy ttt images over ssh"
```

---

### Task 7: Documentation Sweep And Cross-Repo Verification

**Files:**
- Modify: `C:\Users\reece\VSCodeProjects\edgegamers-s2s\docs\architecture.md`
- Modify: `C:\Users\reece\VSCodeProjects\edgegamers-s2s\docs\releases.md`
- Modify: `C:\Users\reece\VSCodeProjects\edgegamers-s2s\docs\implementation-status.md`
- Modify: `C:\Users\reece\VSCodeProjects\edgegamers-s2s\docs\SETUP.md`
- Modify: `C:\Users\reece\VSCodeProjects\edgegamers-s2s\docs\getting-started.md`
- Modify: repo README/system-design files changed by earlier tasks if verification finds stale runtime-image text.

**Interfaces:**
- Consumes: completed repo-level migrations.
- Produces: docs and validation that agree with the old-model image rollout.

- [ ] **Step 1: Search for removed runtime/payload tooling across active docs and code**

Run:

```powershell
rg -n "ghcr.io/s2script/s2script-runtime-image|SOURCE2_UPDATE_ON_START|SOURCE2_RUN_WATCHER|payload-out|/payload|payload.next|DEPLOY_PAYLOAD_IMAGE|download-plugin-bundle|development-manifest|artifacts:local|manifest:dev" C:\Users\reece\VSCodeProjects\edgegamers-s2s C:\Users\reece\VSCodeProjects\base-s2s C:\Users\reece\VSCodeProjects\empty-s2s C:\Users\reece\VSCodeProjects\ttt-s2s
```

Expected: hits only in historical spec/plan files under `docs/superpowers/`. No active workflow, Dockerfile, compose, README, setup, or validation file may contain these terms.

- [ ] **Step 2: Rewrite stale active docs**

Update active docs so they describe:

- `edgegamers-s2s` builds packages/bundles and triggers affected dev server pipelines;
- server repositories build runnable images;
- `base-s2s` is game-agnostic;
- `empty-s2s` is the CS2 base image;
- child servers inherit from `empty-s2s:main`;
- dev deploys restart immediately;
- prod deploys update image/compose selection and wait for the 10:00 host restart;
- existing `cs2-data` shared install remains for this pass.

Do not edit old superseded plan/spec files except the status doc.

- [ ] **Step 3: Run all lightweight tests**

Run:

```powershell
cd C:\Users\reece\VSCodeProjects\edgegamers-s2s
npm.cmd test
```

Run:

```powershell
cd C:\Users\reece\VSCodeProjects\base-s2s
& 'C:\Program Files\Git\bin\bash.exe' -lc 'bash scripts/validate.sh'
```

Run:

```powershell
cd C:\Users\reece\VSCodeProjects\empty-s2s
& 'C:\Program Files\Git\bin\bash.exe' -lc 'bash scripts/validate.sh'
```

Run:

```powershell
cd C:\Users\reece\VSCodeProjects\ttt-s2s
& 'C:\Program Files\Git\bin\bash.exe' -lc 'bash scripts/validate.sh'
```

Expected: all pass.

- [ ] **Step 4: Run Docker builds if Docker is available**

Run:

```powershell
cd C:\Users\reece\VSCodeProjects\base-s2s
docker build --pull --progress plain -t registry.edgegamers.io/source2/base-s2s:local .
```

Run:

```powershell
cd C:\Users\reece\VSCodeProjects\empty-s2s
docker build --pull --progress plain -t registry.edgegamers.io/source2/cs2/servers/empty-s2s:local .
```

Run:

```powershell
cd C:\Users\reece\VSCodeProjects\ttt-s2s
docker build --pull --progress plain --build-arg EMPTY_S2S_IMAGE=registry.edgegamers.io/source2/cs2/servers/empty-s2s:local -t registry.edgegamers.io/source2/cs2/servers/ttt-s2s:local .
```

Expected: all pass if Docker is available. If Docker is unavailable, record the daemon error and state that GitLab CI must validate image builds.

- [ ] **Step 5: Record verification**

In `C:\Users\reece\VSCodeProjects\edgegamers-s2s\docs\implementation-status.md`, add a dated section:

```markdown
## Old-model server image rollback

- `edgegamers-s2s` keeps Source2Script package/bundle builds and GitLab trigger-token fanout for affected development servers.
- `base-s2s` is game-agnostic and no longer packages a payload addon tree.
- `empty-s2s` is the runnable CS2 base image and keeps the existing `cs2-data` shared install.
- `ttt-s2s` is a runnable child image based on `empty-s2s:main`.
- Server compose files no longer use `ghcr.io/s2script/s2script-runtime-image`.
- Development SSH deploys pull the rebuilt image and restart containers.
- Production deploys update compose/image selection without forcing live restarts; the host 10:00 restart applies the image.

Validation:

- `edgegamers-s2s`: `npm.cmd test` exited 0.
- `base-s2s`: Git Bash `bash scripts/validate.sh` exited 0.
- `empty-s2s`: Git Bash `bash scripts/validate.sh` exited 0.
- `ttt-s2s`: Git Bash `bash scripts/validate.sh` exited 0.
- Docker builds: local Docker daemon unavailable; GitLab CI must validate image builds.
```

If a Docker daemon is available and all Docker builds pass, replace the Docker
builds bullet with the exact image build commands and `exited 0`.

- [ ] **Step 6: Final grep**

Run:

```powershell
rg -n "ghcr.io/s2script/s2script-runtime-image|SOURCE2_UPDATE_ON_START|SOURCE2_RUN_WATCHER|payload-out|/payload|payload.next|DEPLOY_PAYLOAD_IMAGE|download-plugin-bundle|development-manifest|artifacts:local|manifest:dev" C:\Users\reece\VSCodeProjects\edgegamers-s2s C:\Users\reece\VSCodeProjects\base-s2s C:\Users\reece\VSCodeProjects\empty-s2s C:\Users\reece\VSCodeProjects\ttt-s2s
```

Expected: no active code/workflow/doc hits outside historical `docs/superpowers/` references and the newly recorded "no longer use" status sentence.

- [ ] **Step 7: Commit docs/status**

Run:

```powershell
cd C:\Users\reece\VSCodeProjects\edgegamers-s2s
git add docs package.json .github scripts
git commit -m "docs: record old-model image rollback"
```

If docs changed in server repos during this sweep, commit them in their own repo:

```powershell
cd C:\Users\reece\VSCodeProjects\base-s2s
git add README.md docs/system-design.md
git commit -m "docs: describe game agnostic base"
```

```powershell
cd C:\Users\reece\VSCodeProjects\empty-s2s
git add README.md docs/system-design.md
git commit -m "docs: describe empty cs2 image"
```

```powershell
cd C:\Users\reece\VSCodeProjects\ttt-s2s
git add README.md docs/system-design.md DEPLOYMENT_SETUP.md
git commit -m "docs: describe ttt image deploy"
```

---

## Review Checkpoints

- After Task 1: review that `edgegamers-s2s` still triggers dev server pipelines and no longer owns any host deployment mechanics.
- After Task 2: review that `base-s2s` has no CS2-specific paths, no payload tree, and still gives server images the helper tools they need.
- After Task 4: review `empty-s2s` as the new CS2 base image before converting child servers.
- After Task 6: review dev/prod deploy behavior carefully; dev must restart, prod must not force restart.
- After Task 7: run final grep and validation before reporting completion.
