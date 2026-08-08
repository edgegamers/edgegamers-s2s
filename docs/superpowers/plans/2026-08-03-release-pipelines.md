# EdgeGamers Source2Script Release Pipelines Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build production registry releases, direct development plugin deploys, and new Source2Script server images for EdgeGamers.

**Architecture:** `edgegamers-s2s` owns plugin validation, Changeset gates, registry deploy, and direct dev `.s2sp` reconciliation over SSH. `base-s2s` owns game-agnostic Source 2 and Source2Script image helpers. `ttt-s2s` owns CS2, TTT startup, compose files, registry plugin installation, and config/addon overlays.

**Tech Stack:** Node.js 24, npm 11, Source2Script CLI, GitHub Actions, GitLab CI, Docker, Bash, SSH/rsync, Vitest.

## Global Constraints

- Do not edit `C:\Users\reece\VSCodeProjects\base` or `C:\Users\reece\VSCodeProjects\ttt`.
- Keep `base-s2s` game-agnostic; do not bake CS2, TTT, CounterStrikeSharp, MAUL, map lists, or server-specific configuration into it.
- `edgegamers-s2s` production releases publish with `s2s deploy --ci` and `S2SCRIPT_TOKEN`.
- `edgegamers-s2s` development releases never publish to the Source2Script registry.
- Development `.s2sp` files deploy to `addons/s2script/plugins/` over SSH and reconcile only files from the previous EdgeGamers-managed manifest.
- Leave unmanaged manual or third-party plugin files untouched.
- Running server restart and full rebuild at 10:00 UTC remains box-owned, not CI-owned.
- Keep compose and `.env` files usable by hand on the server box.
- Do not store SSH keys, registry tokens, Steam tokens, or database credentials in images or committed files.
- Use `joedwards32/cs2:latest` as the first CS2 image candidate; Docker Hub currently documents that image as CS2 dedicated server plus SteamCMD with persistent data at `/home/steam/cs2-dedicated/`.

---

## File Structure

### `edgegamers-s2s`

- Modify `scripts/lib/development-manifest.mjs`: add managed manifest schema fields and file-name uniqueness validation.
- Modify `scripts/test/development-manifest.test.mjs`: cover managed schema and duplicate file names.
- Modify `scripts/create-dev-manifest.mjs`: write updated schema without changing command surface.
- Create `scripts/lib/development-reconcile.mjs`: pure reconciliation planning and shell path validation.
- Create `scripts/test/development-reconcile.test.mjs`: prove stale managed deletes and unmanaged preservation.
- Create `scripts/deploy-development-artifacts.mjs`: SSH/rsync deployment entrypoint.
- Modify `package.json`: add `deploy:dev` script.
- Modify `.github/workflows/deploy-dev.yml`: run the SSH deployment in the `development` environment.
- Modify `.github/workflows/release.yml`: remove obsolete server-release stub and keep registry-only production.
- Modify `scripts/test/github-workflows.test.mjs`: assert new dev SSH workflow and production registry behavior.
- Modify `.github/MANUAL_SETUP.md`, `docs/local-development.md`, `docs/releases.md`, `docs/implementation-status.md`: document secrets, dev deploy, and production boundary.

### `base-s2s`

- Replace `README.md`: describe image purpose, commands, and constraints.
- Create `.dockerignore`: keep builds small.
- Create `.gitlab-ci.yml`: build and push branch-tagged images.
- Create `Dockerfile`: install OS deps, Node/npm, Source2Script CLI, helper scripts.
- Create `scripts/install-metamod-source2.sh`: install latest Linux Metamod into a passed game directory.
- Create `scripts/install-s2script-runtime.sh`: overlay a provided Source2Script runtime zip into a passed game directory.
- Create `scripts/patch-gameinfo-metamod.sh`: patch a passed `gameinfo.gi`.
- Create `scripts/ensure-s2script-dirs.sh`: create writable Source2Script dirs under a passed game directory.
- Create `scripts/validate.sh`: shell syntax and static file checks for CI.

### `ttt-s2s`

- Replace `README.md`: describe CS2 TTT image, dev/prod compose usage, and env vars.
- Create `.dockerignore`: exclude local junk and secrets.
- Create `.gitlab-ci.yml`: validate, build, and push branch-tagged images.
- Create `Dockerfile`: start from `joedwards32/cs2:latest`, copy base helpers from `base-s2s`, install Source2Script plugins from a package list, and add entrypoint overlays.
- Create `docker-entrypoint.sh`: preserve old TTT startup behavior against `/home/steam/cs2-dedicated`.
- Create `install-s2script-plugins.sh`: run `s2s install` for configured registry packages.
- Create `s2script-plugins.txt`: committed package list, initially empty because current real publishable TTT plugin names are not yet present in `edgegamers-s2s`.
- Create `compose-dev.yml` and `compose-prod.yml`: templates based on old TTT compose with S2Script paths.
- Copy read-only reference content from `C:\Users\reece\VSCodeProjects\ttt\cfg` to `C:\Users\reece\VSCodeProjects\ttt-s2s\cfg`.
- Copy selected read-only reference content from `C:\Users\reece\VSCodeProjects\ttt\addons` to `C:\Users\reece\VSCodeProjects\ttt-s2s\addons`.
- Create `scripts/validate.sh`: shell syntax and static file checks for CI.

---

### Task 1: Managed Development Manifest

**Files:**
- Modify: `C:\Users\reece\VSCodeProjects\edgegamers-s2s\scripts\lib\development-manifest.mjs`
- Modify: `C:\Users\reece\VSCodeProjects\edgegamers-s2s\scripts\test\development-manifest.test.mjs`
- Modify: `C:\Users\reece\VSCodeProjects\edgegamers-s2s\scripts\create-dev-manifest.mjs`

**Interfaces:**
- Consumes: existing `createDevelopmentManifest({ artifacts, commit, generatedAt })`.
- Produces: manifest object with `schemaVersion: 1`, `managedBy: "edgegamers-s2s"`, `environment: "development"`, `commit`, `generatedAt`, and `plugins`.

- [ ] **Step 1: Write failing manifest schema tests**

Add to `scripts/test/development-manifest.test.mjs`:

```js
it("marks the manifest as EdgeGamers managed", () => {
  const manifest = createDevelopmentManifest({
    artifacts: [
      { path: "plugins/api/dist/api.s2sp", bytes: Buffer.from("api") },
    ],
    commit: "abcdef1234567890",
    generatedAt: "2026-08-03T12:00:00.000Z",
  });

  expect(manifest.schemaVersion).toBe(1);
  expect(manifest.managedBy).toBe("edgegamers-s2s");
  expect(manifest.environment).toBe("development");
});

it("rejects duplicate artifact file names", () => {
  expect(() =>
    createDevelopmentManifest({
      artifacts: [
        { path: "plugins/one/dist/shared.s2sp", bytes: Buffer.from("one") },
        { path: "plugins/two/dist/shared.s2sp", bytes: Buffer.from("two") },
      ],
      commit: "abcdef1234567890",
      generatedAt: "2026-08-03T12:00:00.000Z",
    }),
  ).toThrow("Duplicate artifact file name: shared.s2sp");
});
```

- [ ] **Step 2: Run targeted tests and verify failure**

Run:

```powershell
npm.cmd test -- scripts/test/development-manifest.test.mjs
```

Expected: FAIL because `schemaVersion`, `managedBy`, and duplicate file-name validation do not exist yet.

- [ ] **Step 3: Implement manifest schema**

Update `createDevelopmentManifest` in `scripts/lib/development-manifest.mjs`:

```js
  const seenPaths = new Set();
  const seenFileNames = new Set();
  const plugins = artifacts.map((artifact) => {
    const normalizedPath = artifact.path.replaceAll("\\", "/");
    const fileName = basename(normalizedPath);

    if (seenPaths.has(normalizedPath)) {
      throw new Error(`Duplicate artifact path: ${normalizedPath}`);
    }
    seenPaths.add(normalizedPath);

    if (seenFileNames.has(fileName)) {
      throw new Error(`Duplicate artifact file name: ${fileName}`);
    }
    seenFileNames.add(fileName);

    return {
      artifact: normalizedPath,
      fileName,
      revision: `dev.${commit.slice(0, 7)}`,
      sha256: createHash("sha256").update(artifact.bytes).digest("hex"),
    };
  });
```

Return:

```js
  return {
    schemaVersion: 1,
    managedBy: "edgegamers-s2s",
    environment: "development",
    commit,
    generatedAt,
    plugins,
  };
```

- [ ] **Step 4: Update exact-object existing test**

In the first existing expected manifest, add:

```js
schemaVersion: 1,
managedBy: "edgegamers-s2s",
```

- [ ] **Step 5: Run targeted tests and verify pass**

Run:

```powershell
npm.cmd test -- scripts/test/development-manifest.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add scripts/lib/development-manifest.mjs scripts/test/development-manifest.test.mjs scripts/create-dev-manifest.mjs
git commit -m "feat: mark dev manifests as managed"
```

---

### Task 2: Development Reconcile Planning

**Files:**
- Create: `C:\Users\reece\VSCodeProjects\edgegamers-s2s\scripts\lib\development-reconcile.mjs`
- Create: `C:\Users\reece\VSCodeProjects\edgegamers-s2s\scripts\test\development-reconcile.test.mjs`

**Interfaces:**
- Consumes: managed manifest objects from Task 1.
- Produces:
  - `validateRemotePluginDirectory(path: string): string`
  - `listManagedFileNames(manifest: object): string[]`
  - `planManagedReconcile({ previousManifest, nextManifest }): { deleteFileNames: string[], copyFileNames: string[] }`
  - `quotePosix(value: string): string`

- [ ] **Step 1: Write failing reconcile tests**

Create `scripts/test/development-reconcile.test.mjs`:

```js
import { describe, expect, it } from "vitest";
import {
  listManagedFileNames,
  planManagedReconcile,
  quotePosix,
  validateRemotePluginDirectory,
} from "../lib/development-reconcile.mjs";

const manifest = (fileNames) => ({
  schemaVersion: 1,
  managedBy: "edgegamers-s2s",
  environment: "development",
  commit: "abcdef1234567890",
  generatedAt: "2026-08-03T12:00:00.000Z",
  plugins: fileNames.map((fileName) => ({
    artifact: `plugins/${fileName}/dist/${fileName}.s2sp`,
    fileName: `${fileName}.s2sp`,
    revision: "dev.abcdef1",
    sha256: "0".repeat(64),
  })),
});

describe("planManagedReconcile", () => {
  it("deletes only stale files from the previous managed manifest", () => {
    expect(
      planManagedReconcile({
        previousManifest: manifest(["old", "keep"]),
        nextManifest: manifest(["keep", "new"]),
      }),
    ).toEqual({
      deleteFileNames: ["old.s2sp"],
      copyFileNames: ["keep.s2sp", "new.s2sp"],
    });
  });

  it("does not delete anything without a previous managed manifest", () => {
    expect(
      planManagedReconcile({
        previousManifest: undefined,
        nextManifest: manifest(["new"]),
      }),
    ).toEqual({
      deleteFileNames: [],
      copyFileNames: ["new.s2sp"],
    });
  });
});

describe("listManagedFileNames", () => {
  it("rejects manifests from another owner", () => {
    expect(() =>
      listManagedFileNames({ ...manifest(["api"]), managedBy: "other" }),
    ).toThrow("Unsupported development manifest owner");
  });
});

describe("validateRemotePluginDirectory", () => {
  it("accepts an absolute plugin directory", () => {
    expect(
      validateRemotePluginDirectory("/srv/cs2/game/csgo/addons/s2script/plugins"),
    ).toBe("/srv/cs2/game/csgo/addons/s2script/plugins");
  });

  it("rejects empty and root-like destinations", () => {
    for (const value of ["", "/", "/srv", "/srv/"]) {
      expect(() => validateRemotePluginDirectory(value)).toThrow(
        "Unsafe remote plugin directory",
      );
    }
  });
});

describe("quotePosix", () => {
  it("quotes single quotes safely", () => {
    expect(quotePosix("/tmp/edge's plugins")).toBe("'/tmp/edge'\"'\"'s plugins'");
  });
});
```

- [ ] **Step 2: Run targeted tests and verify failure**

Run:

```powershell
npm.cmd test -- scripts/test/development-reconcile.test.mjs
```

Expected: FAIL because `development-reconcile.mjs` does not exist.

- [ ] **Step 3: Implement reconcile library**

Create `scripts/lib/development-reconcile.mjs`:

```js
const MANAGED_BY = "edgegamers-s2s";

function ensureManagedManifest(manifest) {
  if (!manifest) return undefined;
  if (manifest.schemaVersion !== 1) {
    throw new Error("Unsupported development manifest schema");
  }
  if (manifest.managedBy !== MANAGED_BY) {
    throw new Error("Unsupported development manifest owner");
  }
  if (!Array.isArray(manifest.plugins)) {
    throw new Error("Development manifest plugins must be an array");
  }
  return manifest;
}

export function listManagedFileNames(manifest) {
  const managedManifest = ensureManagedManifest(manifest);
  if (!managedManifest) return [];

  const fileNames = managedManifest.plugins.map((plugin) => {
    if (typeof plugin.fileName !== "string" || !plugin.fileName.endsWith(".s2sp")) {
      throw new Error("Development manifest plugin fileName must be a .s2sp file");
    }
    if (plugin.fileName.includes("/") || plugin.fileName.includes("\\")) {
      throw new Error(`Unsafe plugin file name: ${plugin.fileName}`);
    }
    return plugin.fileName;
  });

  return [...new Set(fileNames)].sort();
}

export function planManagedReconcile({ previousManifest, nextManifest }) {
  const previous = new Set(listManagedFileNames(previousManifest));
  const next = listManagedFileNames(nextManifest);
  const nextSet = new Set(next);

  return {
    deleteFileNames: [...previous].filter((fileName) => !nextSet.has(fileName)).sort(),
    copyFileNames: next,
  };
}

export function validateRemotePluginDirectory(path) {
  if (typeof path !== "string") {
    throw new Error("Unsafe remote plugin directory");
  }

  const normalized = path.trim().replace(/\/+$/u, "");
  if (
    !normalized.startsWith("/") ||
    normalized === "/" ||
    normalized.split("/").filter(Boolean).length < 3
  ) {
    throw new Error(`Unsafe remote plugin directory: ${path}`);
  }

  return normalized;
}

export function quotePosix(value) {
  return `'${String(value).replaceAll("'", `'"'"'`)}'`;
}
```

- [ ] **Step 4: Run targeted tests and verify pass**

Run:

```powershell
npm.cmd test -- scripts/test/development-reconcile.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add scripts/lib/development-reconcile.mjs scripts/test/development-reconcile.test.mjs
git commit -m "feat: plan managed dev plugin reconcile"
```

---

### Task 3: Development SSH Deploy Script

**Files:**
- Create: `C:\Users\reece\VSCodeProjects\edgegamers-s2s\scripts\deploy-development-artifacts.mjs`
- Modify: `C:\Users\reece\VSCodeProjects\edgegamers-s2s\package.json`
- Create: `C:\Users\reece\VSCodeProjects\edgegamers-s2s\scripts\test\deploy-development-artifacts.test.mjs`

**Interfaces:**
- Consumes from Task 2: `validateRemotePluginDirectory`, `quotePosix`.
- Produces: CLI command `npm run deploy:dev`.

- [ ] **Step 1: Write failing command construction tests**

Create `scripts/test/deploy-development-artifacts.test.mjs`:

```js
import { describe, expect, it } from "vitest";
import {
  buildDeployPlan,
  remoteManifestPath,
} from "../deploy-development-artifacts.mjs";

describe("remoteManifestPath", () => {
  it("stores the managed manifest beside live plugins", () => {
    expect(remoteManifestPath("/srv/cs2/game/csgo/addons/s2script/plugins")).toBe(
      "/srv/cs2/game/csgo/addons/s2script/plugins/.edgegamers-development-manifest.json",
    );
  });
});

describe("buildDeployPlan", () => {
  it("builds rsync and ssh commands from explicit inputs", () => {
    const plan = buildDeployPlan({
      host: "example.test",
      port: "2222",
      user: "deploy",
      keyPath: "/tmp/key",
      localArtifactDirectory: "artifacts/local-development",
      remotePluginDirectory: "/srv/cs2/game/csgo/addons/s2script/plugins",
      runId: "123",
    });

    expect(plan.remoteStagingDirectory).toBe(
      "/tmp/edgegamers-s2s-development/123",
    );
    expect(plan.rsyncArgs).toContain("--delete");
    expect(plan.rsyncArgs).toContain("artifacts/local-development/");
    expect(plan.sshDestination).toBe("deploy@example.test");
  });
});
```

- [ ] **Step 2: Run targeted tests and verify failure**

Run:

```powershell
npm.cmd test -- scripts/test/deploy-development-artifacts.test.mjs
```

Expected: FAIL because deployment script does not exist.

- [ ] **Step 3: Implement deploy script exports**

Create `scripts/deploy-development-artifacts.mjs` with these exports and CLI:

```js
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { quotePosix, validateRemotePluginDirectory } from "./lib/development-reconcile.mjs";

const MANIFEST_FILE = ".edgegamers-development-manifest.json";

export function remoteManifestPath(remotePluginDirectory) {
  return `${validateRemotePluginDirectory(remotePluginDirectory)}/${MANIFEST_FILE}`;
}

export function buildDeployPlan({
  host,
  port,
  user,
  keyPath,
  localArtifactDirectory,
  remotePluginDirectory,
  runId,
}) {
  for (const [name, value] of Object.entries({ host, port, user, keyPath, localArtifactDirectory, runId })) {
    if (!value) throw new Error(`${name} is required`);
  }

  const safeRemotePluginDirectory = validateRemotePluginDirectory(remotePluginDirectory);
  const sshDestination = `${user}@${host}`;
  const sshBaseArgs = ["-i", keyPath, "-p", String(port), "-o", "StrictHostKeyChecking=accept-new"];
  const remoteStagingDirectory = `/tmp/edgegamers-s2s-development/${runId}`;

  return {
    sshDestination,
    remoteStagingDirectory,
    remotePluginDirectory: safeRemotePluginDirectory,
    sshBaseArgs,
    rsyncArgs: [
      "-az",
      "--delete",
      "-e",
      `ssh -i ${keyPath} -p ${port} -o StrictHostKeyChecking=accept-new`,
      `${localArtifactDirectory.replaceAll("\\", "/")}/`,
      `${sshDestination}:${remoteStagingDirectory}/`,
    ],
  };
}

export function buildRemoteScript({ remoteStagingDirectory, remotePluginDirectory }) {
  const staging = quotePosix(remoteStagingDirectory);
  const pluginDir = quotePosix(remotePluginDirectory);
  const manifest = quotePosix(remoteManifestPath(remotePluginDirectory));

  return `set -euo pipefail
staging=${staging}
plugin_dir=${pluginDir}
manifest_path=${manifest}
test -d "$staging"
test -f "$staging/development-manifest.json"
mkdir -p "$plugin_dir"
cd "$staging"
node - <<'NODE'
const { createHash } = require("node:crypto");
const { readFileSync } = require("node:fs");
const manifest = JSON.parse(readFileSync("development-manifest.json", "utf8"));
if (manifest.schemaVersion !== 1 || manifest.managedBy !== "edgegamers-s2s") throw new Error("unsupported manifest");
for (const plugin of manifest.plugins) {
  const digest = createHash("sha256").update(readFileSync(plugin.fileName)).digest("hex");
  if (digest !== plugin.sha256) throw new Error("digest mismatch for " + plugin.fileName);
}
NODE
previous="$(mktemp)"
if [ -f "$manifest_path" ]; then cp "$manifest_path" "$previous"; else printf '{"schemaVersion":1,"managedBy":"edgegamers-s2s","plugins":[]}' > "$previous"; fi
node - "$previous" "$staging/development-manifest.json" "$plugin_dir" <<'NODE'
const { readFileSync, rmSync } = require("node:fs");
const { join } = require("node:path");
const [previousPath, nextPath, pluginDir] = process.argv.slice(2);
const previous = JSON.parse(readFileSync(previousPath, "utf8"));
const next = JSON.parse(readFileSync(nextPath, "utf8"));
const names = (manifest) => manifest.plugins.map((plugin) => plugin.fileName).sort();
const nextNames = new Set(names(next));
for (const fileName of names(previous)) {
  if (!nextNames.has(fileName)) rmSync(join(pluginDir, fileName), { force: true });
}
NODE
find "$staging" -maxdepth 1 -type f -name '*.s2sp' -exec cp -f {} "$plugin_dir/" \\;
cp -f "$staging/development-manifest.json" "$manifest_path"
rm -f "$previous"
`;
}

export function main({
  env = process.env,
  execFile = execFileSync,
  artifactDirectory = join(process.cwd(), "artifacts", "local-development"),
} = {}) {
  const manifestPath = join(artifactDirectory, "development-manifest.json");
  if (!existsSync(manifestPath)) {
    throw new Error(`Missing ${manifestPath}. Run npm run artifacts:local first.`);
  }

  const keyPath = env.DEV_SSH_KEY_PATH;
  const plan = buildDeployPlan({
    host: env.DEV_SSH_HOST,
    port: env.DEV_SSH_PORT || "22",
    user: env.DEV_SSH_USER,
    keyPath,
    localArtifactDirectory: artifactDirectory,
    remotePluginDirectory: env.DEV_S2SCRIPT_PLUGIN_DIR,
    runId: env.GITHUB_RUN_ID || String(Date.now()),
  });

  execFile("ssh", [...plan.sshBaseArgs, plan.sshDestination, "mkdir", "-p", plan.remoteStagingDirectory], { stdio: "inherit" });
  execFile("rsync", plan.rsyncArgs, { stdio: "inherit" });
  execFile("ssh", [...plan.sshBaseArgs, plan.sshDestination, buildRemoteScript(plan)], { stdio: "inherit" });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
```

- [ ] **Step 4: Add npm script**

In `package.json` scripts, add:

```json
"deploy:dev": "node scripts/deploy-development-artifacts.mjs"
```

- [ ] **Step 5: Run targeted tests and verify pass**

Run:

```powershell
npm.cmd test -- scripts/test/deploy-development-artifacts.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Run full tests**

Run:

```powershell
npm.cmd test
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add package.json scripts/deploy-development-artifacts.mjs scripts/test/deploy-development-artifacts.test.mjs
git commit -m "feat: deploy dev plugins over ssh"
```

---

### Task 4: GitHub Workflow Wiring

**Files:**
- Modify: `C:\Users\reece\VSCodeProjects\edgegamers-s2s\.github\workflows\deploy-dev.yml`
- Modify: `C:\Users\reece\VSCodeProjects\edgegamers-s2s\.github\workflows\release.yml`
- Modify: `C:\Users\reece\VSCodeProjects\edgegamers-s2s\scripts\test\github-workflows.test.mjs`

**Interfaces:**
- Consumes: `npm run artifacts:local`, `npm run deploy:dev`, `S2SCRIPT_TOKEN`, development SSH secrets.
- Produces: GitHub Actions dev deploy and production registry deploy.

- [ ] **Step 1: Update workflow tests first**

In `scripts/test/github-workflows.test.mjs`, replace the dev-deploy negative assertions:

```js
expect(deployDev).not.toContain("DEV_SSH_PRIVATE_KEY");
expect(deployDev).not.toContain("DEV_RECONCILE_COMMAND");
```

with:

```js
for (const required of [
  "environment: development",
  "DEV_SSH_HOST: ${{ secrets.DEV_SSH_HOST }}",
  "DEV_SSH_PORT: ${{ secrets.DEV_SSH_PORT }}",
  "DEV_SSH_USER: ${{ secrets.DEV_SSH_USER }}",
  "DEV_SSH_KEY: ${{ secrets.DEV_SSH_KEY }}",
  "DEV_S2SCRIPT_PLUGIN_DIR: ${{ secrets.DEV_S2SCRIPT_PLUGIN_DIR }}",
  "npm run deploy:dev",
]) {
  expect(deployDev).toContain(required);
}
```

Replace the release stub assertion:

```js
"Server release is intentionally skipped",
```

with:

```js
"npm run deploy -- --ci",
"S2SCRIPT_TOKEN: ${{ secrets.S2SCRIPT_TOKEN }}",
```

and remove the expectation that `production-manifest.json` is absent if that assertion no longer matches the workflow scope.

- [ ] **Step 2: Run workflow tests and verify failure**

Run:

```powershell
npm.cmd test -- scripts/test/github-workflows.test.mjs
```

Expected: FAIL because workflow YAML is not wired yet.

- [ ] **Step 3: Wire development workflow**

In `.github/workflows/deploy-dev.yml`, add `environment: development` to `build-artifacts`.

Replace the final skip step with:

```yaml
      - name: Write development SSH key
        env:
          DEV_SSH_KEY: ${{ secrets.DEV_SSH_KEY }}
        run: |
          install -m 700 -d ~/.ssh
          printf '%s\n' "$DEV_SSH_KEY" > ~/.ssh/edgegamers-development
          chmod 600 ~/.ssh/edgegamers-development

      - name: Deploy development plugins
        env:
          DEV_SSH_HOST: ${{ secrets.DEV_SSH_HOST }}
          DEV_SSH_PORT: ${{ secrets.DEV_SSH_PORT }}
          DEV_SSH_USER: ${{ secrets.DEV_SSH_USER }}
          DEV_SSH_KEY_PATH: ~/.ssh/edgegamers-development
          DEV_S2SCRIPT_PLUGIN_DIR: ${{ secrets.DEV_S2SCRIPT_PLUGIN_DIR }}
        run: npm run deploy:dev
```

- [ ] **Step 4: Tighten release workflow**

In `.github/workflows/release.yml`, remove:

```yaml
      - name: Skip server release
        run: echo "Server release is intentionally skipped until Source2Script and EdgeGamers release tooling are ready."
```

Keep:

```yaml
environment: production
env:
  S2SCRIPT_TOKEN: ${{ secrets.S2SCRIPT_TOKEN }}
```

Keep deploy step:

```yaml
      - name: Deploy Source2Script packages
        if: steps.detect.outputs.has-changesets == 'true'
        run: npm run deploy -- --ci
```

- [ ] **Step 5: Run workflow tests and verify pass**

Run:

```powershell
npm.cmd test -- scripts/test/github-workflows.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add .github/workflows/deploy-dev.yml .github/workflows/release.yml scripts/test/github-workflows.test.mjs
git commit -m "ci: deploy dev plugin artifacts"
```

---

### Task 5: EdgeGamers Release Documentation

**Files:**
- Modify: `C:\Users\reece\VSCodeProjects\edgegamers-s2s\.github\MANUAL_SETUP.md`
- Modify: `C:\Users\reece\VSCodeProjects\edgegamers-s2s\docs\local-development.md`
- Modify: `C:\Users\reece\VSCodeProjects\edgegamers-s2s\docs\releases.md`
- Modify: `C:\Users\reece\VSCodeProjects\edgegamers-s2s\docs\implementation-status.md`

**Interfaces:**
- Consumes: completed workflow names and secret names.
- Produces: maintainer docs for setup and operations.

- [ ] **Step 1: Update manual GitHub setup**

In `.github/MANUAL_SETUP.md`, replace development release stubs with exact secrets:

```md
Create `development`.

1. Limit deployment branches to `dev`.
2. Add `DEV_SSH_HOST`.
3. Add `DEV_SSH_PORT`.
4. Add `DEV_SSH_USER`.
5. Add `DEV_SSH_KEY`.
6. Add `DEV_S2SCRIPT_PLUGIN_DIR`.
7. Scope the SSH user to the remote staging path and Source2Script plugin directory.
```

In production setup, keep:

```md
4. Add `S2SCRIPT_TOKEN`.
5. Do not add production server SSH credentials. Production plugin delivery stops at the Source2Script registry.
```

- [ ] **Step 2: Update releases docs**

In `docs/releases.md`, replace the deferred development transport paragraph with:

```md
Development deployment builds `.s2sp` files, writes `artifacts/development-manifest.json`, uploads a GitHub Actions artifact, and reconciles the managed files on the development server over SSH. The remote manifest `.edgegamers-development-manifest.json` is the ownership boundary: automation deletes only stale files listed by the previous managed manifest and leaves unmanaged files alone.
```

Keep production:

```md
Production publication stops at the Source2Script registry. Server images consume registry versions with `s2s install`; GitHub Actions does not copy production `.s2sp` files to servers.
```

- [ ] **Step 3: Update local development docs**

In `docs/local-development.md`, add:

```md
`npm.cmd run artifacts:local` still supports manual local server copies. The CI development path uses the same files, then runs `npm run deploy:dev` with GitHub environment secrets. Do not run `deploy:dev` locally unless `DEV_SSH_*` variables point at a development server account.
```

- [ ] **Step 4: Update implementation status**

Change Phase 8 from stubbed to implemented locally, with:

```md
- Development artifacts deploy over SSH to the configured development server plugin directory.
- Reconciliation is manifest-scoped and leaves unmanaged files untouched.
- Production releases publish to the Source2Script registry only.
- Server images live in `base-s2s` and `ttt-s2s`.
```

- [ ] **Step 5: Run docs checks**

Run:

```powershell
rg -n "deferred|stubbed|intentionally skipped|DEV_RECONCILE_COMMAND|PROD_SSH" docs .github
git diff --check
```

Expected: no obsolete deployment-stub wording in edited docs, and `git diff --check` exits 0.

- [ ] **Step 6: Commit**

```powershell
git add .github/MANUAL_SETUP.md docs/local-development.md docs/releases.md docs/implementation-status.md
git commit -m "docs: document release pipeline setup"
```

---

### Task 6: `base-s2s` Image Foundation

**Files:**
- Replace: `C:\Users\reece\VSCodeProjects\base-s2s\README.md`
- Create: `C:\Users\reece\VSCodeProjects\base-s2s\.dockerignore`
- Create: `C:\Users\reece\VSCodeProjects\base-s2s\.gitlab-ci.yml`
- Create: `C:\Users\reece\VSCodeProjects\base-s2s\Dockerfile`
- Create: `C:\Users\reece\VSCodeProjects\base-s2s\scripts\install-metamod-source2.sh`
- Create: `C:\Users\reece\VSCodeProjects\base-s2s\scripts\install-s2script-runtime.sh`
- Create: `C:\Users\reece\VSCodeProjects\base-s2s\scripts\patch-gameinfo-metamod.sh`
- Create: `C:\Users\reece\VSCodeProjects\base-s2s\scripts\ensure-s2script-dirs.sh`
- Create: `C:\Users\reece\VSCodeProjects\base-s2s\scripts\validate.sh`

**Interfaces:**
- Produces Docker image `registry.edgegamers.io/source2/base-s2s:$CI_COMMIT_REF_SLUG`.
- Produces helper commands:
  - `install-metamod-source2 /path/to/game-subdir`
  - `install-s2script-runtime /path/to/runtime.zip /path/to/game-subdir`
  - `patch-gameinfo-metamod /path/to/gameinfo.gi`
  - `ensure-s2script-dirs /path/to/game-subdir`

- [ ] **Step 1: Create shell validation first**

Create `scripts/validate.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

for file in scripts/*.sh; do
  bash -n "$file"
done

grep -q "source2/base-s2s" .gitlab-ci.yml
grep -q "install-metamod-source2" Dockerfile
grep -q "patch-gameinfo-metamod" Dockerfile

if grep -R "counterstrikesharp\|MAUL\|TTT\|cs2-ttt" Dockerfile scripts README.md; then
  echo "base-s2s must stay game-agnostic" >&2
  exit 1
fi
```

- [ ] **Step 2: Run validation and verify failure**

Run:

```powershell
bash scripts/validate.sh
```

Expected: FAIL because Dockerfile and scripts do not exist yet.

- [ ] **Step 3: Add helper scripts**

Create `scripts/patch-gameinfo-metamod.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

GAMEINFO="${1:?usage: patch-gameinfo-metamod /path/to/gameinfo.gi}"

if [ ! -f "$GAMEINFO" ]; then
  echo "gameinfo.gi not found: $GAMEINFO" >&2
  exit 1
fi

if ! grep -Fq "Game    csgo/addons/metamod" "$GAMEINFO"; then
  sed -i '/SearchPaths/a\
			Game    csgo/addons/metamod
' "$GAMEINFO"
fi

grep -Fq "Game    csgo/addons/metamod" "$GAMEINFO"
```

Create `scripts/ensure-s2script-dirs.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

GAME_DIR="${1:?usage: ensure-s2script-dirs /path/to/game-dir}"
mkdir -p \
  "$GAME_DIR/addons/s2script/configs" \
  "$GAME_DIR/addons/s2script/data" \
  "$GAME_DIR/addons/s2script/plugins"
chmod -R u+rwX,g+rwX "$GAME_DIR/addons/s2script"
```

Create `scripts/install-metamod-source2.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

GAME_DIR="${1:?usage: install-metamod-source2 /path/to/game-dir}"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

url="$(
  curl -fsSL https://api.github.com/repos/alliedmodders/metamod-source/releases |
    jq -er 'map(select(.prerelease == true)) | .[0].assets[] | select(.name | test("^mmsource-.*-linux\\.tar\\.gz$")) | .browser_download_url' |
    head -n1
)"

curl -fsSL "$url" | tar zxf - -C "$tmp"
mkdir -p "$GAME_DIR"
cp -a "$tmp"/addons "$GAME_DIR"/
```

Create `scripts/install-s2script-runtime.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

RUNTIME_ZIP="${1:?usage: install-s2script-runtime runtime.zip /path/to/game-dir}"
GAME_DIR="${2:?usage: install-s2script-runtime runtime.zip /path/to/game-dir}"

test -f "$RUNTIME_ZIP"
mkdir -p "$GAME_DIR"
unzip -oq "$RUNTIME_ZIP" -d "$GAME_DIR"
ensure-s2script-dirs "$GAME_DIR"
```

- [ ] **Step 4: Add Dockerfile**

Create `Dockerfile`:

```dockerfile
# syntax=docker/dockerfile:1.7
FROM debian:bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
    && apt-get install --no-install-recommends -y \
      ca-certificates \
      curl \
      jq \
      nodejs \
      npm \
      unzip \
      tar \
    && npm install -g @s2script/sdk \
    && rm -rf /var/lib/apt/lists/*

COPY scripts/install-metamod-source2.sh /usr/local/bin/install-metamod-source2
COPY scripts/install-s2script-runtime.sh /usr/local/bin/install-s2script-runtime
COPY scripts/patch-gameinfo-metamod.sh /usr/local/bin/patch-gameinfo-metamod
COPY scripts/ensure-s2script-dirs.sh /usr/local/bin/ensure-s2script-dirs

RUN chmod +x \
      /usr/local/bin/install-metamod-source2 \
      /usr/local/bin/install-s2script-runtime \
      /usr/local/bin/patch-gameinfo-metamod \
      /usr/local/bin/ensure-s2script-dirs
```

- [ ] **Step 5: Add GitLab CI**

Create `.gitlab-ci.yml`:

```yaml
variables:
  DOCKER_BUILDKIT: "1"
  CONTAINER_IMAGE: "$CI_REGISTRY_IMAGE:$CI_COMMIT_REF_SLUG"

services:
  - docker:24.0.7-dind

stages:
  - validate
  - build

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
  before_script:
    - echo "$CI_JOB_TOKEN" | docker login -u gitlab-ci-token --password-stdin "$CI_REGISTRY"
  script:
    - docker build --pull --progress plain -t "$CONTAINER_IMAGE" .
    - docker push "$CONTAINER_IMAGE"
  rules:
    - if: '$CI_COMMIT_BRANCH'
  tags:
    - docker
```

- [ ] **Step 6: Add `.dockerignore` and README**

Create `.dockerignore`:

```gitignore
.git
.codex
*.log
```

Replace `README.md`:

```md
# base-s2s

Game-agnostic Source 2 and Source2Script base image for EdgeGamers server images.

This image provides helper commands for Metamod and Source2Script runtime setup.
Downstream game images provide the actual game directory and call the helpers
against that directory.

## Build

```bash
docker build -t registry.edgegamers.io/source2/base-s2s:dev .
```

## Helpers

- `install-metamod-source2 /path/to/game-dir`
- `install-s2script-runtime /path/to/runtime.zip /path/to/game-dir`
- `patch-gameinfo-metamod /path/to/gameinfo.gi`
- `ensure-s2script-dirs /path/to/game-dir`

Do not add CS2, TTT, CounterStrikeSharp, MAUL, map lists, or server-specific
configuration here. Put game behavior in downstream image repositories.
```

- [ ] **Step 7: Run validation**

Run:

```powershell
bash scripts/validate.sh
```

Expected: PASS.

- [ ] **Step 8: Build image when Docker is available**

Run:

```powershell
docker build --pull --progress plain -t base-s2s:local .
```

Expected: PASS. If Docker is unavailable in the current environment, record that and rely on `bash scripts/validate.sh` plus GitLab CI for image build validation.

- [ ] **Step 9: Commit**

```powershell
git add .dockerignore .gitlab-ci.yml Dockerfile README.md scripts
git commit -m "feat: add source2script base image"
```

---

### Task 7: `ttt-s2s` Reference Overlays And Validation

**Files:**
- Create directory tree under `C:\Users\reece\VSCodeProjects\ttt-s2s\cfg`
- Create directory tree under `C:\Users\reece\VSCodeProjects\ttt-s2s\addons`
- Create: `C:\Users\reece\VSCodeProjects\ttt-s2s\scripts\validate.sh`
- Create: `C:\Users\reece\VSCodeProjects\ttt-s2s\.dockerignore`

**Interfaces:**
- Consumes read-only files from `C:\Users\reece\VSCodeProjects\ttt\cfg` and `C:\Users\reece\VSCodeProjects\ttt\addons`.
- Produces committed TTT override files for the new image.

- [ ] **Step 1: Copy reference overrides**

Run from `C:\Users\reece\VSCodeProjects\ttt-s2s`:

```powershell
Copy-Item -Recurse -Force C:\Users\reece\VSCodeProjects\ttt\cfg .\cfg
Copy-Item -Recurse -Force C:\Users\reece\VSCodeProjects\ttt\addons .\addons
```

This reads from the old repo but does not edit it.

- [ ] **Step 2: Create validation script**

Create `scripts/validate.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

for file in *.sh scripts/*.sh; do
  [ -e "$file" ] || continue
  bash -n "$file"
done

test -f cfg/server.cfg
test -f cfg/startmaplist.txt
test -d addons

grep -q "addons/s2script/plugins" compose-dev.yml
grep -q "addons/s2script/plugins" compose-prod.yml
grep -q "s2s install" install-s2script-plugins.sh
grep -q "patch-gameinfo-metamod" docker-entrypoint.sh
```

- [ ] **Step 3: Create `.dockerignore`**

Create `.dockerignore`:

```gitignore
.git
.codex
*.log
.env
```

- [ ] **Step 4: Run validation and verify failure**

Run:

```powershell
bash scripts/validate.sh
```

Expected: FAIL until Task 8 creates compose, install, and entrypoint files.

- [ ] **Step 5: Commit copied overlays and validation**

```powershell
git add .dockerignore cfg addons scripts/validate.sh
git commit -m "feat: add ttt override files"
```

---

### Task 8: `ttt-s2s` Image, Entrypoint, Compose, And CI

**Files:**
- Replace: `C:\Users\reece\VSCodeProjects\ttt-s2s\README.md`
- Create: `C:\Users\reece\VSCodeProjects\ttt-s2s\.gitlab-ci.yml`
- Create: `C:\Users\reece\VSCodeProjects\ttt-s2s\Dockerfile`
- Create: `C:\Users\reece\VSCodeProjects\ttt-s2s\docker-entrypoint.sh`
- Create: `C:\Users\reece\VSCodeProjects\ttt-s2s\install-s2script-plugins.sh`
- Create: `C:\Users\reece\VSCodeProjects\ttt-s2s\s2script-plugins.txt`
- Create: `C:\Users\reece\VSCodeProjects\ttt-s2s\compose-dev.yml`
- Create: `C:\Users\reece\VSCodeProjects\ttt-s2s\compose-prod.yml`

**Interfaces:**
- Consumes `registry.edgegamers.io/source2/base-s2s:$BASE_S2S_TAG`.
- Produces `registry.edgegamers.io/source2/cs2/servers/ttt-s2s:$CI_COMMIT_REF_SLUG`.
- Provides live dev plugin dir: `/home/steam/cs2-dedicated/game/csgo/addons/s2script/plugins`.

- [ ] **Step 1: Create plugin install script**

Create `install-s2script-plugins.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

GAME_DIR="${1:-/home/steam/cs2-dedicated/game/csgo}"
PACKAGE_FILE="${2:-/opt/edgegamers/s2script-plugins.txt}"

ensure-s2script-dirs "$GAME_DIR"

if [ ! -f "$PACKAGE_FILE" ]; then
  exit 0
fi

while IFS= read -r package_name; do
  case "$package_name" in
    ""|\#*) continue ;;
  esac
  s2s install "$package_name" --cwd "$GAME_DIR"
done < "$PACKAGE_FILE"
```

Create `s2script-plugins.txt`:

```text
# One Source2Script registry package per line.
# Current real publishable TTT package names will be added after they exist in edgegamers-s2s.
```

- [ ] **Step 2: Create entrypoint**

Create `docker-entrypoint.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/home/steam/cs2-dedicated"
GAME_DIR="$APP_DIR/game/csgo"
GAMEINFO="$GAME_DIR/gameinfo.gi"

APP_SERVER_NAME="${APP_SERVER_NAME:-EdgeGamers TTT}"
APP_SERVER_IP="${APP_SERVER_IP:-0.0.0.0}"
APP_SERVER_PORT="${APP_SERVER_PORT:-27015}"
APP_SERVER_MAXPLAYERS="${APP_SERVER_MAXPLAYERS:-64}"
APP_SERVER_PASSWORD="${APP_SERVER_PASSWORD:-}"
APP_SERVER_STEAMTOKEN="${APP_SERVER_STEAMTOKEN:-${SRCDS_TOKEN:-}}"
APP_SERVER_START_WORKSHOP_MAP="${APP_SERVER_START_WORKSHOP_MAP:-}"

if [ "${APP_SERVER_MONTHLY_PASSWORD:-false}" = "true" ]; then
  date_string="$(date +'%y.%m')"
  APP_SERVER_PASSWORD="$(printf '%s' "$date_string" | sha256sum | cut -d ' ' -f 1)"
fi

if [ -f "$GAMEINFO" ]; then
  patch-gameinfo-metamod "$GAMEINFO"
fi

ensure-s2script-dirs "$GAME_DIR"
install-s2script-plugins "$GAME_DIR" /opt/edgegamers/s2script-plugins.txt

if [ -d /opt/edgegamers/cfg ]; then
  cp -a /opt/edgegamers/cfg/. "$GAME_DIR/cfg/"
fi

if [ -d /opt/edgegamers/addons ]; then
  cp -a /opt/edgegamers/addons/. "$GAME_DIR/addons/"
fi

find "$GAME_DIR" -type f \( -name '*.cfg' -o -name '*.json' -o -name '*.jsonc' \) -print0 |
  xargs -0r sed -i \
    -e "s/{APP_SERVER_NAME}/${APP_SERVER_NAME//\//\\/}/g" \
    -e "s/{APP_SERVER_PASSWORD}/${APP_SERVER_PASSWORD//\//\\/}/g" \
    -e "s/{APP_SERVER_STEAMTOKEN}/${APP_SERVER_STEAMTOKEN//\//\\/}/g" \
    -e "s/{APP_SERVER_PORT}/${APP_SERVER_PORT//\//\\/}/g" \
    -e "s/{HOST_IP}/${HOST_IP:-}/g" \
    -e "s/{APP_MAUL_APIKEY}/${APP_MAUL_APIKEY:-}/g" \
    -e "s/{APP_MAUL_DEBUG}/${APP_MAUL_DEBUG:-false}/g"

additional_args=()
if [ -n "$APP_SERVER_START_WORKSHOP_MAP" ]; then
  additional_args+=(+host_workshop_map "$APP_SERVER_START_WORKSHOP_MAP")
fi

export SRCDS_TOKEN="$APP_SERVER_STEAMTOKEN"
export CS2_SERVERNAME="$APP_SERVER_NAME"
export CS2_IP="$APP_SERVER_IP"
export CS2_PORT="$APP_SERVER_PORT"
export CS2_MAXPLAYERS="$APP_SERVER_MAXPLAYERS"
export CS2_PW="$APP_SERVER_PASSWORD"
export CS2_ADDITIONAL_ARGS="${CS2_ADDITIONAL_ARGS:-} ${additional_args[*]}"

exec /opt/edgegamers/upstream-entrypoint "$@"
```

- [ ] **Step 3: Create Dockerfile**

Create `Dockerfile`:

```dockerfile
# syntax=docker/dockerfile:1.7
ARG BASE_S2S_IMAGE=registry.edgegamers.io/source2/base-s2s:main
FROM ${BASE_S2S_IMAGE} AS s2s-base

FROM joedwards32/cs2:latest

USER root

COPY --from=s2s-base /usr/local/bin/install-metamod-source2 /usr/local/bin/install-metamod-source2
COPY --from=s2s-base /usr/local/bin/install-s2script-runtime /usr/local/bin/install-s2script-runtime
COPY --from=s2s-base /usr/local/bin/patch-gameinfo-metamod /usr/local/bin/patch-gameinfo-metamod
COPY --from=s2s-base /usr/local/bin/ensure-s2script-dirs /usr/local/bin/ensure-s2script-dirs
COPY --from=s2s-base /usr/local/bin/s2s /usr/local/bin/s2s

RUN mkdir -p /opt/edgegamers \
    && if [ -f /entrypoint.sh ]; then cp /entrypoint.sh /opt/edgegamers/upstream-entrypoint; \
       elif [ -f /home/steam/entrypoint.sh ]; then cp /home/steam/entrypoint.sh /opt/edgegamers/upstream-entrypoint; \
       else printf '#!/usr/bin/env bash\nexec "$@"\n' > /opt/edgegamers/upstream-entrypoint; fi \
    && chmod +x /opt/edgegamers/upstream-entrypoint

COPY --chmod=755 install-s2script-plugins.sh /usr/local/bin/install-s2script-plugins
COPY --chmod=755 docker-entrypoint.sh /docker-entrypoint.sh
COPY s2script-plugins.txt /opt/edgegamers/s2script-plugins.txt
COPY cfg /opt/edgegamers/cfg
COPY addons /opt/edgegamers/addons

ENTRYPOINT ["/docker-entrypoint.sh"]
```

If `joedwards32/cs2:latest` uses a different upstream entrypoint path, inspect the image and update only the upstream-entrypoint copy block.

- [ ] **Step 4: Create compose templates**

Create `compose-dev.yml`:

```yaml
services:
  cs2-ttt-s2s-dev:
    image: registry.edgegamers.io/source2/cs2/servers/ttt-s2s:dev
    container_name: cs2-ttt-s2s-dev
    restart: unless-stopped
    network_mode: host
    mem_limit: 4g
    volumes:
      - /home/dump:/home/steam/cs2-dedicated/game/csgo/addons/AcceleratorCS2/dumps
      - cs2-data:/home/steam/cs2-dedicated
      - s2script-dev-plugins:/home/steam/cs2-dedicated/game/csgo/addons/s2script/plugins
    labels:
      com.centurylinklabs.watchtower.enable: "true"
    tty: true
    stdin_open: true
    environment:
      APP_SERVER_DEVELOPMENT: "true"
      APP_SERVER_MAXPLAYERS: 64
      APP_SERVER_IP: ${APP_SERVER_IP}
      APP_SERVER_PORT: ${APP_SERVER_PORT}
      APP_SERVER_MONTHLY_PASSWORD: "true"
      APP_MAUL_APIKEY: ${APP_MAUL_APIKEY}
      APP_MAUL_DEBUG: "true"
      APP_SERVER_STEAMTOKEN: ${APP_SERVER_STEAMTOKEN}
      HOST_IP: ${HOST_IP}
      DB_COOKIE_CONNECTION: ${DB_COOKIE_CONNECTION}

volumes:
  cs2-data:
    external: true
  s2script-dev-plugins:
```

Create `compose-prod.yml`:

```yaml
services:
  cs2-ttt-s2s:
    image: registry.edgegamers.io/source2/cs2/servers/ttt-s2s:main
    container_name: cs2-ttt-s2s
    restart: always
    mem_limit: 4g
    ports:
      - "${APP_SERVER_IP}:${APP_SERVER_PORT}:${APP_SERVER_PORT}/tcp"
      - "${APP_SERVER_IP}:${APP_SERVER_PORT}:${APP_SERVER_PORT}/udp"
    volumes:
      - /home/dump/logs:/home/steam/cs2-dedicated/game/csgo/addons/AcceleratorCS2/dumps/logs
      - /home/dump/dumps:/home/steam/cs2-dedicated/game/csgo/addons/AcceleratorCS2/dumps/dumps
      - cs2-data:/home/steam/cs2-dedicated
      - cs2-karma:/home/steam/cs2-dedicated/game/persistent
    labels:
      com.centurylinklabs.watchtower.enable: "true"
    tty: true
    stdin_open: true
    environment:
      APP_SERVER_DEVELOPMENT: "false"
      APP_SERVER_MAXPLAYERS: 64
      APP_SERVER_IP: ${APP_SERVER_IP}
      APP_SERVER_PORT: ${APP_SERVER_PORT}
      APP_SERVER_NAME: "=(eGO)= Trouble in Terrorist Town | TTT | Karma | Shop"
      APP_MAUL_APIKEY: ${APP_MAUL_APIKEY}
      APP_MAUL_DEBUG: "false"
      HOST_IP: ${HOST_IP}
      APP_SERVER_STEAMTOKEN: ${APP_SERVER_STEAMTOKEN}
      DB_COOKIE_CONNECTION: ${DB_COOKIE_CONNECTION}

volumes:
  cs2-data:
    external: true
  cs2-karma:
```

- [ ] **Step 5: Create GitLab CI**

Create `.gitlab-ci.yml`:

```yaml
variables:
  DOCKER_BUILDKIT: "1"
  CONTAINER_IMAGE: "$CI_REGISTRY_IMAGE:$CI_COMMIT_REF_SLUG"
  BASE_S2S_TAG: "$CI_COMMIT_REF_SLUG"

services:
  - docker:24.0.7-dind

stages:
  - validate
  - build

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
  before_script:
    - echo "$CI_JOB_TOKEN" | docker login -u gitlab-ci-token --password-stdin "$CI_REGISTRY"
  script:
    - docker build
      --pull
      --progress plain
      --build-arg BASE_S2S_IMAGE="registry.edgegamers.io/source2/base-s2s:${BASE_S2S_TAG}"
      -t "$CONTAINER_IMAGE"
      .
    - docker push "$CONTAINER_IMAGE"
  rules:
    - if: '$CI_COMMIT_BRANCH'
  tags:
    - docker
```

- [ ] **Step 6: Replace README**

Replace `README.md` with:

```md
# ttt-s2s

CS2 Trouble in Terrorist Town server image for EdgeGamers on Source2Script.

`base-s2s` provides Source2Script helper commands. This repository owns CS2,
TTT configuration, selected addon overlays, compose templates, and startup.

## Development

Development plugins deploy over SSH from `edgegamers-s2s` into:

```text
/home/steam/cs2-dedicated/game/csgo/addons/s2script/plugins
```

Source2Script hot reloads `.s2sp` files in that directory.

## Production

Production images consume registry plugins with `s2s install`. Add package
names to `s2script-plugins.txt` after real publishable EdgeGamers packages
exist.

## Compose

The server box owns `.env` files and may run the compose templates by hand.
Daily 10:00 UTC rebuild and restart remains a box-level schedule.
```

- [ ] **Step 7: Run validation**

Run:

```powershell
bash scripts/validate.sh
```

Expected: PASS.

- [ ] **Step 8: Build image when Docker is available**

Run:

```powershell
docker build --pull --progress plain --build-arg BASE_S2S_IMAGE=base-s2s:local -t ttt-s2s:local .
```

Expected: PASS if `base-s2s:local` exists. If Docker is unavailable, record that GitLab CI must validate the image build.

- [ ] **Step 9: Commit**

```powershell
git add .dockerignore .gitlab-ci.yml Dockerfile README.md docker-entrypoint.sh install-s2script-plugins.sh s2script-plugins.txt compose-dev.yml compose-prod.yml
git commit -m "feat: add ttt source2script image"
```

---

### Task 9: Cross-Repo Verification And Final Documentation

**Files:**
- Modify as needed: `C:\Users\reece\VSCodeProjects\edgegamers-s2s\docs\implementation-status.md`
- Modify as needed: `C:\Users\reece\VSCodeProjects\base-s2s\README.md`
- Modify as needed: `C:\Users\reece\VSCodeProjects\ttt-s2s\README.md`

**Interfaces:**
- Consumes all prior tasks.
- Produces final verified release-pipeline state.

- [ ] **Step 1: Verify `edgegamers-s2s`**

Run:

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
npm.cmd run artifacts:local
```

Expected: all pass. If Source2Script build hits sandbox path limits, rerun with required escalation and record exact result.

- [ ] **Step 2: Verify `base-s2s`**

Run:

```powershell
bash scripts/validate.sh
docker build --pull --progress plain -t base-s2s:local .
```

Expected: validation passes; Docker build passes when Docker is available.

- [ ] **Step 3: Verify `ttt-s2s`**

Run:

```powershell
bash scripts/validate.sh
docker build --pull --progress plain --build-arg BASE_S2S_IMAGE=base-s2s:local -t ttt-s2s:local .
```

Expected: validation passes; Docker build passes when Docker is available and `base-s2s:local` exists.

- [ ] **Step 4: Confirm old repos are untouched**

Run:

```powershell
git -C C:\Users\reece\VSCodeProjects\base status --short
git -C C:\Users\reece\VSCodeProjects\ttt status --short
```

Expected: no changes made by this plan.

- [ ] **Step 5: Update status docs with evidence**

In `edgegamers-s2s/docs/implementation-status.md`, add a short "Release pipeline verification" block with the command names and outcomes from Steps 1-4.

- [ ] **Step 6: Commit status docs**

```powershell
git -C C:\Users\reece\VSCodeProjects\edgegamers-s2s add docs/implementation-status.md
git -C C:\Users\reece\VSCodeProjects\edgegamers-s2s commit -m "docs: record release pipeline verification"
```

- [ ] **Step 7: Report required remote setup**

Final handoff must list:

- GitHub development environment secrets: `DEV_SSH_HOST`, `DEV_SSH_PORT`, `DEV_SSH_USER`, `DEV_SSH_KEY`, `DEV_S2SCRIPT_PLUGIN_DIR`.
- GitHub production environment secret: `S2SCRIPT_TOKEN`.
- GitLab runners need Docker-in-Docker support for `base-s2s` and `ttt-s2s`.
- Server box must schedule 10:00 UTC rebuild/restart outside CI.
- Development SSH user must write to staging and Source2Script plugin directory only.

