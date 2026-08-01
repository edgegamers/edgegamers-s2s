# EdgeGamers Source2Script Monorepo Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a reproducible local Source2Script monorepo foundation with native workspace commands, a verified sibling-interface example, testable repository-policy scripts, and contributor documentation.

**Architecture:** The root npm package is the only command surface and delegates plugin discovery, build order, versioning, and registry publication to Source2Script. Pure modules under `scripts/lib/` implement repository-specific policy; thin `.mjs` entry points handle filesystem, Git, console, and exit-code concerns. Two private plugins prove live sibling-interface resolution without creating publishable example products.

**Tech Stack:** Node.js 24.x, npm 11.x workspaces, TypeScript 5.9.3, Source2Script SDK 0.14.0, ESLint 10.8.0 with `@s2script/eslint-plugin` 0.2.0, Vitest 4.1.10, Changesets 2.31.1.

## Global Constraints

- Use Node.js 24.x and npm workspaces.
- Pin `@s2script/sdk` to `0.14.0`.
- Pin TypeScript to `5.9.3`; do not use TypeScript 7 until the official Source2Script lint stack supports it without peer overrides or runtime warnings.
- Use Source2Script-native `create`, `build`, `version`, and `deploy` behavior; do not add custom plugin discovery, dependency ordering, versioning, or registry publishing.
- Production publication ends at `s2s deploy`.
- Development artifacts use immutable `.s2sp` files and a development manifest; infrastructure transport and server reconciliation remain deferred.
- Keep the root and both reference plugins private.
- Do not create placeholder `packages/*` workspaces.
- Preserve the existing README branding and GitHub files.
- Use test-first red-green-refactor cycles for every executable behavior.

---

## File Map

### Root configuration

- `package.json`: workspace membership, pinned dependencies, and contributor commands.
- `package-lock.json`: reproducible npm dependency graph.
- `.nvmrc`: Node 24 selection.
- `.gitignore`: dependencies, SDK output, coverage, and generated manifests.
- `.gitattributes`: consistent text handling and generated binary classification.
- `tsconfig.base.json`: strict shared TypeScript settings.
- `eslint.config.mjs`: official Source2Script lint configuration.
- `.changeset/config.json`: release-intent policy for future publishable plugins.
- `.changeset/README.md`: short contributor pointer to the release guide.

### Policy scripts

- `scripts/lib/changeset-policy.mjs`: pure package-metadata parsing, Changeset parsing, and coverage evaluation.
- `scripts/check-changeset.mjs`: Git/filesystem adapter and human-readable CLI output.
- `scripts/lib/development-manifest.mjs`: pure artifact normalization, hashing, validation, and manifest assembly.
- `scripts/create-dev-manifest.mjs`: artifact discovery and manifest-writing CLI.
- `scripts/test/changeset-policy.test.mjs`: Changeset-policy behavior.
- `scripts/test/check-changeset.test.mjs`: real-filesystem CLI behavior with injected Git output.
- `scripts/test/development-manifest.test.mjs`: development-manifest behavior.
- `scripts/test/create-dev-manifest.test.mjs`: real-filesystem manifest-writing behavior.

### Reference plugins

- `plugins/reference-api/package.json`: private producer metadata and published-interface declaration.
- `plugins/reference-api/api.d.ts`: public runtime interface contract.
- `plugins/reference-api/src/greeting.ts`: portable implementation logic.
- `plugins/reference-api/src/plugin.ts`: Source2Script publisher adapter.
- `plugins/reference-api/test/greeting.test.ts`: portable producer behavior test.
- `plugins/reference-api/tsconfig.json`: producer compiler scope.
- `plugins/reference-api/README.md`: producer purpose and usage.
- `plugins/reference-consumer/package.json`: private consumer metadata and runtime dependency declaration.
- `plugins/reference-consumer/src/plugin.ts`: live sibling-interface consumer.
- `plugins/reference-consumer/tsconfig.json`: consumer compiler scope.
- `plugins/reference-consumer/README.md`: consumer purpose and usage.

### Contributor documentation

- `docs/navigation.md`: documentation index.
- `docs/getting-started.md`: prerequisites, install, and validation.
- `docs/architecture.md`: workspace boundaries and command ownership.
- `docs/plugin-development.md`: plugin creation, testing, and sibling interfaces.
- `docs/releases.md`: Changesets plus separate development and production paths.

---

### Task 1: Establish the pinned root workspace

**Files:**

- Create: `package.json`
- Create: `package-lock.json`
- Create: `.nvmrc`
- Create: `.gitignore`
- Create: `.gitattributes`
- Create: `tsconfig.base.json`
- Create: `eslint.config.mjs`
- Create: `.changeset/config.json`
- Create: `.changeset/README.md`

**Interfaces:**

- Produces root commands: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run changeset`, `npm run changeset:status`, `npm run changeset:check`, `npm run manifest:dev`, `npm run version`, and `npm run deploy`.
- Produces workspace globs: npm sees `plugins/*` and `packages/*`; Source2Script sees only `plugins/*`.
- Produces compiler contract: plugins extend `../../tsconfig.base.json`.

- [ ] **Step 1: Record the package and command surface**

Create `package.json` with exact versions so a clean install never resolves through `latest`:

```json
{
  "name": "@edgegamers/s2script-plugins",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "engines": {
    "node": ">=24 <25",
    "npm": ">=11"
  },
  "packageManager": "npm@11.16.0",
  "workspaces": [
    "plugins/*",
    "packages/*"
  ],
  "s2script": {
    "workspace": {
      "plugins": [
        "plugins/*"
      ]
    }
  },
  "scripts": {
    "create:plugin": "s2s create",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit -p tsconfig.base.json",
    "test": "vitest run",
    "test:watch": "vitest",
    "build": "s2s build",
    "changeset": "changeset",
    "changeset:status": "changeset status",
    "changeset:check": "node scripts/check-changeset.mjs",
    "manifest:dev": "node scripts/create-dev-manifest.mjs",
    "version": "s2s version",
    "deploy": "s2s deploy"
  },
  "devDependencies": {
    "@changesets/changelog-github": "0.7.0",
    "@changesets/cli": "2.31.1",
    "@s2script/cs2": "0.11.4",
    "@s2script/eslint-plugin": "0.2.0",
    "@s2script/sdk": "0.14.0",
    "@types/node": "24.13.3",
    "eslint": "10.8.0",
    "typescript": "5.9.3",
    "vitest": "4.1.10"
  }
}
```

- [ ] **Step 2: Add the shared TypeScript and ESLint configuration**

Create `tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noEmit": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "useUnknownInCatchVariables": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "allowImportingTsExtensions": true,
    "types": ["node"]
  },
  "include": [
    "plugins/*/src/**/*.ts",
    "plugins/*/test/**/*.ts",
    "plugins/*/*.d.ts"
  ],
  "exclude": ["**/dist/**", "**/node_modules/**", "**/.s2script/**"]
}
```

Create `eslint.config.mjs` using the SDK-generated configuration exactly:

```js
import s2script from "@s2script/eslint-plugin";

export default s2script.configs.recommended({
  tsconfigRootDir: import.meta.dirname,
});
```

- [ ] **Step 3: Add runtime pins and repository hygiene**

Create `.nvmrc` containing `24`.

Create `.gitignore`:

```gitignore
node_modules/
coverage/
artifacts/
dist/
**/dist/
**/.s2script/
*.s2sp
.DS_Store
```

Create `.gitattributes`:

```gitattributes
* text=auto
*.ts text eol=lf
*.mjs text eol=lf
*.json text eol=lf
*.md text eol=lf
*.yml text eol=lf
*.yaml text eol=lf
*.s2sp binary
```

- [ ] **Step 4: Configure Changesets**

Create `.changeset/config.json`:

```json
{
  "$schema": "https://unpkg.com/@changesets/config@3.1.1/schema.json",
  "changelog": [
    "@changesets/changelog-github",
    {
      "repo": "edgegamers/edgegamers-s2"
    }
  ],
  "commit": false,
  "fixed": [],
  "linked": [],
  "access": "public",
  "baseBranch": "main",
  "updateInternalDependencies": "patch",
  "ignore": [],
  "bumpVersionsWithWorkspaceProtocolOnly": false
}
```

Create `.changeset/README.md` with a link to `docs/releases.md` and state that private reference plugins do not receive Changesets.

- [ ] **Step 5: Install and verify the dependency graph**

Run:

```powershell
npm.cmd install
npm.cmd ls typescript @typescript-eslint/parser @s2script/sdk --all
npx.cmd tsc --version
```

Expected: install exits 0; `npm ls` reports no invalid peer dependencies; TypeScript reports `Version 5.9.3`.

- [ ] **Step 6: Commit the workspace foundation**

```powershell
git add package.json package-lock.json .nvmrc .gitignore .gitattributes tsconfig.base.json eslint.config.mjs .changeset
git commit -m "chore: establish Source2Script workspace"
```

---

### Task 2: Add testable Changeset coverage policy

**Files:**

- Create: `scripts/lib/changeset-policy.mjs`
- Create: `scripts/check-changeset.mjs`
- Create: `scripts/test/changeset-policy.test.mjs`
- Create: `scripts/test/check-changeset.test.mjs`

**Interfaces:**

- Produces `parseChangesetPackages(changesets: Array<{ path: string; content: string }>): Set<string>`.
- Produces `parsePluginMetadata(directory: string, content: string): { directory: string; name: string; private: boolean }`.
- Produces `evaluateChangesetCoverage(input: { changedFiles: string[]; plugins: Array<{ directory: string; name: string; private: boolean }>; coveredPackages: Set<string> }): { affectedPackages: string[]; missingPackages: string[] }`.
- CLI consumes `CHANGESET_BASE_REF` with default `origin/dev` and `ALLOW_MISSING_CHANGESET === "true"`.

- [ ] **Step 1: Write failing policy tests**

Create `scripts/test/changeset-policy.test.mjs`:

```js
import { describe, expect, it } from "vitest";
import {
  evaluateChangesetCoverage,
  parseChangesetPackages,
  parsePluginMetadata,
} from "../lib/changeset-policy.mjs";

const plugins = [
  { directory: "public-plugin", name: "@edgegamers/public-plugin", private: false },
  { directory: "private-plugin", name: "@edgegamers/private-plugin", private: true },
];

describe("evaluateChangesetCoverage", () => {
  it("does not require a Changeset when no publishable plugin changed", () => {
    expect(
      evaluateChangesetCoverage({
        changedFiles: ["README.md", "plugins/private-plugin/src/plugin.ts"],
        plugins,
        coveredPackages: new Set(),
      }),
    ).toEqual({ affectedPackages: [], missingPackages: [] });
  });

  it("reports every changed publishable plugin without a Changeset", () => {
    expect(
      evaluateChangesetCoverage({
        changedFiles: ["plugins/public-plugin/src/plugin.ts"],
        plugins,
        coveredPackages: new Set(),
      }),
    ).toEqual({
      affectedPackages: ["@edgegamers/public-plugin"],
      missingPackages: ["@edgegamers/public-plugin"],
    });
  });

  it("accepts a covered publishable plugin and normalizes Windows paths", () => {
    expect(
      evaluateChangesetCoverage({
        changedFiles: ["plugins\\public-plugin\\src\\plugin.ts"],
        plugins,
        coveredPackages: new Set(["@edgegamers/public-plugin"]),
      }),
    ).toEqual({
      affectedPackages: ["@edgegamers/public-plugin"],
      missingPackages: [],
    });
  });
});

describe("parseChangesetPackages", () => {
  it("reads package names from valid Changeset frontmatter", () => {
    expect(
      parseChangesetPackages([
        {
          path: ".changeset/bright-tools.md",
          content: '---\n"@edgegamers/public-plugin": minor\n---\n\nAdd commands.\n',
        },
      ]),
    ).toEqual(new Set(["@edgegamers/public-plugin"]));
  });

  it("rejects malformed release lines with the source path", () => {
    expect(() =>
      parseChangesetPackages([
        {
          path: ".changeset/broken.md",
          content: "---\n@edgegamers/public-plugin maybe\n---\n",
        },
      ]),
    ).toThrow(".changeset/broken.md");
  });
});

describe("parsePluginMetadata", () => {
  it("rejects a package without a name and identifies its directory", () => {
    expect(() => parsePluginMetadata("broken", '{"private":false}')).toThrow(
      "plugins/broken/package.json",
    );
  });
});
```

- [ ] **Step 2: Run the tests and verify RED**

Run:

```powershell
npm.cmd test -- scripts/test/changeset-policy.test.mjs
```

Expected: FAIL because `scripts/lib/changeset-policy.mjs` does not exist.

- [ ] **Step 3: Implement the pure policy**

Create `scripts/lib/changeset-policy.mjs` with these rules:

```js
const RELEASE_LINE = /^(["'])(.+)\1:\s+(patch|minor|major)$/u;

export function parsePluginMetadata(directory, content) {
  const source = `plugins/${directory}/package.json`;
  let packageJson;
  try {
    packageJson = JSON.parse(content);
  } catch (error) {
    throw new Error(`${source}: invalid JSON`, { cause: error });
  }
  if (typeof packageJson.name !== "string" || !packageJson.name) {
    throw new Error(`${source}: name must be a non-empty string`);
  }
  return {
    directory,
    name: packageJson.name,
    private: packageJson.private === true,
  };
}

export function parseChangesetPackages(changesets) {
  const packages = new Set();

  for (const changeset of changesets) {
    const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u.exec(changeset.content);
    if (!match) {
      throw new Error(`${changeset.path}: missing Changeset frontmatter`);
    }

    for (const rawLine of match[1].split(/\r?\n/u)) {
      const line = rawLine.trim();
      if (!line) continue;
      const release = RELEASE_LINE.exec(line);
      if (!release) {
        throw new Error(`${changeset.path}: invalid release line ${JSON.stringify(line)}`);
      }
      packages.add(release[2]);
    }
  }

  return packages;
}

export function evaluateChangesetCoverage({ changedFiles, plugins, coveredPackages }) {
  const publishableByDirectory = new Map(
    plugins
      .filter((plugin) => !plugin.private)
      .map((plugin) => [plugin.directory, plugin.name]),
  );
  const affected = new Set();

  for (const changedFile of changedFiles) {
    const normalized = changedFile.replaceAll("\\", "/");
    const match = /^plugins\/([^/]+)\//u.exec(normalized);
    const packageName = match ? publishableByDirectory.get(match[1]) : undefined;
    if (packageName) affected.add(packageName);
  }

  const affectedPackages = [...affected].sort();
  return {
    affectedPackages,
    missingPackages: affectedPackages.filter((name) => !coveredPackages.has(name)),
  };
}

```

- [ ] **Step 4: Verify GREEN**

Run `npm.cmd test -- scripts/test/changeset-policy.test.mjs`.

Expected: 6 tests pass.

- [ ] **Step 5: Write a failing CLI integration test**

Create `scripts/test/check-changeset.test.mjs`. Use `mkdtempSync`, `mkdirSync`, and `writeFileSync` to create a real temporary workspace containing `plugins/public-plugin/package.json` plus a valid `.changeset/covered.md`. Import `main` from `../check-changeset.mjs`, inject a `git(args)` function that returns `base-commit` for `merge-base` and `plugins/public-plugin/src/plugin.ts` for `diff`, and capture output through an injected `write(message)` function. Assert that `main(...)` returns `0` and reports `@edgegamers/public-plugin` as covered. Remove the temporary directory in `finally`.

Run:

```powershell
npm.cmd test -- scripts/test/check-changeset.test.mjs
```

Expected: FAIL because `scripts/check-changeset.mjs` does not exist.

- [ ] **Step 6: Add the thin CLI adapter**

Create `scripts/check-changeset.mjs`. It must:

1. run `git merge-base HEAD` with the resolved base-ref argument, then `git diff --name-only` with the resolved merge-base range, using `execFileSync` argument arrays rather than shell interpolation;
2. enumerate `plugins/*/package.json`, fail on missing files, and pass their contents to `parsePluginMetadata`;
3. read `.changeset/*.md` except `README.md`;
4. call the three exported policy functions;
5. print affected coverage when complete;
6. print each missing package and exit 1 when uncovered;
7. exit 0 with a warning only when `ALLOW_MISSING_CHANGESET` is exactly `true`.

Export `main({ root, baseRef, allowMissing, git, write, warn, error })` and return exit code `0` or `1`; provide defaults for the real working directory, environment, Git adapter, and console methods. Catch expected errors, send `Changeset check failed: <message>` through `error`, and return `1` without a stack trace. The direct-execution guard sets `process.exitCode = main()` only when `import.meta.url === pathToFileURL(process.argv[1]).href`, so importing the adapter has no process-level side effects.

- [ ] **Step 7: Run focused and full tests**

```powershell
npm.cmd test -- scripts/test/changeset-policy.test.mjs
npm.cmd test -- scripts/test/check-changeset.test.mjs
npm.cmd test
```

Expected: all tests pass.

- [ ] **Step 8: Commit the policy**

```powershell
git add scripts/lib/changeset-policy.mjs scripts/check-changeset.mjs scripts/test/changeset-policy.test.mjs scripts/test/check-changeset.test.mjs
git commit -m "feat: enforce Changeset coverage policy"
```

---

### Task 3: Generate deterministic development manifests

**Files:**

- Create: `scripts/lib/development-manifest.mjs`
- Create: `scripts/create-dev-manifest.mjs`
- Create: `scripts/test/development-manifest.test.mjs`
- Create: `scripts/test/create-dev-manifest.test.mjs`

**Interfaces:**

- Produces `createDevelopmentManifest(input: { artifacts: Array<{ path: string; bytes: Uint8Array }>; commit: string; generatedAt: string }): DevelopmentManifest`.
- Produces `findS2spFiles(root: string): string[]` with deterministic traversal.
- Produces `isWorkspaceArtifact(path: string): boolean` for the exact `plugins/*/dist/*.s2sp` SDK layout.
- CLI reads `GITHUB_SHA` or the current Git commit and writes `artifacts/development-manifest.json`.

- [ ] **Step 1: Write failing manifest tests**

Create `scripts/test/development-manifest.test.mjs`:

```js
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createDevelopmentManifest,
  findS2spFiles,
  isWorkspaceArtifact,
} from "../lib/development-manifest.mjs";

describe("createDevelopmentManifest", () => {
  it("sorts artifacts, normalizes paths, and records immutable identity", () => {
    const manifest = createDevelopmentManifest({
      artifacts: [
        { path: "plugins\\zeta\\dist\\zeta.s2sp", bytes: Buffer.from("zeta") },
        { path: "plugins/alpha/dist/alpha.s2sp", bytes: Buffer.from("alpha") },
      ],
      commit: "abcdef1234567890",
      generatedAt: "2026-07-31T12:00:00.000Z",
    });

    expect(manifest).toEqual({
      environment: "development",
      commit: "abcdef1234567890",
      generatedAt: "2026-07-31T12:00:00.000Z",
      plugins: [
        {
          artifact: "plugins/alpha/dist/alpha.s2sp",
          fileName: "alpha.s2sp",
          revision: "dev.abcdef1",
          sha256: "8ed3f6ad685b959ead7022518e1af76cd816f8e8ec7ccdda1ed4018e8f2223f8",
        },
        expect.objectContaining({
          artifact: "plugins/zeta/dist/zeta.s2sp",
          fileName: "zeta.s2sp",
          revision: "dev.abcdef1",
        }),
      ],
    });
  });

  it("rejects an empty artifact set", () => {
    expect(() =>
      createDevelopmentManifest({
        artifacts: [],
        commit: "abcdef1234567890",
        generatedAt: "2026-07-31T12:00:00.000Z",
      }),
    ).toThrow("No .s2sp artifacts found");
  });

  it("rejects duplicate normalized artifact paths", () => {
    expect(() =>
      createDevelopmentManifest({
        artifacts: [
          { path: "plugins\\api\\dist\\api.s2sp", bytes: Buffer.from("one") },
          { path: "plugins/api/dist/api.s2sp", bytes: Buffer.from("two") },
        ],
        commit: "abcdef1234567890",
        generatedAt: "2026-07-31T12:00:00.000Z",
      }),
    ).toThrow("Duplicate artifact path");
  });
});

describe("findS2spFiles", () => {
  it("finds nested artifacts in deterministic order", () => {
    const root = mkdtempSync(join(tmpdir(), "edgegamers-s2sp-"));
    try {
      mkdirSync(join(root, "zeta"), { recursive: true });
      writeFileSync(join(root, "zeta", "zeta.s2sp"), "zeta");
      writeFileSync(join(root, "alpha.s2sp"), "alpha");
      expect(findS2spFiles(root).map((path) => basename(path))).toEqual([
        "alpha.s2sp",
        "zeta.s2sp",
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("isWorkspaceArtifact", () => {
  it("accepts only direct SDK dist artifacts on either path separator", () => {
    expect(isWorkspaceArtifact("plugins/reference-api/dist/reference-api.s2sp")).toBe(true);
    expect(isWorkspaceArtifact("plugins\\reference-api\\dist\\reference-api.s2sp")).toBe(true);
    expect(isWorkspaceArtifact("plugins/reference-api/output/reference-api.s2sp")).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests and verify RED**

Run `npm.cmd test -- scripts/test/development-manifest.test.mjs`.

Expected: FAIL because the manifest module does not exist.

- [ ] **Step 3: Implement manifest assembly**

Create `scripts/lib/development-manifest.mjs`:

```js
import { createHash } from "node:crypto";
import { existsSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";

export function createDevelopmentManifest({ artifacts, commit, generatedAt }) {
  if (!commit.trim()) throw new Error("Commit identity is required");
  if (artifacts.length === 0) throw new Error("No .s2sp artifacts found");

  const seen = new Set();
  const plugins = artifacts.map((artifact) => {
    const normalizedPath = artifact.path.replaceAll("\\", "/");
    if (seen.has(normalizedPath)) {
      throw new Error(`Duplicate artifact path: ${normalizedPath}`);
    }
    seen.add(normalizedPath);
    return {
      artifact: normalizedPath,
      fileName: basename(normalizedPath),
      revision: `dev.${commit.slice(0, 7)}`,
      sha256: createHash("sha256").update(artifact.bytes).digest("hex"),
    };
  });

  plugins.sort((left, right) => left.artifact.localeCompare(right.artifact));
  return { environment: "development", commit, generatedAt, plugins };
}

export function isWorkspaceArtifact(path) {
  const normalizedPath = path.replaceAll("\\", "/");
  return /^plugins\/[^/]+\/dist\/[^/]+\.s2sp$/u.test(normalizedPath);
}

export function findS2spFiles(root) {
  if (!existsSync(root)) return [];
  const files = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) files.push(...findS2spFiles(path));
    else if (entry.isFile() && entry.name.endsWith(".s2sp")) files.push(path);
  }
  return files.sort();
}
```

- [ ] **Step 4: Verify GREEN**

Run `npm.cmd test -- scripts/test/development-manifest.test.mjs`.

Expected: 5 tests pass.

- [ ] **Step 5: Write a failing filesystem integration test**

Create `scripts/test/create-dev-manifest.test.mjs`. Build a temporary directory containing `plugins/reference-api/dist/reference-api.s2sp`, call the exported `writeDevelopmentManifest({ root, commit: "abcdef1234567890", generatedAt: "2026-07-31T12:00:00.000Z" })`, then read `artifacts/development-manifest.json` and assert that it contains the normalized reference artifact, the injected timestamp, and revision `dev.abcdef1`. Clean up the temporary directory in `finally`.

Run:

```powershell
npm.cmd test -- scripts/test/create-dev-manifest.test.mjs
```

Expected: FAIL because `scripts/create-dev-manifest.mjs` does not exist.

- [ ] **Step 6: Add the filesystem CLI**

Create `scripts/create-dev-manifest.mjs` that:

- resolves the repository root from `process.cwd()`;
- scans `plugins/` and retains only paths accepted by `isWorkspaceArtifact`;
- reads each artifact into `{ path: relative(root, absolutePath), bytes }`;
- uses `GITHUB_SHA` when set, otherwise `git rev-parse HEAD`;
- passes `new Date().toISOString()` as `generatedAt`;
- exports `writeDevelopmentManifest({ root, commit, generatedAt })` for the integration test;
- creates `artifacts/`, writes formatted JSON plus a trailing newline to `artifacts/development-manifest.json.tmp`, and atomically renames it to `artifacts/development-manifest.json`;
- catches expected errors, prints `Development manifest failed: <message>`, and sets `process.exitCode = 1`.

- [ ] **Step 7: Run focused and full tests**

```powershell
npm.cmd test -- scripts/test/development-manifest.test.mjs
npm.cmd test -- scripts/test/create-dev-manifest.test.mjs
npm.cmd test
```

Expected: all tests pass.

- [ ] **Step 8: Commit the manifest generator**

```powershell
git add scripts/lib/development-manifest.mjs scripts/create-dev-manifest.mjs scripts/test/development-manifest.test.mjs scripts/test/create-dev-manifest.test.mjs
git commit -m "feat: generate immutable development manifests"
```

---

### Task 4: Prove sibling interface resolution with private reference plugins

**Files:**

- Create: `plugins/reference-api/package.json`
- Create: `plugins/reference-api/api.d.ts`
- Create: `plugins/reference-api/src/greeting.ts`
- Create: `plugins/reference-api/src/plugin.ts`
- Create: `plugins/reference-api/test/greeting.test.ts`
- Create: `plugins/reference-api/tsconfig.json`
- Create: `plugins/reference-api/README.md`
- Create: `plugins/reference-consumer/package.json`
- Create: `plugins/reference-consumer/src/plugin.ts`
- Create: `plugins/reference-consumer/tsconfig.json`
- Create: `plugins/reference-consumer/README.md`
- Modify: `package-lock.json`

**Interfaces:**

- Producer publishes interface name `@edgegamers/reference-api` at version `0.1.0` through `s2script.publishes: "self"`.
- Producer contract exports `ReferenceGreetingApi` with `greet(name: string): string`.
- Consumer declares `s2script.pluginDependencies["@edgegamers/reference-api"] = "^0.1.0"` and resolves it through `ctx.use<ReferenceGreetingApi>()`.

- [ ] **Step 1: Write the failing portable behavior test**

Create `plugins/reference-api/test/greeting.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { formatGreeting } from "../src/greeting.ts";

describe("formatGreeting", () => {
  it("trims a contributor name before greeting it", () => {
    expect(formatGreeting("  Reece  ")).toBe("Hello, Reece!");
  });

  it("uses a neutral label when the name is blank", () => {
    expect(formatGreeting("   ")).toBe("Hello, player!");
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run `npm.cmd test -- plugins/reference-api/test/greeting.test.ts`.

Expected: FAIL because `src/greeting.ts` does not exist.

- [ ] **Step 3: Implement the portable greeting logic**

Create `plugins/reference-api/src/greeting.ts`:

```ts
export function formatGreeting(name: string): string {
  const normalizedName = name.trim() || "player";
  return `Hello, ${normalizedName}!`;
}
```

Run the focused test again. Expected: 2 tests pass.

- [ ] **Step 4: Define the producer package and contract**

Create `plugins/reference-api/package.json`:

```json
{
  "name": "@edgegamers/reference-api",
  "version": "0.1.0",
  "private": true,
  "main": "src/plugin.ts",
  "types": "api.d.ts",
  "scripts": {
    "build": "s2s build ."
  },
  "s2script": {
    "publishes": "self"
  }
}
```

Create `plugins/reference-api/api.d.ts`:

```ts
export interface ReferenceGreetingApi {
  greet(name: string): string;
}
```

Create `plugins/reference-api/src/plugin.ts`:

```ts
import { plugin } from "@s2script/sdk/plugin";
import type { ReferenceGreetingApi } from "../api";
import { formatGreeting } from "./greeting.ts";

export default plugin((ctx) => {
  ctx.publish<ReferenceGreetingApi>("@edgegamers/reference-api", {
    greet: formatGreeting,
  });
});
```

Create the generator-compatible `plugins/reference-api/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "include": [
    "src",
    "test",
    "api.d.ts",
    ".s2script/gamedata.d.ts",
    "node_modules/@s2script/sdk/globals.d.ts"
  ]
}
```

- [ ] **Step 5: Define the consumer**

Create `plugins/reference-consumer/package.json`:

```json
{
  "name": "@edgegamers/reference-consumer",
  "version": "0.1.0",
  "private": true,
  "main": "src/plugin.ts",
  "scripts": {
    "build": "s2s build ."
  },
  "s2script": {
    "pluginDependencies": {
      "@edgegamers/reference-api": "^0.1.0"
    }
  }
}
```

Create `plugins/reference-consumer/src/plugin.ts`:

```ts
import type { ReferenceGreetingApi } from "@edgegamers/reference-api";
import { plugin } from "@s2script/sdk/plugin";

export default plugin((ctx) => {
  const greetingApi = ctx.use<ReferenceGreetingApi>("@edgegamers/reference-api");
  console.log(greetingApi.greet("EdgeGamers"));
});
```

Create `plugins/reference-consumer/tsconfig.json` with the same generated structure as the producer, omitting `api.d.ts` and including `src` only.

- [ ] **Step 6: Install workspace links and verify interface resolution**

Run:

```powershell
npm.cmd install
npm.cmd test -- plugins/reference-api/test/greeting.test.ts
npm.cmd run typecheck
npm.cmd run build
```

Expected: tests and typecheck pass; Source2Script builds the producer before the consumer; both create one `dist/*.s2sp` artifact; no `.s2script/types/@edgegamers/reference-api` copy exists.

- [ ] **Step 7: Add plugin READMEs**

Document that the producer owns the contract and runtime implementation, the consumer imports the live sibling type, both plugins are private, and the pair should be removed only after a real producer/consumer pair replaces its verification role.

- [ ] **Step 8: Commit the reference pair**

```powershell
git add plugins/reference-api plugins/reference-consumer package-lock.json
git commit -m "feat: demonstrate sibling plugin interfaces"
```

---

### Task 5: Document contributor workflows and system boundaries

**Files:**

- Modify: `docs/navigation.md`
- Create: `docs/getting-started.md`
- Create: `docs/architecture.md`
- Create: `docs/plugin-development.md`
- Create: `docs/releases.md`

**Interfaces:**

- Documentation commands must exactly match `package.json`.
- Documentation must distinguish shared source packages from runtime plugin interfaces.
- Documentation must state that production ends at `s2s deploy` and development transport is deferred.

- [ ] **Step 1: Replace the WIP navigator**

Use this structure in `docs/navigation.md`:

```md
# EdgeGamers Source2Script documentation

- [Getting started](./getting-started.md)
- [Repository architecture](./architecture.md)
- [Plugin development](./plugin-development.md)
- [Changesets and releases](./releases.md)
- [Foundation design](./superpowers/specs/2026-07-31-monorepo-foundation-design.md)
```

- [ ] **Step 2: Write the getting-started guide**

Cover Node 24, npm 11, `npm install`, and the validation sequence:

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
```

Explain that TypeScript remains pinned to 5.9.3 because the official Source2Script ESLint stack rejects TypeScript 7, and identify official TS7 lint support as the upgrade condition.

- [ ] **Step 3: Write the architecture guide**

Describe `plugins/*`, reserved `packages/*`, `scripts/lib/*`, tests, and generated `artifacts/`. Include the ownership rule: Source2Script owns workspace discovery/build/version/deploy; repository scripts own Changeset coverage and development-manifest formatting.

- [ ] **Step 4: Write the plugin-development guide**

Document:

```powershell
npm.cmd run create:plugin -- my-plugin
```

Explain how to remove redundant generated configuration only when the generator duplicates a root concern. Walk through the reference producer's `types`, `s2script.publishes`, and `ctx.publish`; then the consumer's `pluginDependencies`, type import, and `ctx.use`. Explicitly prohibit copied sibling declarations.

- [ ] **Step 5: Write the release guide**

Include the Changeset decision table:

| Change | Changeset? |
|---|---|
| Publishable runtime behavior or public contract | Yes |
| Compatible bug fix | Yes, patch |
| Backward-compatible feature | Yes, minor |
| Breaking contract or configuration | Yes, major |
| Docs, tests, CI, formatting, private-only tooling | Normally no |

Document the two flows:

```text
Development: build -> immutable .s2sp artifacts -> development manifest -> deferred EdgeGamers transport
Production: Changesets -> s2s version -> review -> s2s deploy
```

State that production server manifests, installation, and reconciliation are not repository requirements.

- [ ] **Step 6: Check documentation links and command names**

Run:

```powershell
rg -n "WIP|TODO|TBD|latest" docs/navigation.md docs/getting-started.md docs/architecture.md docs/plugin-development.md docs/releases.md .changeset/README.md
rg -n "npm.cmd run (lint|typecheck|build|create:plugin)|npm.cmd test|s2s (version|deploy)" docs/navigation.md docs/getting-started.md docs/architecture.md docs/plugin-development.md docs/releases.md
rg -n "docs/navigation.md" README.md
```

Expected: no placeholders or `latest`; every documented command exists in `package.json`; the branded README still links to the documentation navigator.

- [ ] **Step 7: Commit documentation**

```powershell
git add docs .changeset/README.md plugins/reference-api/README.md plugins/reference-consumer/README.md
git commit -m "docs: explain Source2Script contributor workflows"
```

---

### Task 6: Run full verification and audit the milestone

**Files:**

- Modify only files required to correct verification failures.

**Interfaces:**

- Consumes every command and contract from Tasks 1–5.
- Produces fresh evidence that the milestone satisfies the approved design.

- [ ] **Step 1: Verify repository state and exact toolchain**

```powershell
git status --short
node --version
npm.cmd --version
npx.cmd tsc --version
npm.cmd ls --all
```

Expected: no unintended changes; Node 24.x; npm 11.x; TypeScript 5.9.3; dependency tree has no invalid peers.

- [ ] **Step 2: Run the full local quality gate**

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
```

Expected: every command exits 0 with no errors or warnings that indicate unsupported versions or unresolved sibling contracts.

- [ ] **Step 3: Verify generated artifacts and manifest**

```powershell
npm.cmd run manifest:dev
Get-Content -Raw artifacts\development-manifest.json
```

Expected: both private reference plugin artifacts appear once, sorted by normalized path, with `dev.<7-char-sha>` revisions and 64-character SHA-256 values.

- [ ] **Step 4: Verify the Changeset check's no-op path**

Run the pure test suite again, then invoke the CLI against a known local base ref chosen from the repository history. Expected: private reference-plugin changes do not require Changesets.

- [ ] **Step 5: Audit requirements against the design**

Confirm:

- no custom plugin build/version/deploy loop exists;
- no placeholder `packages/*` package exists;
- no copied `.s2script/types` declaration exists;
- generated artifacts are ignored;
- production documentation ends at `s2s deploy`;
- development transport and GitHub automation are explicitly deferred;
- TypeScript 7 is not forced through peer overrides.

- [ ] **Step 6: Handle any verification failure in its owning task**

If a check fails, return to the task that owns the behavior, add or update the failing test first, make the smallest correction, rerun that task's focused checks, then rerun every command in Steps 1–5. Do not create an empty verification commit.
