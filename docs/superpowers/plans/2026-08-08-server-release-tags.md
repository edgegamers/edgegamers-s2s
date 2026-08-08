# Server Release Tags Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build tag-controlled server releases where production servers consume frozen release manifests and EdgeGamers plugins come from stable-named GitHub `.s2sp` release assets.

**Architecture:** `edgegamers-s2s` owns plugin Changeset enforcement, plugin GitHub release assets, optional S2Script registry publication, and direct dev artifact deployment. `s2script-runtime-image` owns startup reconciliation from frozen server release manifests. `empty-s2s` and child server repos own versionless plugin intent, tag-time manifest resolution, and tag-controlled deployments.

**Tech Stack:** Node.js 24, npm 11, Vitest, GitHub Actions, GitHub CLI, GitLab CI, Docker, Bash, Source2Script CLI.

## Global Constraints

- Production server changes only through server tags such as `26.08.08`.
- A production tag represents the full server snapshot for that server until the next server tag.
- EdgeGamers servers download all EdgeGamers Source2Script plugins from GitHub release assets.
- Selected plugins may also publish to the Source2Script registry for external consumers.
- Every plugin behavior or public contract change that reaches `edgegamers-s2s/main` requires a Changeset.
- Private plugins are not exempt from the Changeset requirement when they affect server behavior.
- GitHub plugin release tag format is `plugin/<plugin-name>/v<version>`.
- GitHub plugin asset name and live install name are `<plugin-name>.s2sp`.
- `empty-s2s` is the common base for child server repositories.
- Child development servers auto-adopt the newest tagged `empty-s2s` common release.
- Child production servers adopt a common release only when their own server repo is tagged.
- Included disabled plugins install to `addons/s2script/plugins/disabled/<plugin-name>.s2sp`.
- Reconcile deletes only files listed in the previous EdgeGamers managed manifest.
- Required plugins fail startup or deployment when download or digest validation fails.
- Do not edit `C:\Users\reece\VSCodeProjects\base` or `C:\Users\reece\VSCodeProjects\ttt`.

---

## File Structure

### `C:\Users\reece\VSCodeProjects\edgegamers-s2s`

- Modify `scripts/lib/changeset-policy.mjs`: include private plugins in Changeset coverage and parse EdgeGamers release metadata.
- Modify `scripts/check-changeset.mjs`: use the broader plugin policy.
- Modify `scripts/test/changeset-policy.test.mjs`: cover private plugin Changeset requirements and registry opt-in metadata.
- Create `scripts/lib/plugin-release-plan.mjs`: build stable release tags, asset names, and local artifact mappings for plugin versions.
- Create `scripts/test/plugin-release-plan.test.mjs`: prove stable filenames, package-name to plugin-name normalization, duplicate rejection, and registry opt-in planning.
- Create `scripts/create-plugin-release-plan.mjs`: CLI that writes `artifacts/plugin-release-plan.json`.
- Create `scripts/publish-github-plugin-releases.mjs`: CLI that calls `gh release create` or `gh release upload` from the generated plan.
- Modify `.github/workflows/release.yml`: create GitHub plugin release assets for all released plugins and run `s2s deploy --ci` only for registry opt-ins.
- Modify `scripts/test/github-workflows.test.mjs`: assert GitHub release and registry behavior.
- Modify `scripts/lib/development-manifest.mjs`: add `enabled: true` and `installPath: "enabled"` to dev manifest entries.
- Modify `scripts/lib/development-reconcile.mjs`: plan enabled and disabled paths.
- Modify `scripts/deploy-development-artifacts.mjs`: reconcile `plugins/` and `plugins/disabled/`.
- Modify dev reconcile tests: cover disabled updates and stale deletion from both paths.
- Modify `docs/releases.md`, `docs/local-development.md`, and `docs/implementation-status.md`: document the new plugin release and dev reconcile behavior.

### `C:\Users\reece\VSCodeProjects\s2script-runtime-image`

- Create `scripts/reconcile-s2script-release-manifest`: startup reconcile from `server-release-manifest.json`.
- Modify `scripts/install-s2script-plugins`: keep legacy `s2script-plugins.txt` support and call manifest reconcile when a release manifest exists.
- Modify `scripts/source2-runtime-apply`: prefer `S2SCRIPT_RELEASE_MANIFEST_FILE` over the package list.
- Modify `Dockerfile`: add default `S2SCRIPT_RELEASE_MANIFEST_FILE=/srv/source2/server/server-release-manifest.json`.
- Create `tests/reconcile-release-manifest.test.sh`: exercise enabled, disabled, stale delete, digest failure, and unmanaged preservation.
- Modify `scripts/validate.sh`: run the new test and assert manifest env/docs.
- Modify `README.md`: document frozen manifest startup behavior.

### `C:\Users\reece\VSCodeProjects\empty-s2s`

- Create `server-plugins.json`: common server plugin intent with no versions.
- Modify `Dockerfile`: copy `server-plugins.json` into `/payload/server-plugins.json`.
- Create `scripts/lib/server-plugin-intent.mjs`: parse versionless plugin intent.
- Create `scripts/lib/server-release-manifest.mjs`: resolve release manifest records from resolved plugin assets.
- Create `scripts/resolve-server-release.mjs`: resolve latest GitHub plugin releases and write `server-release-manifest.json`.
- Create `package.json` and `package-lock.json`: local Vitest test runner for release scripts.
- Create `scripts/test/server-plugin-intent.test.mjs`.
- Create `scripts/test/server-release-manifest.test.mjs`.
- Modify `.gitlab-ci.yml`: add tag validation, tag build, release manifest generation, and tag artifact upload for `YY.MM.DD` tags.
- Modify `scripts/validate.sh`: validate the new JSON files and scripts.
- Modify `README.md` and `docs/system-design.md`: document common release tags.

### `C:\Users\reece\VSCodeProjects\ttt-s2s`

- Create `server-plugins.json`: TTT-specific plugin intent with no versions.
- Modify `Dockerfile`: copy child `server-plugins.json`, inherit common payload, and keep stable merged plugin intent artifacts.
- Create `scripts/lib/server-plugin-intent.mjs`: parse child intent and merge common overrides by plugin name.
- Create `scripts/lib/server-release-manifest.mjs`: build child server release manifests.
- Create `scripts/resolve-server-release.mjs`: resolve latest `empty-s2s` release and latest plugin GitHub release assets.
- Create `package.json` and `package-lock.json`: local Vitest test runner for release scripts.
- Create `scripts/test/server-plugin-intent.test.mjs`.
- Create `scripts/test/server-release-manifest.test.mjs`.
- Modify `.gitlab-ci.yml`: make dev builds use latest tagged `empty-s2s`; make production deploy run only for tags; upload frozen tag manifest.
- Modify `scripts/validate.sh`: validate JSON, resolver scripts, and tag CI behavior.
- Modify `README.md`, `DEPLOYMENT_SETUP.md`, and `docs/system-design.md`: document child release tags and common adoption.

---

### Task 1: Changeset Policy For All Server-Affecting Plugins

**Files:**
- Modify: `C:\Users\reece\VSCodeProjects\edgegamers-s2s\scripts\lib\changeset-policy.mjs`
- Modify: `C:\Users\reece\VSCodeProjects\edgegamers-s2s\scripts\check-changeset.mjs`
- Modify: `C:\Users\reece\VSCodeProjects\edgegamers-s2s\scripts\test\changeset-policy.test.mjs`

**Interfaces:**
- Consumes: plugin package JSON content from `plugins/*/package.json`.
- Produces: `parsePluginMetadata(directory, content)` returning `{ directory, name, private, publishToRegistry }`.
- Produces: `evaluateChangesetCoverage({ changedFiles, plugins, coveredPackages })` where private plugins are included.

- [ ] **Step 1: Add failing private-plugin coverage tests**

Add these cases to `scripts/test/changeset-policy.test.mjs`:

```js
it("requires Changesets for private plugin source changes", () => {
  const result = evaluateChangesetCoverage({
    changedFiles: ["plugins/private-tool/src/plugin.ts"],
    plugins: [
      {
        directory: "private-tool",
        name: "@edgegamers/private-tool",
        private: true,
        publishToRegistry: false,
      },
    ],
    coveredPackages: new Set(),
  });

  expect(result.affectedPackages).toEqual(["@edgegamers/private-tool"]);
  expect(result.missingPackages).toEqual(["@edgegamers/private-tool"]);
});

it("parses registry publication metadata separately from private", () => {
  expect(
    parsePluginMetadata(
      "karma",
      JSON.stringify({
        name: "@edgegamers/karma",
        private: true,
        edgegamers: { release: { publishToRegistry: true } },
      }),
    ),
  ).toEqual({
    directory: "karma",
    name: "@edgegamers/karma",
    private: true,
    publishToRegistry: true,
  });
});
```

- [ ] **Step 2: Run the targeted test and verify failure**

Run:

```powershell
npm.cmd test -- scripts/test/changeset-policy.test.mjs
```

Expected: FAIL because private plugins are currently ignored and `publishToRegistry` is not returned.

- [ ] **Step 3: Implement metadata parsing**

In `parsePluginMetadata`, return:

```js
return {
  directory,
  name: packageJson.name,
  private: packageJson.private === true,
  publishToRegistry:
    packageJson.edgegamers?.release?.publishToRegistry === true,
};
```

- [ ] **Step 4: Include all plugins in Changeset coverage**

Replace the `publishableByDirectory` map with:

```js
const packageByDirectory = new Map(
  plugins.map((plugin) => [plugin.directory, plugin.name]),
);
```

Then use `packageByDirectory.get(match[1])` when deriving `packageName`.

- [ ] **Step 5: Run targeted tests and verify pass**

Run:

```powershell
npm.cmd test -- scripts/test/changeset-policy.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add scripts/lib/changeset-policy.mjs scripts/check-changeset.mjs scripts/test/changeset-policy.test.mjs
git commit -m "fix: require changesets for private plugins"
```

---

### Task 2: Stable Plugin Release Plan

**Files:**
- Create: `C:\Users\reece\VSCodeProjects\edgegamers-s2s\scripts\lib\plugin-release-plan.mjs`
- Create: `C:\Users\reece\VSCodeProjects\edgegamers-s2s\scripts\test\plugin-release-plan.test.mjs`
- Create: `C:\Users\reece\VSCodeProjects\edgegamers-s2s\scripts\create-plugin-release-plan.mjs`
- Modify: `C:\Users\reece\VSCodeProjects\edgegamers-s2s\package.json`

**Interfaces:**
- Produces: `stablePluginFileName(packageName: string): string`.
- Produces: `pluginReleaseTag({ packageName, version }): string`.
- Produces: `createPluginReleasePlan({ plugins, artifacts }): { schemaVersion: 1, generatedAt, releases }`.
- CLI: `npm run release:plan` writes `artifacts/plugin-release-plan.json`.

- [ ] **Step 1: Write failing release-plan tests**

Create `scripts/test/plugin-release-plan.test.mjs`:

```js
import { describe, expect, it } from "vitest";
import {
  createPluginReleasePlan,
  pluginReleaseTag,
  stablePluginFileName,
} from "../lib/plugin-release-plan.mjs";

describe("stablePluginFileName", () => {
  it("uses the unscoped package segment and no version", () => {
    expect(stablePluginFileName("@edgegamers/reference-api")).toBe(
      "reference-api.s2sp",
    );
  });
});

describe("pluginReleaseTag", () => {
  it("puts the version in the tag", () => {
    expect(
      pluginReleaseTag({
        packageName: "@edgegamers/reference-api",
        version: "1.2.3",
      }),
    ).toBe("plugin/reference-api/v1.2.3");
  });
});

describe("createPluginReleasePlan", () => {
  it("maps packages to stable artifact names and registry intent", () => {
    const plan = createPluginReleasePlan({
      generatedAt: "2026-08-08T12:00:00.000Z",
      plugins: [
        {
          directory: "reference-api",
          name: "@edgegamers/reference-api",
          version: "1.2.3",
          publishToRegistry: true,
        },
      ],
      artifacts: [
        {
          packageName: "@edgegamers/reference-api",
          path: "plugins/reference-api/dist/reference-api.s2sp",
          bytes: Buffer.from("plugin"),
        },
      ],
    });

    expect(plan.releases).toEqual([
      {
        packageName: "@edgegamers/reference-api",
        version: "1.2.3",
        releaseTag: "plugin/reference-api/v1.2.3",
        assetName: "reference-api.s2sp",
        artifactPath: "plugins/reference-api/dist/reference-api.s2sp",
        sha256:
          "5e689e2b01672bf33996e75d5e372ff60c536ce1599a1458e867cd8f4bef5160",
        publishToRegistry: true,
      },
    ]);
  });
});
```

- [ ] **Step 2: Run targeted test and verify failure**

Run:

```powershell
npm.cmd test -- scripts/test/plugin-release-plan.test.mjs
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement `plugin-release-plan.mjs`**

Create the module with:

```js
import { createHash } from "node:crypto";

export function stablePluginFileName(packageName) {
  const segment = packageName.split("/").pop();
  if (!segment || segment.includes("\\") || segment.includes("/")) {
    throw new Error(`Invalid plugin package name: ${packageName}`);
  }
  return `${segment}.s2sp`;
}

export function pluginReleaseTag({ packageName, version }) {
  if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/u.test(version)) {
    throw new Error(`Invalid plugin version: ${version}`);
  }
  return `plugin/${stablePluginFileName(packageName).replace(/\.s2sp$/u, "")}/v${version}`;
}

export function createPluginReleasePlan({ generatedAt, plugins, artifacts }) {
  const artifactByPackage = new Map(
    artifacts.map((artifact) => [artifact.packageName, artifact]),
  );
  const seenAssets = new Set();

  const releases = plugins.map((plugin) => {
    const artifact = artifactByPackage.get(plugin.name);
    if (!artifact) throw new Error(`Missing .s2sp artifact for ${plugin.name}`);

    const assetName = stablePluginFileName(plugin.name);
    if (seenAssets.has(assetName)) {
      throw new Error(`Duplicate plugin asset name: ${assetName}`);
    }
    seenAssets.add(assetName);

    return {
      packageName: plugin.name,
      version: plugin.version,
      releaseTag: pluginReleaseTag({
        packageName: plugin.name,
        version: plugin.version,
      }),
      assetName,
      artifactPath: artifact.path.replaceAll("\\", "/"),
      sha256: createHash("sha256").update(artifact.bytes).digest("hex"),
      publishToRegistry: plugin.publishToRegistry === true,
    };
  });

  releases.sort((left, right) => left.packageName.localeCompare(right.packageName));

  return {
    schemaVersion: 1,
    generatedAt,
    releases,
  };
}
```

- [ ] **Step 4: Implement the CLI**

Create `scripts/create-plugin-release-plan.mjs` that:

1. Reads `plugins/*/package.json`.
2. Reads `plugins/<directory>/dist/*.s2sp`.
3. Calls `createPluginReleasePlan`.
4. Writes `artifacts/plugin-release-plan.json`.

Use `parsePluginMetadata` from `scripts/lib/changeset-policy.mjs` and add `version` from package JSON in this CLI.

- [ ] **Step 5: Add package script**

Add to root `package.json`:

```json
"release:plan": "node scripts/create-plugin-release-plan.mjs"
```

- [ ] **Step 6: Run tests and CLI**

Run:

```powershell
npm.cmd test -- scripts/test/plugin-release-plan.test.mjs
npm.cmd run build
npm.cmd run release:plan
```

Expected: tests PASS, build PASS, `artifacts/plugin-release-plan.json` exists.

- [ ] **Step 7: Commit**

```powershell
git add package.json scripts/lib/plugin-release-plan.mjs scripts/test/plugin-release-plan.test.mjs scripts/create-plugin-release-plan.mjs
git commit -m "feat: plan stable plugin releases"
```

---

### Task 3: GitHub Plugin Release Publisher

**Files:**
- Create: `C:\Users\reece\VSCodeProjects\edgegamers-s2s\scripts\publish-github-plugin-releases.mjs`
- Create: `C:\Users\reece\VSCodeProjects\edgegamers-s2s\scripts\test\publish-github-plugin-releases.test.mjs`
- Modify: `C:\Users\reece\VSCodeProjects\edgegamers-s2s\package.json`

**Interfaces:**
- Produces: `buildGhReleaseCommands({ plan, repository }): Array<{ command: "gh", args: string[] }>`
- CLI: `npm run release:github-plugins` reads `artifacts/plugin-release-plan.json`.

- [ ] **Step 1: Write failing publisher tests**

Create `scripts/test/publish-github-plugin-releases.test.mjs`:

```js
import { describe, expect, it } from "vitest";
import { buildGhReleaseCommands } from "../publish-github-plugin-releases.mjs";

describe("buildGhReleaseCommands", () => {
  it("creates stable-named GitHub release assets", () => {
    const commands = buildGhReleaseCommands({
      repository: "edgegamers/edgegamers-s2s",
      plan: {
        schemaVersion: 1,
        releases: [
          {
            packageName: "@edgegamers/reference-api",
            version: "1.2.3",
            releaseTag: "plugin/reference-api/v1.2.3",
            assetName: "reference-api.s2sp",
            artifactPath: "plugins/reference-api/dist/reference-api.s2sp",
            sha256: "a".repeat(64),
            publishToRegistry: false,
          },
        ],
      },
    });

    expect(commands[0].args).toEqual([
      "release",
      "create",
      "plugin/reference-api/v1.2.3",
      "plugins/reference-api/dist/reference-api.s2sp#reference-api.s2sp",
      "--repo",
      "edgegamers/edgegamers-s2s",
      "--title",
      "@edgegamers/reference-api v1.2.3",
      "--notes",
      "SHA-256: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "--latest=false",
    ]);
  });
});
```

- [ ] **Step 2: Run targeted test and verify failure**

Run:

```powershell
npm.cmd test -- scripts/test/publish-github-plugin-releases.test.mjs
```

Expected: FAIL because the publisher does not exist.

- [ ] **Step 3: Implement publisher exports**

Create `scripts/publish-github-plugin-releases.mjs` with:

```js
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export function buildGhReleaseCommands({ plan, repository }) {
  if (plan.schemaVersion !== 1) {
    throw new Error("Unsupported plugin release plan schema");
  }
  return plan.releases.map((release) => ({
    command: "gh",
    args: [
      "release",
      "create",
      release.releaseTag,
      `${release.artifactPath}#${release.assetName}`,
      "--repo",
      repository,
      "--title",
      `${release.packageName} v${release.version}`,
      "--notes",
      `SHA-256: ${release.sha256}`,
      "--latest=false",
    ],
  }));
}

export function main({
  root = process.cwd(),
  env = process.env,
  execFile = execFileSync,
} = {}) {
  const repository = env.GITHUB_REPOSITORY;
  if (!repository) throw new Error("GITHUB_REPOSITORY is required");
  const plan = JSON.parse(
    readFileSync(join(root, "artifacts", "plugin-release-plan.json"), "utf8"),
  );
  for (const command of buildGhReleaseCommands({ plan, repository })) {
    execFile(command.command, command.args, { cwd: root, stdio: "inherit" });
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

Add:

```json
"release:github-plugins": "node scripts/publish-github-plugin-releases.mjs"
```

- [ ] **Step 5: Run targeted tests**

Run:

```powershell
npm.cmd test -- scripts/test/publish-github-plugin-releases.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add package.json scripts/publish-github-plugin-releases.mjs scripts/test/publish-github-plugin-releases.test.mjs
git commit -m "feat: publish github plugin assets"
```

---

### Task 4: EdgeGamers Plugin Release Workflow

**Files:**
- Modify: `C:\Users\reece\VSCodeProjects\edgegamers-s2s\.github\workflows\release.yml`
- Modify: `C:\Users\reece\VSCodeProjects\edgegamers-s2s\scripts\test\github-workflows.test.mjs`
- Modify: `C:\Users\reece\VSCodeProjects\edgegamers-s2s\docs\releases.md`

**Interfaces:**
- Consumes: `npm run release:plan`, `npm run release:github-plugins`.
- Produces: main workflow that creates GitHub plugin release assets and only publishes registry opt-ins.

- [ ] **Step 1: Add failing workflow assertions**

In `scripts/test/github-workflows.test.mjs`, update the release workflow test to require:

```js
for (const required of [
  "npm run release:plan",
  "npm run release:github-plugins",
  "GH_TOKEN: ${{ github.token }}",
  "permissions:",
  "contents: write",
]) {
  expect(release).toContain(required);
}
```

Keep the existing assertions that `S2SCRIPT_TOKEN` appears only on the registry deploy step.

- [ ] **Step 2: Run targeted workflow test and verify failure**

Run:

```powershell
npm.cmd test -- scripts/test/github-workflows.test.mjs
```

Expected: FAIL because the workflow does not create GitHub plugin releases yet.

- [ ] **Step 3: Update `release.yml` permissions**

Change:

```yaml
permissions:
  contents: read
```

to:

```yaml
permissions:
  contents: write
```

- [ ] **Step 4: Add release plan and GitHub publish steps**

After `Build Source2Script workspace`, add:

```yaml
      - name: Create plugin release plan
        run: npm run release:plan

      - name: Publish GitHub plugin releases
        env:
          GH_TOKEN: ${{ github.token }}
        run: npm run release:github-plugins
```

- [ ] **Step 5: Keep registry publication separate**

Keep:

```yaml
      - name: Deploy Source2Script packages
        if: steps.detect.outputs.has-changesets == 'true'
        env:
          S2SCRIPT_TOKEN: ${{ secrets.S2SCRIPT_TOKEN }}
        run: npm run deploy -- --ci
```

Add a workflow assertion that `S2SCRIPT_TOKEN` appears only inside the `Deploy Source2Script packages` step. Keep registry credentials scoped to that single step.

- [ ] **Step 6: Update release docs**

In `docs/releases.md`, replace the production boundary language with:

```md
On `main`, the repository builds `.s2sp` files and creates GitHub release
assets for every released plugin. The asset file name is stable:
`<plugin-name>.s2sp`. Server repositories resolve those GitHub releases at
tag time.

Plugins with `edgegamers.release.publishToRegistry: true` may also publish to
the Source2Script registry. EdgeGamers servers still install EdgeGamers plugins
from GitHub release assets.
```

- [ ] **Step 7: Run tests**

Run:

```powershell
npm.cmd test -- scripts/test/github-workflows.test.mjs
```

Expected: PASS.

- [ ] **Step 8: Commit**

```powershell
git add .github/workflows/release.yml scripts/test/github-workflows.test.mjs docs/releases.md
git commit -m "ci: publish plugin release assets"
```

---

### Task 5: Development Reconcile Enabled And Disabled Paths

**Files:**
- Modify: `C:\Users\reece\VSCodeProjects\edgegamers-s2s\scripts\lib\development-manifest.mjs`
- Modify: `C:\Users\reece\VSCodeProjects\edgegamers-s2s\scripts\lib\development-reconcile.mjs`
- Modify: `C:\Users\reece\VSCodeProjects\edgegamers-s2s\scripts\deploy-development-artifacts.mjs`
- Modify: `C:\Users\reece\VSCodeProjects\edgegamers-s2s\scripts\test\development-manifest.test.mjs`
- Modify: `C:\Users\reece\VSCodeProjects\edgegamers-s2s\scripts\test\development-reconcile.test.mjs`
- Modify: `C:\Users\reece\VSCodeProjects\edgegamers-s2s\scripts\test\deploy-development-artifacts.test.mjs`

**Interfaces:**
- Manifest plugin entry adds `enabled: true` and `installPath: "enabled"` by default.
- `planManagedReconcile` returns `{ deletePaths: string[], copyEntries: Array<{ fileName, installPath }> }`.

- [ ] **Step 1: Add failing manifest assertions**

In `development-manifest.test.mjs`, expect each plugin entry to include:

```js
enabled: true,
installPath: "enabled",
```

- [ ] **Step 2: Add failing reconcile tests**

In `development-reconcile.test.mjs`, add:

```js
it("moves disabled plugins into the disabled directory", () => {
  const next = manifest(["alpha"]);
  next.plugins[0].enabled = false;
  next.plugins[0].installPath = "disabled";

  expect(
    planManagedReconcile({
      previousManifest: undefined,
      nextManifest: next,
    }),
  ).toEqual({
    deletePaths: [],
    copyEntries: [{ fileName: "alpha.s2sp", installPath: "disabled" }],
  });
});

it("deletes stale managed files from enabled and disabled paths", () => {
  const previous = manifest(["old"]);
  previous.plugins[0].installPath = "disabled";

  expect(
    planManagedReconcile({
      previousManifest: previous,
      nextManifest: manifest(["new"]),
    }).deletePaths,
  ).toEqual(["disabled/old.s2sp"]);
});
```

- [ ] **Step 3: Run targeted tests and verify failure**

Run:

```powershell
npm.cmd test -- scripts/test/development-manifest.test.mjs scripts/test/development-reconcile.test.mjs
```

Expected: FAIL because enabled and disabled state are not represented yet.

- [ ] **Step 4: Update manifest creation**

Add to each returned dev plugin entry:

```js
enabled: true,
installPath: "enabled",
```

- [ ] **Step 5: Update reconcile path helpers**

In `development-reconcile.mjs`, add:

```js
function managedRelativePath(plugin) {
  const installPath = plugin.installPath ?? (plugin.enabled === false ? "disabled" : "enabled");
  if (installPath === "enabled") return plugin.fileName;
  if (installPath === "disabled") return `disabled/${plugin.fileName}`;
  throw new Error(`Unsupported plugin install path: ${installPath}`);
}
```

Use `managedRelativePath` for stale deletion and copy planning.

- [ ] **Step 6: Update remote deploy script**

In `buildRemoteScript`, make the remote Node block:

1. Create `join(pluginDir, "disabled")`.
2. Copy enabled files to `join(pluginDir, fileName)`.
3. Copy disabled files to `join(pluginDir, "disabled", fileName)`.
4. Delete previous managed paths from both enabled and disabled locations.

- [ ] **Step 7: Run targeted tests**

Run:

```powershell
npm.cmd test -- scripts/test/development-manifest.test.mjs scripts/test/development-reconcile.test.mjs scripts/test/deploy-development-artifacts.test.mjs
```

Expected: PASS.

- [ ] **Step 8: Commit**

```powershell
git add scripts/lib/development-manifest.mjs scripts/lib/development-reconcile.mjs scripts/deploy-development-artifacts.mjs scripts/test/development-manifest.test.mjs scripts/test/development-reconcile.test.mjs scripts/test/deploy-development-artifacts.test.mjs
git commit -m "feat: support disabled dev plugins"
```

---

### Task 6: Runtime Manifest Reconcile

**Files:**
- Create: `C:\Users\reece\VSCodeProjects\s2script-runtime-image\scripts\reconcile-s2script-release-manifest`
- Modify: `C:\Users\reece\VSCodeProjects\s2script-runtime-image\scripts\install-s2script-plugins`
- Modify: `C:\Users\reece\VSCodeProjects\s2script-runtime-image\scripts\source2-runtime-apply`
- Modify: `C:\Users\reece\VSCodeProjects\s2script-runtime-image\Dockerfile`
- Create: `C:\Users\reece\VSCodeProjects\s2script-runtime-image\tests\reconcile-release-manifest.test.sh`
- Modify: `C:\Users\reece\VSCodeProjects\s2script-runtime-image\scripts\validate.sh`
- Modify: `C:\Users\reece\VSCodeProjects\s2script-runtime-image\README.md`

**Interfaces:**
- Environment default: `S2SCRIPT_RELEASE_MANIFEST_FILE=/srv/source2/server/server-release-manifest.json`.
- CLI: `reconcile-s2script-release-manifest <game-dir> <manifest-file>`.
- Managed manifest path: `<game-dir>/addons/s2script/plugins/.edgegamers-s2script-managed.json`.

- [ ] **Step 1: Write failing shell test**

Create `tests/reconcile-release-manifest.test.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export PATH="$ROOT/scripts:$PATH"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

game_dir="$tmp/game"
asset_dir="$tmp/assets"
mkdir -p "$game_dir/addons/s2script/plugins/manual" "$asset_dir"
printf 'enabled-v1' > "$asset_dir/enabled.s2sp"
printf 'disabled-v1' > "$asset_dir/disabled.s2sp"
printf 'manual' > "$game_dir/addons/s2script/plugins/manual/manual.s2sp"

enabled_sha="$(sha256sum "$asset_dir/enabled.s2sp" | cut -d ' ' -f 1)"
disabled_sha="$(sha256sum "$asset_dir/disabled.s2sp" | cut -d ' ' -f 1)"

cat > "$tmp/manifest.json" <<JSON
{
  "schemaVersion": 1,
  "server": "test",
  "releaseTag": "26.08.08",
  "plugins": [
    {
      "name": "@edgegamers/enabled",
      "installFileName": "enabled.s2sp",
      "enabled": true,
      "sha256": "$enabled_sha",
      "downloadUrl": "file://$asset_dir/enabled.s2sp"
    },
    {
      "name": "@edgegamers/disabled",
      "installFileName": "disabled.s2sp",
      "enabled": false,
      "sha256": "$disabled_sha",
      "downloadUrl": "file://$asset_dir/disabled.s2sp"
    }
  ]
}
JSON

reconcile-s2script-release-manifest "$game_dir" "$tmp/manifest.json"

test -f "$game_dir/addons/s2script/plugins/enabled.s2sp"
test -f "$game_dir/addons/s2script/plugins/disabled/disabled.s2sp"
test -f "$game_dir/addons/s2script/plugins/manual/manual.s2sp"
test -f "$game_dir/addons/s2script/plugins/.edgegamers-s2script-managed.json"

cat > "$tmp/manifest2.json" <<JSON
{
  "schemaVersion": 1,
  "server": "test",
  "releaseTag": "26.08.09",
  "plugins": []
}
JSON

reconcile-s2script-release-manifest "$game_dir" "$tmp/manifest2.json"

test ! -f "$game_dir/addons/s2script/plugins/enabled.s2sp"
test ! -f "$game_dir/addons/s2script/plugins/disabled/disabled.s2sp"
test -f "$game_dir/addons/s2script/plugins/manual/manual.s2sp"

echo "release manifest reconcile tests passed"
```

- [ ] **Step 2: Run test and verify failure**

Run from `s2script-runtime-image`:

```powershell
bash tests/reconcile-release-manifest.test.sh
```

Expected: FAIL because the reconcile script does not exist.

- [ ] **Step 3: Implement reconcile script**

Create `scripts/reconcile-s2script-release-manifest` as a Bash wrapper that calls `node` with arguments `<game-dir> <manifest-file>`. The Node block must:

1. Reject missing `schemaVersion: 1`.
2. Reject `installFileName` containing `/` or `\`.
3. Support `file://` and `https://` download URLs.
4. Verify SHA-256 before replacement.
5. Write temp files under the target directory.
6. Rename temp files into enabled or disabled target paths.
7. Delete stale paths named in the previous managed manifest.
8. Preserve unmanaged files.

- [ ] **Step 4: Wire startup preference**

In `source2-runtime-apply`, replace the plugin install block with:

```bash
if [ "${S2SCRIPT_INSTALL_PLUGINS:-true}" = "true" ]; then
  release_manifest="${S2SCRIPT_RELEASE_MANIFEST_FILE:-$server_dir/server-release-manifest.json}"
  if [ -f "$release_manifest" ]; then
    reconcile-s2script-release-manifest "$game_dir" "$release_manifest"
  else
    install-s2script-plugins "$game_dir" "${S2SCRIPT_PLUGIN_LIST_FILE:-$server_dir/s2script-plugins.txt}"
  fi
fi
```

- [ ] **Step 5: Add Dockerfile default**

Add to the `ENV` block:

```dockerfile
    S2SCRIPT_RELEASE_MANIFEST_FILE=/srv/source2/server/server-release-manifest.json \
```

- [ ] **Step 6: Update validation**

In `scripts/validate.sh`, add:

```bash
grep -q 'S2SCRIPT_RELEASE_MANIFEST_FILE' Dockerfile README.md scripts/source2-runtime-apply
"$BASH_BIN" tests/reconcile-release-manifest.test.sh
```

- [ ] **Step 7: Run runtime validation**

Run from `s2script-runtime-image`:

```powershell
bash scripts/validate.sh
```

Expected: PASS.

- [ ] **Step 8: Commit**

```powershell
git add Dockerfile README.md scripts/source2-runtime-apply scripts/install-s2script-plugins scripts/reconcile-s2script-release-manifest scripts/validate.sh tests/reconcile-release-manifest.test.sh
git commit -m "feat: reconcile release manifest plugins"
```

---

### Task 7: Empty Server Plugin Intent And Manifest Resolver

**Files:**
- Create: `C:\Users\reece\VSCodeProjects\empty-s2s\server-plugins.json`
- Modify: `C:\Users\reece\VSCodeProjects\empty-s2s\Dockerfile`
- Create: `C:\Users\reece\VSCodeProjects\empty-s2s\scripts\lib\server-plugin-intent.mjs`
- Create: `C:\Users\reece\VSCodeProjects\empty-s2s\scripts\lib\server-release-manifest.mjs`
- Create: `C:\Users\reece\VSCodeProjects\empty-s2s\scripts\test\server-plugin-intent.test.mjs`
- Create: `C:\Users\reece\VSCodeProjects\empty-s2s\scripts\test\server-release-manifest.test.mjs`
- Create: `C:\Users\reece\VSCodeProjects\empty-s2s\package.json`
- Create: `C:\Users\reece\VSCodeProjects\empty-s2s\package-lock.json`
- Modify: `C:\Users\reece\VSCodeProjects\empty-s2s\scripts\validate.sh`

**Interfaces:**
- Intent schema: `{ "plugins": [{ "name": string, "enabled": boolean }] }`.
- Produces: `parsePluginIntent(jsonText)`.
- Produces: `createServerReleaseManifest({ server, releaseTag, serverCommit, plugins, runtimeImage })`.

- [ ] **Step 1: Add `server-plugins.json`**

Create:

```json
{
  "plugins": []
}
```

- [ ] **Step 2: Add local Node test runner**

Create `package.json`:

```json
{
  "name": "@edgegamers/empty-s2s-release-tools",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run --globals"
  },
  "devDependencies": {
    "vitest": "4.1.10"
  }
}
```

Run:

```powershell
npm.cmd install
```

Expected: `package-lock.json` is created.

- [ ] **Step 3: Write intent tests**

Create `scripts/test/server-plugin-intent.test.mjs`:

```js
import { describe, expect, it } from "vitest";
import { parsePluginIntent } from "../lib/server-plugin-intent.mjs";

describe("parsePluginIntent", () => {
  it("accepts versionless enabled and disabled plugin intent", () => {
    expect(
      parsePluginIntent(
        JSON.stringify({
          plugins: [
            { name: "@edgegamers/common-admin", enabled: true },
            { name: "@edgegamers/common-exp", enabled: false },
          ],
        }),
      ),
    ).toEqual([
      { name: "@edgegamers/common-admin", enabled: true },
      { name: "@edgegamers/common-exp", enabled: false },
    ]);
  });

  it("rejects hard-coded versions in intent", () => {
    expect(() =>
      parsePluginIntent(
        JSON.stringify({
          plugins: [{ name: "@edgegamers/common-admin", version: "1.0.0" }],
        }),
      ),
    ).toThrow("Plugin intent must not contain versions");
  });
});
```

- [ ] **Step 4: Write manifest tests**

Create `scripts/test/server-release-manifest.test.mjs`:

```js
import { describe, expect, it } from "vitest";
import { createServerReleaseManifest } from "../lib/server-release-manifest.mjs";

describe("createServerReleaseManifest", () => {
  it("records stable install file names and enabled state", () => {
    const manifest = createServerReleaseManifest({
      server: "empty-s2s",
      releaseTag: "26.08.08",
      serverCommit: "abc123",
      runtimeImage: {
        image: "ghcr.io/s2script/s2script-runtime-image",
        digest: "sha256:" + "a".repeat(64),
      },
      plugins: [
        {
          name: "@edgegamers/common-admin",
          version: "1.2.3",
          releaseTag: "plugin/common-admin/v1.2.3",
          assetName: "common-admin.s2sp",
          installFileName: "common-admin.s2sp",
          enabled: true,
          sha256: "b".repeat(64),
          downloadUrl: "https://example.test/common-admin.s2sp",
        },
      ],
    });

    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.plugins[0].installFileName).toBe("common-admin.s2sp");
  });
});
```

- [ ] **Step 5: Run tests and verify failure**

Run from `empty-s2s`:

```powershell
npm.cmd test -- scripts/test/server-plugin-intent.test.mjs scripts/test/server-release-manifest.test.mjs
```

Expected: FAIL because the parser and manifest modules do not exist.

- [ ] **Step 6: Implement intent parser**

Implement `parsePluginIntent` so it:

1. Parses JSON.
2. Requires `plugins` array.
3. Requires each `name` to start with `@edgegamers/`.
4. Rejects any `version`, `releaseTag`, `downloadUrl`, or `sha256` field.
5. Defaults `enabled` to `true` only when absent.
6. Rejects duplicate plugin names.

- [ ] **Step 7: Implement manifest builder**

Implement `createServerReleaseManifest` so it:

1. Requires `releaseTag` to match `/^\d{2}\.\d{2}\.\d{2}(?:-HOTPATCH-\d+)?$/u`.
2. Requires stable `installFileName` ending in `.s2sp`.
3. Rejects path separators in `installFileName`.
4. Sorts plugins by name.
5. Returns `schemaVersion: 1`.

- [ ] **Step 8: Copy intent into payload**

In `Dockerfile`, add:

```dockerfile
COPY server-plugins.json /payload/server-plugins.json
```

- [ ] **Step 9: Update validation**

In `scripts/validate.sh`, add:

```bash
test -f server-plugins.json
grep -q 'COPY server-plugins.json /payload/server-plugins.json' Dockerfile
npm test
```

- [ ] **Step 10: Run validation**

Run from `empty-s2s`:

```powershell
bash scripts/validate.sh
```

Expected: PASS.

- [ ] **Step 11: Commit**

```powershell
git add Dockerfile server-plugins.json scripts/lib scripts/test scripts/validate.sh package.json package-lock.json
git commit -m "feat: add common plugin intent"
```

---

### Task 8: Empty Server Tag Release Pipeline

**Files:**
- Create: `C:\Users\reece\VSCodeProjects\empty-s2s\scripts\resolve-server-release.mjs`
- Modify: `C:\Users\reece\VSCodeProjects\empty-s2s\.gitlab-ci.yml`
- Modify: `C:\Users\reece\VSCodeProjects\empty-s2s\scripts\validate.sh`
- Modify: `C:\Users\reece\VSCodeProjects\empty-s2s\README.md`
- Modify: `C:\Users\reece\VSCodeProjects\empty-s2s\docs\system-design.md`

**Interfaces:**
- CLI: `node scripts/resolve-server-release.mjs --server empty-s2s --tag "$CI_COMMIT_TAG" --commit "$CI_COMMIT_SHA" --out server-release-manifest.json`.
- Consumes GitHub plugin releases through `GH_TOKEN` or unauthenticated public API where possible.
- Produces: `server-release-manifest.json`.

- [ ] **Step 1: Implement resolver CLI around Task 7 helpers**

The CLI must:

1. Read `server-plugins.json`.
2. Resolve each plugin name to the latest GitHub release whose tag starts with `plugin/<unscoped-name>/v`.
3. Read the release asset named `<unscoped-name>.s2sp`.
4. Download the asset bytes or read release asset digest metadata when available.
5. Compute or record SHA-256.
6. Write `server-release-manifest.json`.

- [ ] **Step 2: Add tag validation to GitLab CI**

Add a `release_manifest` job:

```yaml
release_manifest:
  stage: build
  image: node:24
  script:
    - test -n "$CI_COMMIT_TAG"
    - echo "$CI_COMMIT_TAG" | grep -Eq '^[0-9]{2}[.][0-9]{2}[.][0-9]{2}(-HOTPATCH-[0-9]+)?$'
    - test "$(git branch -r --contains "$CI_COMMIT_SHA" | grep -c 'origin/main')" -gt 0
    - npm ci
    - node scripts/resolve-server-release.mjs --server empty-s2s --tag "$CI_COMMIT_TAG" --commit "$CI_COMMIT_SHA" --out server-release-manifest.json
  artifacts:
    paths:
      - server-release-manifest.json
    expire_in: never
  rules:
    - if: '$CI_COMMIT_TAG'
```

- [ ] **Step 3: Add production deploy for tags**

Add `deploy_prod` using the existing deploy template with:

```yaml
rules:
  - if: '$CI_COMMIT_TAG'
```

and `DEPLOY_PAYLOAD_IMAGE` pointing at the tag image.

- [ ] **Step 4: Upload and copy release manifest to server payload path**

Before the existing remote SSH deploy script, upload:

```sh
scp server-release-manifest.json "$DEPLOY_USER@$DEPLOY_HOST:$DEPLOY_PATH/server-release-manifest.json"
```

Inside the remote SSH deploy script, after `mv '$DEPLOY_PATH/payload.next' '$DEPLOY_PATH/payload'` and before `docker compose up`, add:

```sh
cp "$DEPLOY_PATH/server-release-manifest.json" "$DEPLOY_PATH/payload/server-release-manifest.json"
```

- [ ] **Step 5: Update validation**

Have `scripts/validate.sh` assert:

```bash
grep -q 'release_manifest:' .gitlab-ci.yml
grep -q 'server-release-manifest.json' .gitlab-ci.yml
grep -Eq 'CI_COMMIT_TAG' .gitlab-ci.yml
```

- [ ] **Step 6: Run validation**

Run from `empty-s2s`:

```powershell
bash scripts/validate.sh
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add .gitlab-ci.yml README.md docs/system-design.md scripts/resolve-server-release.mjs scripts/validate.sh
git commit -m "ci: add empty server release tags"
```

---

### Task 9: TTT Child Plugin Intent And Common Merge

**Files:**
- Create: `C:\Users\reece\VSCodeProjects\ttt-s2s\server-plugins.json`
- Modify: `C:\Users\reece\VSCodeProjects\ttt-s2s\Dockerfile`
- Create: `C:\Users\reece\VSCodeProjects\ttt-s2s\scripts\lib\server-plugin-intent.mjs`
- Create: `C:\Users\reece\VSCodeProjects\ttt-s2s\scripts\lib\server-release-manifest.mjs`
- Create: `C:\Users\reece\VSCodeProjects\ttt-s2s\scripts\test\server-plugin-intent.test.mjs`
- Create: `C:\Users\reece\VSCodeProjects\ttt-s2s\scripts\test\server-release-manifest.test.mjs`
- Create: `C:\Users\reece\VSCodeProjects\ttt-s2s\package.json`
- Create: `C:\Users\reece\VSCodeProjects\ttt-s2s\package-lock.json`
- Modify: `C:\Users\reece\VSCodeProjects\ttt-s2s\scripts\validate.sh`

**Interfaces:**
- Produces: `mergePluginIntent({ common, child })` where child entries override common entries by `name`.

- [ ] **Step 1: Add child intent file**

Create:

```json
{
  "plugins": []
}
```

- [ ] **Step 2: Add local Node test runner**

Create `package.json`:

```json
{
  "name": "@edgegamers/ttt-s2s-release-tools",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run --globals"
  },
  "devDependencies": {
    "vitest": "4.1.10"
  }
}
```

Run:

```powershell
npm.cmd install
```

Expected: `package-lock.json` is created.

- [ ] **Step 3: Write merge test**

Create `scripts/test/server-plugin-intent.test.mjs` with:

```js
import { describe, expect, it } from "vitest";
import { mergePluginIntent, parsePluginIntent } from "../lib/server-plugin-intent.mjs";

describe("mergePluginIntent", () => {
  it("lets child intent override common intent by plugin name", () => {
    expect(
      mergePluginIntent({
        common: [
          { name: "@edgegamers/common-admin", enabled: true },
          { name: "@edgegamers/shared-exp", enabled: true },
        ],
        child: [
          { name: "@edgegamers/shared-exp", enabled: false },
          { name: "@edgegamers/ttt", enabled: true },
        ],
      }),
    ).toEqual([
      { name: "@edgegamers/common-admin", enabled: true },
      { name: "@edgegamers/shared-exp", enabled: false },
      { name: "@edgegamers/ttt", enabled: true },
    ]);
  });
});
```

- [ ] **Step 4: Implement parser behavior**

Implement `parsePluginIntent` so it parses JSON, requires a `plugins` array, rejects version and release fields, defaults missing `enabled` to `true`, and rejects duplicate names.

- [ ] **Step 5: Implement `mergePluginIntent`**

Use:

```js
export function mergePluginIntent({ common, child }) {
  const byName = new Map();
  for (const plugin of common) byName.set(plugin.name, plugin);
  for (const plugin of child) byName.set(plugin.name, plugin);
  return [...byName.values()].sort((left, right) =>
    left.name.localeCompare(right.name),
  );
}
```

- [ ] **Step 6: Copy child intent into payload**

In `Dockerfile`, add:

```dockerfile
COPY server-plugins.json /payload/server-plugins.ttt.json
```

- [ ] **Step 7: Update validation**

In `scripts/validate.sh`, add:

```bash
test -f server-plugins.json
grep -q 'COPY server-plugins.json /payload/server-plugins.ttt.json' Dockerfile
npm test
```

- [ ] **Step 8: Run validation**

Run from `ttt-s2s`:

```powershell
bash scripts/validate.sh
```

Expected: PASS.

- [ ] **Step 9: Commit**

```powershell
git add Dockerfile server-plugins.json scripts/lib scripts/test scripts/validate.sh package.json package-lock.json
git commit -m "feat: add ttt plugin intent"
```

---

### Task 10: TTT Tag Resolver And Dev Common Adoption

**Files:**
- Create: `C:\Users\reece\VSCodeProjects\ttt-s2s\scripts\resolve-server-release.mjs`
- Modify: `C:\Users\reece\VSCodeProjects\ttt-s2s\.gitlab-ci.yml`
- Modify: `C:\Users\reece\VSCodeProjects\ttt-s2s\scripts\validate.sh`
- Modify: `C:\Users\reece\VSCodeProjects\ttt-s2s\README.md`
- Modify: `C:\Users\reece\VSCodeProjects\ttt-s2s\DEPLOYMENT_SETUP.md`
- Modify: `C:\Users\reece\VSCodeProjects\ttt-s2s\docs\system-design.md`

**Interfaces:**
- CLI: `node scripts/resolve-server-release.mjs --server ttt-s2s --tag "$CI_COMMIT_TAG" --commit "$CI_COMMIT_SHA" --out server-release-manifest.json`.
- Consumes: latest tagged `empty-s2s` release manifest.
- Produces: child `server-release-manifest.json` with embedded `emptyS2s` metadata.

- [ ] **Step 1: Implement child resolver CLI**

The CLI must:

1. Resolve the latest `empty-s2s` GitLab release/tag artifact.
2. Read common `server-plugins.json` or common release manifest plugin intent.
3. Read local `server-plugins.json`.
4. Merge common and child intent using `mergePluginIntent`.
5. Resolve latest GitHub release asset for each plugin.
6. Write `server-release-manifest.json`.

- [ ] **Step 2: Change dev base image selection**

In `.gitlab-ci.yml`, make the dev build resolve the latest tagged `empty-s2s` image instead of hard-coding `EMPTY_S2S_TAG: "main"`.

Use a CI variable name:

```yaml
EMPTY_S2S_TAG: "$RESOLVED_EMPTY_S2S_TAG"
```

Add a `resolve_empty_dev` job that writes a dotenv artifact:

```yaml
resolve_empty_dev:
  stage: build
  image: alpine:3.20
  before_script:
    - apk add --no-cache curl jq
  script:
    - test -n "$GITLAB_API_TOKEN"
    - export RESOLVED_EMPTY_S2S_TAG="$(curl -fsSL --header "PRIVATE-TOKEN: $GITLAB_API_TOKEN" "$CI_API_V4_URL/projects/source2%2Fcs2%2Fservers%2Fempty-s2s/repository/tags?per_page=1&order_by=updated&sort=desc" | jq -r '.[0].name')"
    - test -n "$RESOLVED_EMPTY_S2S_TAG"
    - printf 'RESOLVED_EMPTY_S2S_TAG=%s\n' "$RESOLVED_EMPTY_S2S_TAG" > resolved-empty.env
  artifacts:
    reports:
      dotenv: resolved-empty.env
  rules:
    - if: '$CI_COMMIT_BRANCH == "dev"'
```

- [ ] **Step 3: Add child tag manifest job**

Add this `release_manifest` job:

```yaml
release_manifest:
  stage: build
  image: node:24
  script:
    - test -n "$CI_COMMIT_TAG"
    - echo "$CI_COMMIT_TAG" | grep -Eq '^[0-9]{2}[.][0-9]{2}[.][0-9]{2}(-HOTPATCH-[0-9]+)?$'
    - test "$(git branch -r --contains "$CI_COMMIT_SHA" | grep -c 'origin/main')" -gt 0
    - npm ci
    - node scripts/resolve-server-release.mjs --server ttt-s2s --tag "$CI_COMMIT_TAG" --commit "$CI_COMMIT_SHA" --out server-release-manifest.json
  artifacts:
    paths:
      - server-release-manifest.json
    expire_in: never
  rules:
    - if: '$CI_COMMIT_TAG'
```

- [ ] **Step 4: Restrict prod deploy to tags**

Change `deploy_prod.rules` to:

```yaml
rules:
  - if: '$CI_COMMIT_TAG'
```

Keep `deploy_dev` on `dev`.

- [ ] **Step 5: Copy child release manifest to prod payload**

Add deploy logic that places `server-release-manifest.json` at:

```text
/opt/cs2/ttt-s2s/payload/server-release-manifest.json
```

- [ ] **Step 6: Update validation**

Have `scripts/validate.sh` assert:

```bash
grep -q 'release_manifest:' .gitlab-ci.yml
grep -q 'server-release-manifest.json' .gitlab-ci.yml
grep -q 'CI_COMMIT_TAG' .gitlab-ci.yml
grep -q 'RESOLVED_EMPTY_S2S_TAG' .gitlab-ci.yml
```

- [ ] **Step 7: Run validation**

Run from `ttt-s2s`:

```powershell
bash scripts/validate.sh
```

Expected: PASS.

- [ ] **Step 8: Commit**

```powershell
git add .gitlab-ci.yml README.md DEPLOYMENT_SETUP.md docs/system-design.md scripts/resolve-server-release.mjs scripts/validate.sh
git commit -m "ci: add ttt release tags"
```

---

### Task 11: Cross-Repo Documentation And Setup Notes

**Files:**
- Modify: `C:\Users\reece\VSCodeProjects\edgegamers-s2s\docs\releases.md`
- Modify: `C:\Users\reece\VSCodeProjects\edgegamers-s2s\.github\MANUAL_SETUP.md`
- Modify: `C:\Users\reece\VSCodeProjects\empty-s2s\README.md`
- Modify: `C:\Users\reece\VSCodeProjects\ttt-s2s\README.md`
- Modify: `C:\Users\reece\VSCodeProjects\s2script-runtime-image\README.md`

**Interfaces:**
- Produces operator docs for required secrets, tag formats, and release order.

- [ ] **Step 1: Document release order**

Add this order to the relevant READMEs:

```md
1. Merge plugin changes through `edgegamers-s2s/main` with Changesets.
2. Let `edgegamers-s2s/main` create GitHub plugin release assets.
3. Merge common server changes to `empty-s2s/main`.
4. Tag `empty-s2s` with `YY.MM.DD`.
5. Let child dev servers auto-adopt the new common release.
6. Test child servers on `dev`.
7. Merge child server changes to `main`.
8. Tag the child server with `YY.MM.DD`.
```

- [ ] **Step 2: Document required credentials**

Add setup notes:

```md
- `edgegamers-s2s` GitHub Actions needs `contents: write` and `S2SCRIPT_TOKEN` for registry opt-ins.
- Server GitLab tag resolvers need a token that can read EdgeGamers GitHub releases.
- Child server GitLab tag resolvers need a token that can read `empty-s2s` release artifacts.
- Production deploy jobs need SSH deploy credentials for their server path.
```

- [ ] **Step 3: Document hotpatch tags**

Add:

```md
Use `YY.MM.DD-HOTPATCH-N` when the date tag already exists.
```

- [ ] **Step 4: Run docs grep checks**

Run:

```powershell
rg -n "YY\\.MM\\.DD|HOTPATCH|server-release-manifest|GitHub release assets|disabled" C:\Users\reece\VSCodeProjects\edgegamers-s2s\docs C:\Users\reece\VSCodeProjects\empty-s2s C:\Users\reece\VSCodeProjects\ttt-s2s C:\Users\reece\VSCodeProjects\s2script-runtime-image\README.md
```

Expected: output shows each key term in the updated docs.

- [ ] **Step 5: Commit docs in each changed repo**

Commit per repo:

```powershell
git -C C:\Users\reece\VSCodeProjects\edgegamers-s2s add docs/releases.md .github/MANUAL_SETUP.md
git -C C:\Users\reece\VSCodeProjects\edgegamers-s2s commit -m "docs: describe tag release setup"
git -C C:\Users\reece\VSCodeProjects\empty-s2s add README.md
git -C C:\Users\reece\VSCodeProjects\empty-s2s commit -m "docs: describe common release tags"
git -C C:\Users\reece\VSCodeProjects\ttt-s2s add README.md
git -C C:\Users\reece\VSCodeProjects\ttt-s2s commit -m "docs: describe ttt release tags"
git -C C:\Users\reece\VSCodeProjects\s2script-runtime-image add README.md
git -C C:\Users\reece\VSCodeProjects\s2script-runtime-image commit -m "docs: describe release manifest plugins"
```

---

### Task 12: Final Verification

**Files:**
- Modify: `C:\Users\reece\VSCodeProjects\edgegamers-s2s\docs\implementation-status.md`

**Interfaces:**
- Produces: final verification evidence for all changed repos.

- [ ] **Step 1: Verify `edgegamers-s2s`**

Run:

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
npm.cmd run release:plan
```

Expected: all commands exit 0.

- [ ] **Step 2: Verify `s2script-runtime-image`**

Run:

```powershell
bash scripts/validate.sh
```

Expected: exits 0 and prints `release manifest reconcile tests passed`.

- [ ] **Step 3: Verify `empty-s2s`**

Run:

```powershell
bash scripts/validate.sh
```

Expected: exits 0.

- [ ] **Step 4: Verify `ttt-s2s`**

Run:

```powershell
bash scripts/validate.sh
```

Expected: exits 0.

- [ ] **Step 5: Build Docker images when Docker is available**

Run:

```powershell
docker build --pull --progress plain -t s2script-runtime-image:release-manifest C:\Users\reece\VSCodeProjects\s2script-runtime-image
docker build --pull --progress plain -t empty-s2s:release-tags C:\Users\reece\VSCodeProjects\empty-s2s
docker build --pull --progress plain --build-arg EMPTY_S2S_IMAGE=empty-s2s:release-tags -t ttt-s2s:release-tags C:\Users\reece\VSCodeProjects\ttt-s2s
```

Expected: all builds pass when Docker is available. If Docker is unavailable, record the exact Docker error in the final status.

- [ ] **Step 6: Confirm old repos were not edited**

Run:

```powershell
git -C C:\Users\reece\VSCodeProjects\base status --short
git -C C:\Users\reece\VSCodeProjects\ttt status --short
```

Expected: no changes from this plan.

- [ ] **Step 7: Update implementation status**

In `edgegamers-s2s/docs/implementation-status.md`, add a short section named `Server release tags`. Include the exact commands from Steps 1-6 and the observed outcome for each command.

```md
## Server release tags

Status: implemented.

Verification:

- `edgegamers-s2s`: all listed npm validation commands exited 0.
- `s2script-runtime-image`: `bash scripts/validate.sh` exited 0.
- `empty-s2s`: `bash scripts/validate.sh` exited 0.
- `ttt-s2s`: `bash scripts/validate.sh` exited 0.
- Old repos `base` and `ttt`: unchanged.
```

- [ ] **Step 8: Commit status**

```powershell
git -C C:\Users\reece\VSCodeProjects\edgegamers-s2s add docs/implementation-status.md
git -C C:\Users\reece\VSCodeProjects\edgegamers-s2s commit -m "docs: record release tag verification"
```
