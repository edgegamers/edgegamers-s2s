# Plugin Bundle Server Pipeline Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace direct plugin-directory deployment with server-scoped plugin bundles that `edgegamers-s2s` builds and server repositories package, deploy, and restart through their own GitLab SSH pipelines.

**Architecture:** `edgegamers-s2s` creates immutable zip bundles from built `.s2sp` files and triggers GitLab pipelines with bundle locator variables. `empty-s2s` and `ttt-s2s` download and verify those bundles, copy `.s2sp` files into payload images, and keep SSH/compose deployment local to the server repositories. `s2script-runtime-image` gains the smallest runtime support needed to copy bundled payload plugins into the live Source2Script plugin directory.

**Tech Stack:** Node.js 24, npm 11, Vitest, GitHub Actions, GitLab CI trigger API, Bash, Docker, Source2Script CLI.

## Global Constraints

- `edgegamers-s2s` builds Source2Script plugin bundles.
- Server repositories build images and deploy servers.
- Development deploys may restart automatically through the server repository's SSH deploy job.
- Production images are built and tagged, but production servers only move when the production server deployment flow selects that image.
- Do not keep Watchtower.
- Do not keep direct plugin-directory SSH deployment from `edgegamers-s2s`.
- Do not keep development manifest reconciliation in `edgegamers-s2s`.
- Do not move compose files, host paths, Docker deploy behavior, or server overlay ownership into `edgegamers-s2s`.
- Do not build a large server release resolver framework in the minimal server repos.
- Do not require production servers to resolve live "latest" plugin state at runtime.
- The installed plugin file name is stable and unversioned.
- Bundle metadata is audit metadata, not a runtime resolver.
- Server repos should stay small.
- First implementation supports `empty-s2s` and `ttt-s2s`.

---

## File Structure

### `C:\Users\reece\VSCodeProjects\edgegamers-s2s`

- Create `server-bundles/empty-s2s.txt`: shared plugin package list for the common server payload.
- Create `server-bundles/ttt-s2s.txt`: TTT plugin package list.
- Create `scripts/lib/server-bundle-list.mjs`: parse and validate server bundle list files.
- Create `scripts/lib/server-bundle-plan.mjs`: discover workspace plugins and built artifacts, then create bundle metadata records.
- Create `scripts/build-server-bundles.mjs`: CLI that writes server bundle directories, zip files, and `.sha256` files.
- Create `scripts/trigger-gitlab-server-pipelines.mjs`: CLI that turns bundle output into GitLab trigger calls.
- Create `scripts/test/server-bundle-list.test.mjs`: list parser tests.
- Create `scripts/test/server-bundle-plan.test.mjs`: artifact resolver and duplicate filename tests.
- Create `scripts/test/build-server-bundles.test.mjs`: zip and manifest output tests.
- Create `scripts/test/trigger-gitlab-server-pipelines.test.mjs`: GitLab trigger request tests.
- Modify `package.json`: add `bundles:servers` and `trigger:servers`.
- Modify `.github/workflows/deploy-dev.yml`: build bundles and trigger GitLab; remove SSH deployment.
- Modify `.github/workflows/release.yml`: build production bundles and upload them; keep optional registry deploy only where currently required.
- Modify `scripts/test/github-workflows.test.mjs`: assert bundle and trigger behavior, reject old SSH deploy behavior.
- Delete `scripts/deploy-development-artifacts.mjs`.
- Delete `scripts/lib/development-reconcile.mjs`.
- Delete `scripts/test/deploy-development-artifacts.test.mjs`.
- Delete `scripts/test/development-reconcile.test.mjs`.
- Modify docs that mention old dev SSH deployment.
- Delete stale tag-manifest spec and plan files that conflict with this design.

### `C:\Users\reece\VSCodeProjects\s2script-runtime-image`

- Create `scripts/install-s2script-bundled-plugins`: copy payload `.s2sp` files into the live plugin directory.
- Create `tests/bundled-plugins.test.sh`: shell test for payload copy behavior.
- Modify `scripts/source2-runtime-apply`: call bundled plugin copy before registry-package install.
- Modify `Dockerfile`: add `S2SCRIPT_BUNDLED_PLUGIN_DIR=/srv/source2/server/s2script/plugins`.
- Modify `README.md`: document bundled plugin payload support.
- Modify `scripts/validate.sh`: run the new test and assert the new env var and script.

### `C:\Users\reece\VSCodeProjects\empty-s2s`

- Create `.gitignore`: ignore downloaded `plugin-bundle/`.
- Create `plugin-bundle/plugins/.gitkeep`: keep a stable Docker build context path.
- Create `scripts/download-plugin-bundle.sh`: download, verify, and extract plugin bundle.
- Modify `Dockerfile`: copy `plugin-bundle/plugins` into `/payload/s2script/plugins`.
- Modify `.gitlab-ci.yml`: add bundle download job and wire it into image build.
- Modify `scripts/validate.sh`: validate the bundle ingestion path.
- Modify `README.md` and `docs/system-design.md`: document that EdgeGamers plugins come from bundles.

### `C:\Users\reece\VSCodeProjects\ttt-s2s`

- Create `.gitignore`: ignore downloaded `plugin-bundle/`.
- Create `plugin-bundle/plugins/.gitkeep`: keep a stable Docker build context path.
- Create `scripts/download-plugin-bundle.sh`: same minimal downloader as `empty-s2s`.
- Modify `Dockerfile`: remove `s2script-plugins.txt` append flow and copy `plugin-bundle/plugins` into `/payload/s2script/plugins`.
- Delete or stop using `s2script-plugins.txt` for EdgeGamers-owned plugins.
- Modify `.gitlab-ci.yml`: add bundle download job and wire it into image build.
- Modify `scripts/validate.sh`: validate the bundle ingestion path and absence of runtime registry list wiring.
- Modify `README.md`, `DEPLOYMENT_SETUP.md`, and `docs/system-design.md`: document the new bundle flow.

---

### Task 1: Runtime Image Supports Bundled Plugin Payloads

**Files:**
- Create: `C:\Users\reece\VSCodeProjects\s2script-runtime-image\scripts\install-s2script-bundled-plugins`
- Create: `C:\Users\reece\VSCodeProjects\s2script-runtime-image\tests\bundled-plugins.test.sh`
- Modify: `C:\Users\reece\VSCodeProjects\s2script-runtime-image\scripts\source2-runtime-apply`
- Modify: `C:\Users\reece\VSCodeProjects\s2script-runtime-image\Dockerfile`
- Modify: `C:\Users\reece\VSCodeProjects\s2script-runtime-image\README.md`
- Modify: `C:\Users\reece\VSCodeProjects\s2script-runtime-image\scripts\validate.sh`

**Interfaces:**
- Consumes: `S2SCRIPT_BUNDLED_PLUGIN_DIR`, default `/srv/source2/server/s2script/plugins`.
- Produces: executable `install-s2script-bundled-plugins <game-dir> <plugin-source-dir>`.
- Produces: live files under `<game-dir>/addons/s2script/plugins/*.s2sp`.

- [ ] **Step 1: Write the failing shell test**

Create `tests/bundled-plugins.test.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

mkdir -p "$tmp/game/addons/s2script/plugins"
mkdir -p "$tmp/server/s2script/plugins"
printf 'alpha\n' >"$tmp/server/s2script/plugins/alpha.s2sp"
printf 'ignored\n' >"$tmp/server/s2script/plugins/readme.txt"

PATH="$ROOT/scripts:$PATH" \
  bash "$ROOT/scripts/install-s2script-bundled-plugins" \
  "$tmp/game" \
  "$tmp/server/s2script/plugins"

test "$(cat "$tmp/game/addons/s2script/plugins/alpha.s2sp")" = "alpha"
test ! -f "$tmp/game/addons/s2script/plugins/readme.txt"

mkdir -p "$tmp/empty"
PATH="$ROOT/scripts:$PATH" \
  bash "$ROOT/scripts/install-s2script-bundled-plugins" \
  "$tmp/game" \
  "$tmp/empty"

printf '%s\n' "bundled plugin copy tests passed"
```

- [ ] **Step 2: Run the test and verify failure**

Run:

```powershell
bash tests/bundled-plugins.test.sh
```

Expected: FAIL because `scripts/install-s2script-bundled-plugins` does not exist.

- [ ] **Step 3: Create the bundled plugin installer**

Create `scripts/install-s2script-bundled-plugins`:

```bash
#!/usr/bin/env bash
set -euo pipefail

GAME_DIR="${1:?usage: install-s2script-bundled-plugins /path/to/game-dir /path/to/payload/plugins}"
PLUGIN_SOURCE_DIR="${2:?usage: install-s2script-bundled-plugins /path/to/game-dir /path/to/payload/plugins}"

ensure-s2script-dirs "$GAME_DIR"

if [ ! -d "$PLUGIN_SOURCE_DIR" ]; then
  exit 0
fi

shopt -s nullglob
for plugin in "$PLUGIN_SOURCE_DIR"/*.s2sp; do
  cp -f "$plugin" "$GAME_DIR/addons/s2script/plugins/$(basename "$plugin")"
done
```

- [ ] **Step 4: Wire the installer into runtime apply**

In `scripts/source2-runtime-apply`, insert this block before the existing `install-s2script-plugins` call:

```bash
install-s2script-bundled-plugins "$game_dir" "${S2SCRIPT_BUNDLED_PLUGIN_DIR:-$server_dir/s2script/plugins}"
```

Keep the existing `install-s2script-plugins` call after it so public registry package lists still work for non-bundled packages.

- [ ] **Step 5: Add the Docker environment default**

In `Dockerfile`, add this env entry beside `S2SCRIPT_PLUGIN_LIST_FILE`:

```dockerfile
    S2SCRIPT_BUNDLED_PLUGIN_DIR=/srv/source2/server/s2script/plugins \
```

- [ ] **Step 6: Update validation**

In `scripts/validate.sh`, add:

```bash
grep -q 'S2SCRIPT_BUNDLED_PLUGIN_DIR' Dockerfile README.md scripts/source2-runtime-apply
grep -q 'install-s2script-bundled-plugins' scripts/source2-runtime-apply
"$BASH_BIN" tests/bundled-plugins.test.sh
```

- [ ] **Step 7: Update README**

Add this short section to `README.md`:

```md
## Bundled Source2Script plugins

Server payloads may include prebuilt EdgeGamers plugins under
`/srv/source2/server/s2script/plugins/*.s2sp`. On startup the runtime copies
those files into the game install's `addons/s2script/plugins` directory before
processing `s2script-plugins.txt`.
```

- [ ] **Step 8: Run runtime verification**

Run:

```powershell
bash scripts/validate.sh
```

Expected: PASS and output includes `bundled plugin copy tests passed`.

- [ ] **Step 9: Commit**

```powershell
git -C C:\Users\reece\VSCodeProjects\s2script-runtime-image add Dockerfile README.md scripts/source2-runtime-apply scripts/install-s2script-bundled-plugins scripts/validate.sh tests/bundled-plugins.test.sh
git -C C:\Users\reece\VSCodeProjects\s2script-runtime-image commit -m "feat: support bundled s2script plugins"
```

---

### Task 2: Server Bundle Lists And Planning In `edgegamers-s2s`

**Files:**
- Create: `C:\Users\reece\VSCodeProjects\edgegamers-s2s\server-bundles\empty-s2s.txt`
- Create: `C:\Users\reece\VSCodeProjects\edgegamers-s2s\server-bundles\ttt-s2s.txt`
- Create: `C:\Users\reece\VSCodeProjects\edgegamers-s2s\scripts\lib\server-bundle-list.mjs`
- Create: `C:\Users\reece\VSCodeProjects\edgegamers-s2s\scripts\lib\server-bundle-plan.mjs`
- Create: `C:\Users\reece\VSCodeProjects\edgegamers-s2s\scripts\test\server-bundle-list.test.mjs`
- Create: `C:\Users\reece\VSCodeProjects\edgegamers-s2s\scripts\test\server-bundle-plan.test.mjs`

**Interfaces:**
- Produces: `parseServerBundleList(content: string): string[]`.
- Produces: `stablePluginFileName(packageName: string): string`.
- Produces: `createServerBundlePlan({ server, environment, commit, generatedAt, selectedPackages, workspacePlugins, artifactFiles }): object`.

- [ ] **Step 1: Add server bundle list files**

Create `server-bundles/empty-s2s.txt`:

```text
# One shared EdgeGamers plugin package per line.
```

Create `server-bundles/ttt-s2s.txt`:

```text
# One TTT EdgeGamers plugin package per line.
@edgegamers/reference-api
@edgegamers/reference-consumer
```

- [ ] **Step 2: Write list parser tests**

Create `scripts/test/server-bundle-list.test.mjs`:

```js
import { describe, expect, it } from "vitest";
import { parseServerBundleList } from "../lib/server-bundle-list.mjs";

describe("parseServerBundleList", () => {
  it("ignores blank lines and comments", () => {
    expect(parseServerBundleList("\n# comment\n@edgegamers/a\n\n@edgegamers/b # inline\n")).toEqual([
      "@edgegamers/a",
      "@edgegamers/b",
    ]);
  });

  it("rejects duplicate packages", () => {
    expect(() => parseServerBundleList("@edgegamers/a\n@edgegamers/a\n")).toThrow(
      "Duplicate plugin package: @edgegamers/a",
    );
  });

  it("rejects unscoped package names", () => {
    expect(() => parseServerBundleList("bad-package\n")).toThrow(
      "Invalid plugin package name: bad-package",
    );
  });
});
```

- [ ] **Step 3: Write bundle plan tests**

Create `scripts/test/server-bundle-plan.test.mjs`:

```js
import { describe, expect, it } from "vitest";
import {
  createServerBundlePlan,
  stablePluginFileName,
} from "../lib/server-bundle-plan.mjs";

describe("stablePluginFileName", () => {
  it("uses the unscoped package segment", () => {
    expect(stablePluginFileName("@edgegamers/reference-api")).toBe(
      "reference-api.s2sp",
    );
  });
});

describe("createServerBundlePlan", () => {
  it("maps selected packages to built artifacts and bundle metadata", () => {
    const plan = createServerBundlePlan({
      server: "ttt-s2s",
      environment: "development",
      commit: "abcdef1234567890",
      generatedAt: "2026-08-08T12:00:00.000Z",
      selectedPackages: ["@edgegamers/reference-api"],
      workspacePlugins: [
        {
          packageName: "@edgegamers/reference-api",
          directory: "plugins/reference-api",
        },
      ],
      artifactFiles: [
        {
          packageName: "@edgegamers/reference-api",
          path: "plugins/reference-api/dist/reference-api.s2sp",
          bytes: Buffer.from("plugin"),
        },
      ],
    });

    expect(plan.manifest).toEqual({
      schemaVersion: 1,
      managedBy: "edgegamers-s2s",
      server: "ttt-s2s",
      environment: "development",
      commit: "abcdef1234567890",
      generatedAt: "2026-08-08T12:00:00.000Z",
      plugins: [
        {
          packageName: "@edgegamers/reference-api",
          fileName: "reference-api.s2sp",
          sha256:
            "5e689e2b01672bf33996e75d5e372ff60c536ce1599a1458e867cd8f4bef5160",
        },
      ],
    });
    expect(plan.files).toEqual([
      {
        sourcePath: "plugins/reference-api/dist/reference-api.s2sp",
        zipPath: "plugins/reference-api.s2sp",
      },
    ]);
  });

  it("rejects selected packages outside the workspace", () => {
    expect(() =>
      createServerBundlePlan({
        server: "ttt-s2s",
        environment: "development",
        commit: "abcdef",
        generatedAt: "2026-08-08T12:00:00.000Z",
        selectedPackages: ["@edgegamers/missing"],
        workspacePlugins: [],
        artifactFiles: [],
      }),
    ).toThrow("server-bundles/ttt-s2s.txt references unknown workspace package @edgegamers/missing");
  });
});
```

- [ ] **Step 4: Run targeted tests and verify failure**

Run:

```powershell
npm.cmd test -- scripts/test/server-bundle-list.test.mjs scripts/test/server-bundle-plan.test.mjs
```

Expected: FAIL because the modules do not exist.

- [ ] **Step 5: Implement list parser**

Create `scripts/lib/server-bundle-list.mjs`:

```js
export function parseServerBundleList(content) {
  const packages = [];
  const seen = new Set();

  for (const rawLine of content.split(/\r?\n/u)) {
    const packageName = rawLine.replace(/#.*/u, "").trim();
    if (!packageName) continue;
    if (!/^@[a-z0-9-]+\/[a-z0-9._-]+$/u.test(packageName)) {
      throw new Error(`Invalid plugin package name: ${packageName}`);
    }
    if (seen.has(packageName)) {
      throw new Error(`Duplicate plugin package: ${packageName}`);
    }
    seen.add(packageName);
    packages.push(packageName);
  }

  return packages;
}
```

- [ ] **Step 6: Implement bundle planner**

Create `scripts/lib/server-bundle-plan.mjs`:

```js
import { createHash } from "node:crypto";

export function stablePluginFileName(packageName) {
  const segment = packageName.split("/").pop();
  if (!segment || segment.includes("/") || segment.includes("\\")) {
    throw new Error(`Invalid plugin package name: ${packageName}`);
  }
  return `${segment}.s2sp`;
}

export function createServerBundlePlan({
  server,
  environment,
  commit,
  generatedAt,
  selectedPackages,
  workspacePlugins,
  artifactFiles,
}) {
  const workspaceByPackage = new Map(
    workspacePlugins.map((plugin) => [plugin.packageName, plugin]),
  );
  const artifactByPackage = new Map(
    artifactFiles.map((artifact) => [artifact.packageName, artifact]),
  );
  const seenFileNames = new Set();

  const plugins = selectedPackages.map((packageName) => {
    if (!workspaceByPackage.has(packageName)) {
      throw new Error(`server-bundles/${server}.txt references unknown workspace package ${packageName}`);
    }

    const artifact = artifactByPackage.get(packageName);
    if (!artifact) {
      throw new Error(`Missing built .s2sp artifact for ${packageName}`);
    }

    const fileName = stablePluginFileName(packageName);
    if (seenFileNames.has(fileName)) {
      throw new Error(`Duplicate bundle plugin file name: ${fileName}`);
    }
    seenFileNames.add(fileName);

    return {
      packageName,
      fileName,
      sha256: createHash("sha256").update(artifact.bytes).digest("hex"),
    };
  });

  plugins.sort((left, right) => left.packageName.localeCompare(right.packageName));

  return {
    manifest: {
      schemaVersion: 1,
      managedBy: "edgegamers-s2s",
      server,
      environment,
      commit,
      generatedAt,
      plugins,
    },
    files: plugins.map((plugin) => ({
      sourcePath: artifactByPackage.get(plugin.packageName).path.replaceAll("\\", "/"),
      zipPath: `plugins/${plugin.fileName}`,
    })),
  };
}
```

- [ ] **Step 7: Run targeted tests and verify pass**

Run:

```powershell
npm.cmd test -- scripts/test/server-bundle-list.test.mjs scripts/test/server-bundle-plan.test.mjs
```

Expected: PASS.

- [ ] **Step 8: Commit**

```powershell
git add server-bundles scripts/lib/server-bundle-list.mjs scripts/lib/server-bundle-plan.mjs scripts/test/server-bundle-list.test.mjs scripts/test/server-bundle-plan.test.mjs
git commit -m "feat: plan server plugin bundles"
```

---

### Task 3: Build Server Bundle Zip Artifacts

**Files:**
- Create: `C:\Users\reece\VSCodeProjects\edgegamers-s2s\scripts\build-server-bundles.mjs`
- Create: `C:\Users\reece\VSCodeProjects\edgegamers-s2s\scripts\test\build-server-bundles.test.mjs`
- Modify: `C:\Users\reece\VSCodeProjects\edgegamers-s2s\package.json`

**Interfaces:**
- Consumes: `server-bundles/*.txt`.
- Consumes: built artifacts under `plugins/*/dist/*.s2sp`.
- Produces: `writeServerBundles({ root, environment, commit, generatedAt }): { bundles: Array<{ server, environment, zipPath, sha256Path, artifactName, sha256 }> }`.
- CLI: `npm run bundles:servers -- --environment development`.

- [ ] **Step 1: Write bundle writer tests**

Create `scripts/test/build-server-bundles.test.mjs`:

```js
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { writeServerBundles } from "../build-server-bundles.mjs";

function write(root, path, contents) {
  const target = join(root, path);
  mkdirSync(join(target, ".."), { recursive: true });
  writeFileSync(target, contents);
}

describe("writeServerBundles", () => {
  it("writes zip, sha256, and manifest for each server list", () => {
    const root = mkdtempSync(join(tmpdir(), "edgegamers-server-bundles-"));

    try {
      write(root, "server-bundles/ttt-s2s.txt", "@edgegamers/reference-api\n");
      write(root, "plugins/reference-api/package.json", JSON.stringify({
        name: "@edgegamers/reference-api",
      }));
      write(root, "plugins/reference-api/dist/reference-api.s2sp", "plugin");

      const result = writeServerBundles({
        root,
        environment: "development",
        commit: "abcdef1234567890",
        generatedAt: "2026-08-08T12:00:00.000Z",
      });

      expect(result.bundles).toHaveLength(1);
      expect(result.bundles[0].artifactName).toBe("ttt-s2s-development");
      expect(existsSync(join(root, result.bundles[0].zipPath))).toBe(true);
      expect(existsSync(join(root, result.bundles[0].sha256Path))).toBe(true);

      const zip = unzipSync(readFileSync(join(root, result.bundles[0].zipPath)));
      expect(Buffer.from(zip["plugins/reference-api.s2sp"]).toString("utf8")).toBe("plugin");
      const manifest = JSON.parse(Buffer.from(zip["plugin-bundle.json"]).toString("utf8"));
      expect(manifest.server).toBe("ttt-s2s");
      expect(manifest.environment).toBe("development");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 2: Run test and verify failure**

Run:

```powershell
npm.cmd test -- scripts/test/build-server-bundles.test.mjs
```

Expected: FAIL because `build-server-bundles.mjs` does not exist.

- [ ] **Step 3: Implement bundle writer CLI**

Create `scripts/build-server-bundles.mjs` with these exported functions:

```js
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { zipSync } from "fflate";
import { parseServerBundleList } from "./lib/server-bundle-list.mjs";
import { createServerBundlePlan } from "./lib/server-bundle-plan.mjs";

function normalize(path) {
  return path.replaceAll("\\", "/");
}

export function discoverWorkspacePlugins(root) {
  const pluginsRoot = join(root, "plugins");
  if (!existsSync(pluginsRoot)) return [];

  return readdirSync(pluginsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const directory = join("plugins", entry.name);
      const manifest = JSON.parse(readFileSync(join(root, directory, "package.json"), "utf8"));
      return { packageName: manifest.name, directory: normalize(directory) };
    })
    .sort((left, right) => left.packageName.localeCompare(right.packageName));
}

export function discoverArtifactFiles({ root, workspacePlugins }) {
  return workspacePlugins.map((plugin) => {
    const dist = join(root, plugin.directory, "dist");
    const fileName = basename(plugin.packageName.split("/").pop()) + ".s2sp";
    const absolutePath = join(dist, fileName);
    if (!existsSync(absolutePath)) {
      throw new Error(`Missing built .s2sp artifact for ${plugin.packageName}`);
    }
    return {
      packageName: plugin.packageName,
      path: normalize(relative(root, absolutePath)),
      bytes: readFileSync(absolutePath),
    };
  });
}

export function writeServerBundles({
  root = process.cwd(),
  environment,
  commit,
  generatedAt,
} = {}) {
  if (!environment || !/^(development|production)$/u.test(environment)) {
    throw new Error("environment must be development or production");
  }
  if (!commit) throw new Error("commit is required");

  const listRoot = join(root, "server-bundles");
  const workspacePlugins = discoverWorkspacePlugins(root);
  const artifactFiles = discoverArtifactFiles({ root, workspacePlugins });
  const outputRoot = join(root, "artifacts", "server-bundles");
  const bundles = [];

  rmSync(outputRoot, { recursive: true, force: true });

  for (const entry of readdirSync(listRoot, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".txt")) continue;

    const server = entry.name.replace(/\.txt$/u, "");
    const selectedPackages = parseServerBundleList(
      readFileSync(join(listRoot, entry.name), "utf8"),
    );
    const plan = createServerBundlePlan({
      server,
      environment,
      commit,
      generatedAt,
      selectedPackages,
      workspacePlugins,
      artifactFiles,
    });
    const artifactName = `${server}-${environment}`;
    const bundleDirectory = join(outputRoot, server, environment);
    const zipPath = join(bundleDirectory, `${artifactName}.zip`);
    const sha256Path = `${zipPath}.sha256`;
    const files = {
      "plugin-bundle.json": Buffer.from(`${JSON.stringify(plan.manifest, null, 2)}\n`),
    };

    for (const file of plan.files) {
      files[file.zipPath] = readFileSync(join(root, file.sourcePath));
    }

    mkdirSync(dirname(zipPath), { recursive: true });
    const zipBytes = zipSync(files);
    const sha256 = createHash("sha256").update(zipBytes).digest("hex");
    writeFileSync(zipPath, zipBytes);
    writeFileSync(sha256Path, `${sha256}  ${basename(zipPath)}\n`);
    bundles.push({
      server,
      environment,
      artifactName,
      zipPath: normalize(relative(root, zipPath)),
      sha256Path: normalize(relative(root, sha256Path)),
      sha256,
    });
  }

  bundles.sort((left, right) => left.server.localeCompare(right.server));
  return { bundles };
}

function argValue(name, args) {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

export function main({ root = process.cwd(), env = process.env, args = process.argv.slice(2), write = console.log } = {}) {
  const environment = argValue("--environment", args) ?? env.PLUGIN_BUNDLE_ENV ?? "development";
  const commit = env.GITHUB_SHA ?? env.CI_COMMIT_SHA ?? "local";
  const result = writeServerBundles({
    root,
    environment,
    commit,
    generatedAt: new Date().toISOString(),
  });
  for (const bundle of result.bundles) {
    write(`Wrote ${bundle.zipPath} (${bundle.sha256})`);
  }
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

- [ ] **Step 4: Add package script**

In `package.json`, add:

```json
"bundles:servers": "node scripts/build-server-bundles.mjs"
```

- [ ] **Step 5: Run targeted tests and local bundle build**

Run:

```powershell
npm.cmd test -- scripts/test/build-server-bundles.test.mjs
npm.cmd run build
npm.cmd run bundles:servers -- --environment development
```

Expected: tests PASS, build PASS, and `artifacts/server-bundles/ttt-s2s/development/ttt-s2s-development.zip` exists.

- [ ] **Step 6: Commit**

```powershell
git add package.json scripts/build-server-bundles.mjs scripts/test/build-server-bundles.test.mjs
git commit -m "feat: build server plugin bundles"
```

---

### Task 4: GitLab Trigger CLI In `edgegamers-s2s`

**Files:**
- Create: `C:\Users\reece\VSCodeProjects\edgegamers-s2s\scripts\trigger-gitlab-server-pipelines.mjs`
- Create: `C:\Users\reece\VSCodeProjects\edgegamers-s2s\scripts\test\trigger-gitlab-server-pipelines.test.mjs`
- Modify: `C:\Users\reece\VSCodeProjects\edgegamers-s2s\package.json`

**Interfaces:**
- Produces: `buildGitLabTriggerRequests({ gitlabUrl, ref, bundles, env }): Array<{ url, body }>`
- CLI: `npm run trigger:servers -- --environment development --ref dev`

- [ ] **Step 1: Write trigger request tests**

Create `scripts/test/trigger-gitlab-server-pipelines.test.mjs`:

```js
import { describe, expect, it } from "vitest";
import { buildGitLabTriggerRequests } from "../trigger-gitlab-server-pipelines.mjs";

describe("buildGitLabTriggerRequests", () => {
  it("creates one GitLab trigger request per configured server bundle", () => {
    const requests = buildGitLabTriggerRequests({
      gitlabUrl: "https://gitlab.example.test",
      ref: "dev",
      bundles: [
        {
          server: "ttt-s2s",
          environment: "development",
          artifactName: "ttt-s2s-development",
          sha256: "a".repeat(64),
        },
      ],
      env: {
        GITHUB_REPOSITORY: "edgegamers/edgegamers-s2s",
        GITHUB_RUN_ID: "12345",
        GITHUB_SHA: "abcdef",
        GITLAB_PROJECT_ID_TTT_S2S: "42",
        GITLAB_TRIGGER_TOKEN_TTT_S2S: "secret",
      },
    });

    expect(requests).toEqual([
      {
        server: "ttt-s2s",
        url: "https://gitlab.example.test/api/v4/projects/42/trigger/pipeline",
        body: {
          token: "secret",
          ref: "dev",
          "variables[PLUGIN_BUNDLE_SERVER]": "ttt-s2s",
          "variables[PLUGIN_BUNDLE_ENV]": "development",
          "variables[PLUGIN_BUNDLE_COMMIT]": "abcdef",
          "variables[PLUGIN_BUNDLE_GITHUB_REPOSITORY]": "edgegamers/edgegamers-s2s",
          "variables[PLUGIN_BUNDLE_GITHUB_RUN_ID]": "12345",
          "variables[PLUGIN_BUNDLE_ARTIFACT_NAME]": "ttt-s2s-development",
          "variables[PLUGIN_BUNDLE_SHA256]": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        },
      },
    ]);
  });
});
```

- [ ] **Step 2: Run trigger test and verify failure**

Run:

```powershell
npm.cmd test -- scripts/test/trigger-gitlab-server-pipelines.test.mjs
```

Expected: FAIL because the trigger script does not exist.

- [ ] **Step 3: Implement trigger script**

Create `scripts/trigger-gitlab-server-pipelines.mjs`:

```js
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

function envKeyForServer(prefix, server) {
  return `${prefix}_${server.toUpperCase().replaceAll("-", "_")}`;
}

export function buildGitLabTriggerRequests({ gitlabUrl, ref, bundles, env }) {
  const base = gitlabUrl.replace(/\/+$/u, "");
  return bundles.map((bundle) => {
    const projectId = env[envKeyForServer("GITLAB_PROJECT_ID", bundle.server)];
    const token = env[envKeyForServer("GITLAB_TRIGGER_TOKEN", bundle.server)];
    if (!projectId) throw new Error(`Missing ${envKeyForServer("GITLAB_PROJECT_ID", bundle.server)}`);
    if (!token) throw new Error(`Missing ${envKeyForServer("GITLAB_TRIGGER_TOKEN", bundle.server)}`);
    return {
      server: bundle.server,
      url: `${base}/api/v4/projects/${encodeURIComponent(projectId)}/trigger/pipeline`,
      body: {
        token,
        ref,
        "variables[PLUGIN_BUNDLE_SERVER]": bundle.server,
        "variables[PLUGIN_BUNDLE_ENV]": bundle.environment,
        "variables[PLUGIN_BUNDLE_COMMIT]": env.GITHUB_SHA,
        "variables[PLUGIN_BUNDLE_GITHUB_REPOSITORY]": env.GITHUB_REPOSITORY,
        "variables[PLUGIN_BUNDLE_GITHUB_RUN_ID]": env.GITHUB_RUN_ID,
        "variables[PLUGIN_BUNDLE_ARTIFACT_NAME]": bundle.artifactName,
        "variables[PLUGIN_BUNDLE_SHA256]": bundle.sha256,
      },
    };
  });
}

export async function triggerRequests({ requests, fetchImpl = fetch, write = console.log }) {
  for (const request of requests) {
    const body = new URLSearchParams(request.body);
    const response = await fetchImpl(request.url, { method: "POST", body });
    if (!response.ok) {
      throw new Error(`GitLab trigger failed for ${request.server}: HTTP ${response.status}`);
    }
    write(`Triggered ${request.server}`);
  }
}

function argValue(name, args) {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

export async function main({ root = process.cwd(), env = process.env, args = process.argv.slice(2) } = {}) {
  const environment = argValue("--environment", args) ?? env.PLUGIN_BUNDLE_ENV ?? "development";
  const ref = argValue("--ref", args) ?? (environment === "production" ? "main" : "dev");
  const gitlabUrl = env.GITLAB_URL;
  if (!gitlabUrl) throw new Error("GITLAB_URL is required");
  const bundleIndex = JSON.parse(readFileSync(join(root, "artifacts", "server-bundles", "bundles.json"), "utf8"));
  const requests = buildGitLabTriggerRequests({
    gitlabUrl,
    ref,
    bundles: bundleIndex.bundles,
    env,
  });
  await triggerRequests({ requests });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
```

- [ ] **Step 4: Update bundle writer to emit `bundles.json`**

In `scripts/build-server-bundles.mjs`, after sorting `bundles`, write:

```js
writeFileSync(
  join(outputRoot, "bundles.json"),
  `${JSON.stringify({ schemaVersion: 1, bundles }, null, 2)}\n`,
);
```

- [ ] **Step 5: Add package script**

In `package.json`, add:

```json
"trigger:servers": "node scripts/trigger-gitlab-server-pipelines.mjs"
```

- [ ] **Step 6: Run targeted tests**

Run:

```powershell
npm.cmd test -- scripts/test/trigger-gitlab-server-pipelines.test.mjs scripts/test/build-server-bundles.test.mjs
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add package.json scripts/trigger-gitlab-server-pipelines.mjs scripts/test/trigger-gitlab-server-pipelines.test.mjs scripts/build-server-bundles.mjs scripts/test/build-server-bundles.test.mjs
git commit -m "feat: trigger server pipelines from bundles"
```

---

### Task 5: Replace `edgegamers-s2s` Dev SSH Deploy With Bundle Triggers

**Files:**
- Modify: `C:\Users\reece\VSCodeProjects\edgegamers-s2s\.github\workflows\deploy-dev.yml`
- Modify: `C:\Users\reece\VSCodeProjects\edgegamers-s2s\.github\workflows\release.yml`
- Modify: `C:\Users\reece\VSCodeProjects\edgegamers-s2s\scripts\test\github-workflows.test.mjs`
- Delete: `C:\Users\reece\VSCodeProjects\edgegamers-s2s\scripts\deploy-development-artifacts.mjs`
- Delete: `C:\Users\reece\VSCodeProjects\edgegamers-s2s\scripts\lib\development-reconcile.mjs`
- Delete: `C:\Users\reece\VSCodeProjects\edgegamers-s2s\scripts\test\deploy-development-artifacts.test.mjs`
- Delete: `C:\Users\reece\VSCodeProjects\edgegamers-s2s\scripts\test\development-reconcile.test.mjs`
- Modify: `C:\Users\reece\VSCodeProjects\edgegamers-s2s\package.json`

**Interfaces:**
- Consumes: `npm run bundles:servers`.
- Consumes: `npm run trigger:servers`.
- Produces: dev workflow artifact `server-bundles-${{ github.sha }}`.

- [ ] **Step 1: Update workflow tests first**

In `scripts/test/github-workflows.test.mjs`, replace the development workflow test body with assertions for bundle upload and GitLab triggers:

```js
it("builds server bundles and triggers server pipelines for development", () => {
  const deployDev = workflow("deploy-dev.yml");

  for (const required of [
    "branches:",
    "- dev",
    "npm run lint",
    "npm run typecheck",
    "npm test",
    "npm run build",
    "npm run bundles:servers -- --environment development",
    "artifacts/server-bundles/",
    "actions/upload-artifact@v4",
    "npm run trigger:servers -- --environment development --ref dev",
    "GITLAB_URL: ${{ secrets.GITLAB_URL }}",
    "GITLAB_PROJECT_ID_TTT_S2S: ${{ secrets.GITLAB_PROJECT_ID_TTT_S2S }}",
    "GITLAB_TRIGGER_TOKEN_TTT_S2S: ${{ secrets.GITLAB_TRIGGER_TOKEN_TTT_S2S }}",
  ]) {
    expect(deployDev).toContain(required);
  }

  for (const removed of [
    "DEV_SSH_HOST",
    "DEV_SSH_KEY",
    "DEV_S2SCRIPT_PLUGIN_DIR",
    "npm run deploy:dev",
    "rsync",
  ]) {
    expect(deployDev).not.toContain(removed);
  }
});
```

- [ ] **Step 2: Add release workflow bundle assertions**

In the production release test, add required strings:

```js
"npm run bundles:servers -- --environment production",
"server-bundles-${{ github.sha }}",
"artifacts/server-bundles/",
```

Keep the existing Source2Script deploy assertions until registry publication is intentionally narrowed in a later task.

- [ ] **Step 3: Run workflow tests and verify failure**

Run:

```powershell
npm.cmd test -- scripts/test/github-workflows.test.mjs
```

Expected: FAIL because workflows still contain SSH deployment and do not build server bundles.

- [ ] **Step 4: Rewrite development workflow**

Replace the post-build development steps in `.github/workflows/deploy-dev.yml` with:

```yaml
      - name: Build development server bundles
        run: npm run bundles:servers -- --environment development

      - name: Upload development server bundles
        uses: actions/upload-artifact@v4
        with:
          name: server-bundles-${{ github.sha }}
          path: |
            artifacts/server-bundles/
          if-no-files-found: error
          retention-days: 14

      - name: Trigger development server pipelines
        env:
          GITLAB_URL: ${{ secrets.GITLAB_URL }}
          GITLAB_PROJECT_ID_EMPTY_S2S: ${{ secrets.GITLAB_PROJECT_ID_EMPTY_S2S }}
          GITLAB_TRIGGER_TOKEN_EMPTY_S2S: ${{ secrets.GITLAB_TRIGGER_TOKEN_EMPTY_S2S }}
          GITLAB_PROJECT_ID_TTT_S2S: ${{ secrets.GITLAB_PROJECT_ID_TTT_S2S }}
          GITLAB_TRIGGER_TOKEN_TTT_S2S: ${{ secrets.GITLAB_TRIGGER_TOKEN_TTT_S2S }}
        run: npm run trigger:servers -- --environment development --ref dev
```

Remove these steps entirely:

```yaml
      - name: Generate development manifest
      - name: Collect local development artifacts
      - name: Write development SSH key
      - name: Deploy development plugins
```

- [ ] **Step 5: Add production bundle upload**

In `.github/workflows/release.yml`, after `Build Source2Script workspace`, add:

```yaml
      - name: Build production server bundles
        run: npm run bundles:servers -- --environment production

      - name: Upload production server bundles
        uses: actions/upload-artifact@v4
        with:
          name: server-bundles-${{ github.sha }}
          path: |
            artifacts/server-bundles/
          if-no-files-found: error
          retention-days: 30
```

- [ ] **Step 6: Remove npm deploy script**

In `package.json`, remove:

```json
"deploy:dev": "node scripts/deploy-development-artifacts.mjs",
```

Keep `manifest:dev` and `artifacts:local` only if local manual artifact copying is still wanted. Remove them in Task 9 if docs cleanup proves they are now unused.

- [ ] **Step 7: Delete old dev SSH files**

Delete:

```text
scripts/deploy-development-artifacts.mjs
scripts/lib/development-reconcile.mjs
scripts/test/deploy-development-artifacts.test.mjs
scripts/test/development-reconcile.test.mjs
```

- [ ] **Step 8: Run workflow and full Node tests**

Run:

```powershell
npm.cmd test -- scripts/test/github-workflows.test.mjs
npm.cmd test
```

Expected: PASS. No test imports `deploy-development-artifacts.mjs` or `development-reconcile.mjs`.

- [ ] **Step 9: Commit**

```powershell
git add .github/workflows/deploy-dev.yml .github/workflows/release.yml package.json scripts/test/github-workflows.test.mjs
git add -u scripts/deploy-development-artifacts.mjs scripts/lib/development-reconcile.mjs scripts/test/deploy-development-artifacts.test.mjs scripts/test/development-reconcile.test.mjs
git commit -m "ci: trigger server pipelines with plugin bundles"
```

---

### Task 6: `empty-s2s` Downloads Bundles And Builds Them Into Payload

**Files:**
- Create: `C:\Users\reece\VSCodeProjects\empty-s2s\.gitignore`
- Create: `C:\Users\reece\VSCodeProjects\empty-s2s\plugin-bundle\plugins\.gitkeep`
- Create: `C:\Users\reece\VSCodeProjects\empty-s2s\scripts\download-plugin-bundle.sh`
- Modify: `C:\Users\reece\VSCodeProjects\empty-s2s\Dockerfile`
- Modify: `C:\Users\reece\VSCodeProjects\empty-s2s\.gitlab-ci.yml`
- Modify: `C:\Users\reece\VSCodeProjects\empty-s2s\scripts\validate.sh`
- Modify: `C:\Users\reece\VSCodeProjects\empty-s2s\README.md`
- Modify: `C:\Users\reece\VSCodeProjects\empty-s2s\docs\system-design.md`

**Interfaces:**
- Consumes: `PLUGIN_BUNDLE_GITHUB_REPOSITORY`, `PLUGIN_BUNDLE_GITHUB_RUN_ID`, `PLUGIN_BUNDLE_ARTIFACT_NAME`, `PLUGIN_BUNDLE_SHA256`.
- Consumes: `GITHUB_PLUGIN_BUNDLE_TOKEN` in GitLab CI.
- Produces: local `plugin-bundle/plugins/*.s2sp`.
- Produces: Docker payload `/payload/s2script/plugins/*.s2sp`.

- [ ] **Step 1: Add ignored bundle context**

Create `.gitignore`:

```text
plugin-bundle/*
!plugin-bundle/plugins/
!plugin-bundle/plugins/.gitkeep
```

Create the empty tracked file:

```text
plugin-bundle/plugins/.gitkeep
```

- [ ] **Step 2: Add bundle downloader script**

Create `scripts/download-plugin-bundle.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

: "${PLUGIN_BUNDLE_GITHUB_REPOSITORY:?PLUGIN_BUNDLE_GITHUB_REPOSITORY is required}"
: "${PLUGIN_BUNDLE_GITHUB_RUN_ID:?PLUGIN_BUNDLE_GITHUB_RUN_ID is required}"
: "${PLUGIN_BUNDLE_ARTIFACT_NAME:?PLUGIN_BUNDLE_ARTIFACT_NAME is required}"
: "${PLUGIN_BUNDLE_SHA256:?PLUGIN_BUNDLE_SHA256 is required}"
: "${GITHUB_PLUGIN_BUNDLE_TOKEN:?GITHUB_PLUGIN_BUNDLE_TOKEN is required}"

work_dir="$(mktemp -d)"
trap 'rm -rf "$work_dir"' EXIT

api="https://api.github.com/repos/${PLUGIN_BUNDLE_GITHUB_REPOSITORY}/actions/runs/${PLUGIN_BUNDLE_GITHUB_RUN_ID}/artifacts"
artifact_url="$(
  curl -fsSL \
    -H "Authorization: Bearer ${GITHUB_PLUGIN_BUNDLE_TOKEN}" \
    -H "Accept: application/vnd.github+json" \
    "$api" \
    | jq -r --arg name "$PLUGIN_BUNDLE_ARTIFACT_NAME" '.artifacts[] | select(.name == $name) | .archive_download_url' \
    | head -n 1
)"

test -n "$artifact_url"

curl -fL \
  -H "Authorization: Bearer ${GITHUB_PLUGIN_BUNDLE_TOKEN}" \
  -H "Accept: application/vnd.github+json" \
  "$artifact_url" \
  -o "$work_dir/actions-artifact.zip"

rm -rf plugin-bundle
mkdir -p plugin-bundle
unzip -q "$work_dir/actions-artifact.zip" -d "$work_dir/actions-artifact"

bundle_zip="$(find "$work_dir/actions-artifact" -path "*/${PLUGIN_BUNDLE_ARTIFACT_NAME}.zip" -type f | head -n 1)"
test -n "$bundle_zip"

actual_sha="$(sha256sum "$bundle_zip" | awk '{print $1}')"
test "$actual_sha" = "$PLUGIN_BUNDLE_SHA256"

mkdir -p plugin-bundle
unzip -q "$bundle_zip" -d plugin-bundle
test -f plugin-bundle/plugin-bundle.json
test -d plugin-bundle/plugins
```

- [ ] **Step 3: Modify Dockerfile**

Add after existing payload copies:

```dockerfile
COPY plugin-bundle/plugins /payload/s2script/plugins
```

- [ ] **Step 4: Add GitLab bundle download job**

In `.gitlab-ci.yml`, add `prepare` to stages before `validate`:

```yaml
stages:
  - prepare
  - validate
  - build
  - deploy
```

Add this job:

```yaml
prepare_plugin_bundle:
  stage: prepare
  image: alpine:3.20
  before_script:
    - apk add --no-cache bash curl jq unzip findutils coreutils
  script:
    - bash scripts/download-plugin-bundle.sh
  artifacts:
    paths:
      - plugin-bundle/
    expire_in: 1 day
  rules:
    - if: '$PLUGIN_BUNDLE_ARTIFACT_NAME'
```

In the `build` job, add:

```yaml
  needs:
    - job: prepare_plugin_bundle
      artifacts: true
      optional: true
```

- [ ] **Step 5: Update validation**

In `scripts/validate.sh`, add:

```bash
test -f scripts/download-plugin-bundle.sh
test -f plugin-bundle/plugins/.gitkeep
grep -q 'COPY plugin-bundle/plugins /payload/s2script/plugins' Dockerfile
grep -q 'prepare_plugin_bundle:' .gitlab-ci.yml
grep -q 'PLUGIN_BUNDLE_ARTIFACT_NAME' .gitlab-ci.yml scripts/download-plugin-bundle.sh
bash -n scripts/download-plugin-bundle.sh
```

- [ ] **Step 6: Update docs**

In `README.md`, replace the package-flow section with:

```md
## Plugin bundle flow

EdgeGamers-owned Source2Script plugins are not resolved at runtime from
`s2script-plugins.txt`. The `edgegamers-s2s` GitHub workflow builds an
`empty-s2s` plugin bundle and triggers this GitLab pipeline. The pipeline
downloads the bundle into `plugin-bundle/`, verifies its SHA-256, and bakes
`plugin-bundle/plugins/*.s2sp` into `/payload/s2script/plugins`.
```

In `docs/system-design.md`, add the same ownership note and remove statements that say the committed `s2script-plugins.txt` is the source of EdgeGamers-owned plugins.

- [ ] **Step 7: Run validation**

Run:

```powershell
bash scripts/validate.sh
```

Expected: PASS.

- [ ] **Step 8: Commit**

```powershell
git -C C:\Users\reece\VSCodeProjects\empty-s2s add .gitignore Dockerfile .gitlab-ci.yml README.md docs/system-design.md scripts/download-plugin-bundle.sh scripts/validate.sh plugin-bundle/plugins/.gitkeep
git -C C:\Users\reece\VSCodeProjects\empty-s2s commit -m "ci: build empty payload with plugin bundles"
```

---

### Task 7: `ttt-s2s` Downloads Bundles And Removes Runtime Registry List Wiring

**Files:**
- Create: `C:\Users\reece\VSCodeProjects\ttt-s2s\.gitignore`
- Create: `C:\Users\reece\VSCodeProjects\ttt-s2s\plugin-bundle\plugins\.gitkeep`
- Create: `C:\Users\reece\VSCodeProjects\ttt-s2s\scripts\download-plugin-bundle.sh`
- Modify: `C:\Users\reece\VSCodeProjects\ttt-s2s\Dockerfile`
- Modify: `C:\Users\reece\VSCodeProjects\ttt-s2s\.gitlab-ci.yml`
- Modify: `C:\Users\reece\VSCodeProjects\ttt-s2s\scripts\validate.sh`
- Modify: `C:\Users\reece\VSCodeProjects\ttt-s2s\README.md`
- Modify: `C:\Users\reece\VSCodeProjects\ttt-s2s\DEPLOYMENT_SETUP.md`
- Modify: `C:\Users\reece\VSCodeProjects\ttt-s2s\docs\system-design.md`
- Delete: `C:\Users\reece\VSCodeProjects\ttt-s2s\s2script-plugins.txt`

**Interfaces:**
- Consumes: same `PLUGIN_BUNDLE_*` variables as `empty-s2s`.
- Produces: Docker payload `/payload/s2script/plugins/*.s2sp`.
- Keeps: existing SSH deploy template and dev restart behavior in GitLab.

- [ ] **Step 1: Add ignored bundle context**

Create `.gitignore`:

```text
plugin-bundle/*
!plugin-bundle/plugins/
!plugin-bundle/plugins/.gitkeep
```

Create:

```text
plugin-bundle/plugins/.gitkeep
```

- [ ] **Step 2: Add downloader**

Copy the exact `scripts/download-plugin-bundle.sh` from Task 6 into `ttt-s2s`.

- [ ] **Step 3: Rewrite Dockerfile plugin section**

Remove these lines:

```dockerfile
COPY s2script-plugins.txt /payload/s2script-plugins.ttt.txt

RUN cat /payload/s2script-plugins.txt /payload/s2script-plugins.ttt.txt > /tmp/s2script-plugins.txt \
    && mv /tmp/s2script-plugins.txt /payload/s2script-plugins.txt \
    && rm /payload/s2script-plugins.ttt.txt
```

Add:

```dockerfile
COPY plugin-bundle/plugins /payload/s2script/plugins
```

- [ ] **Step 4: Delete old plugin package list**

Delete:

```text
s2script-plugins.txt
```

The `ttt-s2s` plugin set now lives in `edgegamers-s2s/server-bundles/ttt-s2s.txt`.

- [ ] **Step 5: Add GitLab prepare job**

In `.gitlab-ci.yml`, add `prepare` before `validate` and the same `prepare_plugin_bundle` job from Task 6.

The job must keep only this rule so ordinary server-repo pushes can still build with the tracked empty `plugin-bundle/plugins/.gitkeep` directory:

```yaml
  rules:
    - if: '$PLUGIN_BUNDLE_ARTIFACT_NAME'
```

In the `build` job, add:

```yaml
  needs:
    - job: prepare_plugin_bundle
      artifacts: true
      optional: true
```

- [ ] **Step 6: Update validation**

In `scripts/validate.sh`, remove:

```bash
test -f s2script-plugins.txt
grep -q 'COPY s2script-plugins.txt /payload/s2script-plugins.ttt.txt' Dockerfile
```

Add:

```bash
test -f scripts/download-plugin-bundle.sh
test -f plugin-bundle/plugins/.gitkeep
test ! -f s2script-plugins.txt
grep -q 'COPY plugin-bundle/plugins /payload/s2script/plugins' Dockerfile
grep -q 'prepare_plugin_bundle:' .gitlab-ci.yml
grep -q 'PLUGIN_BUNDLE_ARTIFACT_NAME' .gitlab-ci.yml scripts/download-plugin-bundle.sh
if grep -q 's2script-plugins.ttt.txt\|cat /payload/s2script-plugins.txt' Dockerfile; then
  echo "old ttt s2script package-list merge remains" >&2
  exit 1
fi
bash -n scripts/download-plugin-bundle.sh
```

- [ ] **Step 7: Update docs**

In `README.md`, replace references to TTT `s2script-plugins.txt` with:

```md
`ttt-s2s` receives EdgeGamers Source2Script plugins from the
`edgegamers-s2s` `ttt-s2s` bundle. This repository packages those downloaded
`.s2sp` files into `/payload/s2script/plugins` and owns the SSH compose deploy.
```

In `DEPLOYMENT_SETUP.md` and `docs/system-design.md`, remove runtime package-list wording for EdgeGamers-owned plugins and describe the `PLUGIN_BUNDLE_*` trigger variables.

- [ ] **Step 8: Run validation**

Run:

```powershell
bash scripts/validate.sh
```

Expected: PASS.

- [ ] **Step 9: Commit**

```powershell
git -C C:\Users\reece\VSCodeProjects\ttt-s2s add .gitignore Dockerfile .gitlab-ci.yml README.md DEPLOYMENT_SETUP.md docs/system-design.md scripts/download-plugin-bundle.sh scripts/validate.sh plugin-bundle/plugins/.gitkeep
git -C C:\Users\reece\VSCodeProjects\ttt-s2s add -u s2script-plugins.txt
git -C C:\Users\reece\VSCodeProjects\ttt-s2s commit -m "ci: build ttt payload with plugin bundles"
```

---

### Task 8: Documentation And Setup Cleanup

**Files:**
- Modify: `C:\Users\reece\VSCodeProjects\edgegamers-s2s\docs\releases.md`
- Modify: `C:\Users\reece\VSCodeProjects\edgegamers-s2s\docs\local-development.md`
- Modify: `C:\Users\reece\VSCodeProjects\edgegamers-s2s\docs\architecture.md`
- Modify: `C:\Users\reece\VSCodeProjects\edgegamers-s2s\docs\implementation-status.md`
- Modify: `C:\Users\reece\VSCodeProjects\edgegamers-s2s\.github\MANUAL_SETUP.md`
- Delete: `C:\Users\reece\VSCodeProjects\edgegamers-s2s\docs\superpowers\specs\2026-08-08-server-release-tags-design.md`
- Delete: `C:\Users\reece\VSCodeProjects\edgegamers-s2s\docs\superpowers\plans\2026-08-08-server-release-tags.md`

**Interfaces:**
- Produces: docs that describe bundle-trigger ownership and no longer describe direct dev SSH reconcile.

- [ ] **Step 1: Search old wording**

Run:

```powershell
rg -n "DEV_SSH|DEV_S2SCRIPT_PLUGIN_DIR|deploy:dev|development manifest|reconcile|server-release-manifest|Watchtower|s2s install|production stops at the Source2Script registry" docs .github package.json scripts
```

Expected: output identifies the docs and tests that still mention removed systems.

- [ ] **Step 2: Update release docs**

In `docs/releases.md`, replace the development build flow with:

````md
Development builds produce server-scoped plugin bundles:

```text
s2s build
    ↓
server bundle zip files
    ↓
GitHub Actions artifact upload
    ↓
GitLab server pipeline trigger
    ↓
server repository image build and SSH dev deploy
```

`edgegamers-s2s` does not SSH to game servers. Server repositories own compose,
host paths, image deployment, and restart behavior.
````

Replace production server wording with:

````md
Production bundles are immutable CI artifacts created from `main`. Server
repositories choose when to consume a production bundle, build a production
image, and update production runtime selection. Production deploys do not force
restart unless the server repository's production deploy command explicitly
does so.
````

- [ ] **Step 3: Update local development docs**

In `docs/local-development.md`, keep `artifacts:local` as manual local copy support only and add:

```md
CI server deployment does not use `artifacts/local-development/`. CI uses
server bundles under `artifacts/server-bundles/` and hands deployment to the
server repositories.
```

- [ ] **Step 4: Update architecture docs**

In `docs/architecture.md`, replace "Server deployment remains intentionally stubbed" and old registry-boundary wording with:

```md
Server deployment is intentionally outside this repository. This repository
builds server-scoped plugin bundles and triggers server repository pipelines.
The server repositories own image builds, SSH deploys, compose files, and
restart policy.
```

- [ ] **Step 5: Update manual setup**

In `.github/MANUAL_SETUP.md`, remove all `DEV_SSH_*` and `DEV_S2SCRIPT_PLUGIN_DIR` setup entries. Add:

```md
## GitLab trigger secrets

`edgegamers-s2s` needs these GitHub secrets:

- `GITLAB_URL`
- `GITLAB_PROJECT_ID_EMPTY_S2S`
- `GITLAB_TRIGGER_TOKEN_EMPTY_S2S`
- `GITLAB_PROJECT_ID_TTT_S2S`
- `GITLAB_TRIGGER_TOKEN_TTT_S2S`

Each server repository keeps its own GitLab SSH deployment secrets.
```

- [ ] **Step 6: Delete stale tag-manifest design**

Delete:

```text
docs/superpowers/specs/2026-08-08-server-release-tags-design.md
docs/superpowers/plans/2026-08-08-server-release-tags.md
```

- [ ] **Step 7: Run docs search**

Run:

```powershell
rg -n "DEV_SSH|DEV_S2SCRIPT_PLUGIN_DIR|deploy:dev|server-release-manifest|Watchtower|direct.*SSH|remote.*reconcile" docs .github package.json scripts
```

Expected: no output except historical mention in the approved plugin bundle overhaul spec if it says those systems are removed.

- [ ] **Step 8: Commit**

```powershell
git add docs .github/MANUAL_SETUP.md
git commit -m "docs: remove old server release paths"
```

---

### Task 9: Final Cross-Repo Verification

**Files:**
- Modify: `C:\Users\reece\VSCodeProjects\edgegamers-s2s\docs\implementation-status.md`

**Interfaces:**
- Produces: final verification evidence for the overhaul.

- [ ] **Step 1: Verify runtime image**

Run:

```powershell
bash scripts/validate.sh
```

from:

```text
C:\Users\reece\VSCodeProjects\s2script-runtime-image
```

Expected: PASS and output includes `bundled plugin copy tests passed`.

- [ ] **Step 2: Verify `edgegamers-s2s`**

Run:

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
npm.cmd run bundles:servers -- --environment development
npm.cmd run bundles:servers -- --environment production
```

Expected: all commands exit 0. The bundle commands write `artifacts/server-bundles/bundles.json`.

- [ ] **Step 3: Verify `empty-s2s`**

Run:

```powershell
bash scripts/validate.sh
```

from:

```text
C:\Users\reece\VSCodeProjects\empty-s2s
```

Expected: PASS.

- [ ] **Step 4: Verify `ttt-s2s`**

Run:

```powershell
bash scripts/validate.sh
```

from:

```text
C:\Users\reece\VSCodeProjects\ttt-s2s
```

Expected: PASS.

- [ ] **Step 5: Verify Docker builds when Docker is available**

Run:

```powershell
docker build --pull --progress plain -t s2script-runtime-image:bundled-plugins C:\Users\reece\VSCodeProjects\s2script-runtime-image
docker build --pull --progress plain -t empty-s2s:plugin-bundle C:\Users\reece\VSCodeProjects\empty-s2s
docker build --pull --progress plain --build-arg EMPTY_S2S_IMAGE=empty-s2s:plugin-bundle -t ttt-s2s:plugin-bundle C:\Users\reece\VSCodeProjects\ttt-s2s
```

Expected: all builds pass when Docker is available. If Docker is unavailable, record the exact Docker error in `docs/implementation-status.md`.

- [ ] **Step 6: Confirm removed systems are gone**

Run:

```powershell
rg -n "DEV_SSH|DEV_S2SCRIPT_PLUGIN_DIR|deploy:dev|server-release-manifest|Watchtower|development-reconcile|deploy-development-artifacts" C:\Users\reece\VSCodeProjects\edgegamers-s2s C:\Users\reece\VSCodeProjects\empty-s2s C:\Users\reece\VSCodeProjects\ttt-s2s
```

Expected: no active pipeline or script references. Historical removal wording in the approved spec is acceptable.

- [ ] **Step 7: Record verification**

In `edgegamers-s2s/docs/implementation-status.md`, add:

```md
## Plugin bundle server pipeline overhaul

Status: implemented.

Verification:

- `s2script-runtime-image`: `bash scripts/validate.sh` exited 0.
- `edgegamers-s2s`: lint, typecheck, tests, build, development bundle build,
  and production bundle build exited 0.
- `empty-s2s`: `bash scripts/validate.sh` exited 0.
- `ttt-s2s`: `bash scripts/validate.sh` exited 0.
- Docker image builds: record the exact outcome from the local Docker command.
- Removed systems grep: no active direct dev SSH deploy, Watchtower,
  development reconcile, or server-release-manifest pipeline remains.
```

- [ ] **Step 8: Commit status**

```powershell
git -C C:\Users\reece\VSCodeProjects\edgegamers-s2s add docs/implementation-status.md
git -C C:\Users\reece\VSCodeProjects\edgegamers-s2s commit -m "docs: record plugin bundle verification"
```

---

## Execution Notes

- Work directly on `dev`; the user approved using `dev`.
- Keep commits per task and per repository.
- Do not edit old repos `C:\Users\reece\VSCodeProjects\base` or `C:\Users\reece\VSCodeProjects\ttt`.
- Prefer deleting old release-path files over adapting them.
- If a CI artifact download URL is awkward in GitLab, keep the GitHub run artifact locator variables and use the GitHub Actions artifact API from the server repo downloader.
- If Docker is unavailable locally, finish all non-Docker verification and record the Docker error exactly.
