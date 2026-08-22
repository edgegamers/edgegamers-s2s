# Workspace Scope Boundaries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add recursively organized `global` and game-scoped plugin/package trees with automatic enforcement that global code cannot reference a game and game code cannot reference another game.

**Architecture:** A small root policy classifies valid game IDs and official Source2Script packages. One recursive workspace-layout module derives every package's scope from its first path segment, and a separate boundary module validates source and manifest dependency edges. Existing bundle, Changeset, and licensing tools consume the same layout module so all repository operations agree about package ownership.

**Tech Stack:** Node.js 24, npm 11 workspaces, ECMAScript modules, TypeScript 5.9 parser API, Node built-in test runner, Source2Script CLI/SDK, ESLint 10.

**Spec:** `docs/superpowers/specs/2026-08-22-workspace-scope-boundaries-design.md`

## Global Constraints

- The first segment below `plugins/` or `packages/` is the only repository scope: `global` or a game ID listed in `workspace-policy.json`.
- Initial game IDs are exactly `cs2`; initial external classifications are `@s2script/sdk -> global` and `@s2script/cs2 -> cs2`.
- Directory organization after the first segment remains unrestricted and has no server-level semantics.
- Package roots are discovered recursively by `package.json`, require at least one path segment after scope, and may not contain another package root.
- Global packages may reference only global packages; game `G` may reference global or game `G`.
- Static, type-only, literal dynamic, CommonJS, relative, bare, npm-manifest, and Source2Script-manifest references participate in validation.
- Ordinary third-party packages are scope-neutral; unclassified `@s2script/*` packages fail closed.
- Developers keep ordinary TypeScript and Source2Script imports; do not add annotations, path aliases, wrappers, or per-server metadata.
- Use only existing runtime/development dependencies. Parse source with the installed `typescript` package and test with `node:test`.
- All filesystem paths in diagnostics are normalized to `/` and sorted deterministically.

## Execution Prerequisite

Before Task 1, run `node --version`, `npm --version`, and `npm ci`. Require Node `24.x`, npm `11.x`, and a clean dependency install from the committed lockfile. Do not upgrade dependencies as part of this feature.

---

### Task 1: Recursive Workspace Layout and Scope Policy

**Files:**
- Create: `workspace-policy.json`
- Create: `scripts/lib/workspace-layout.mjs`
- Create: `scripts/lib/test-workspace.mjs`
- Test: `scripts/lib/workspace-layout.test.mjs`

**Interfaces:**
- Produces: `loadWorkspacePolicy(rootDir): WorkspacePolicy`
- Produces: `inspectWorkspaceLayout(rootDir): { policy, packages, byName, errors }`
- Produces: `requireValidWorkspaceLayout(rootDir): { policy, packages, byName }`
- Produces: `findOwningPackage(packages, absolutePath): WorkspacePackage | undefined`
- Produces: `scopeAllows(sourceScope, targetScope): boolean`
- `WorkspacePackage` fields: `{ kind, scope, name, directory, absoluteDirectory, manifestPath, manifest }`, where `kind` is `plugin` or `package`, `directory` is repository-relative with `/` separators, and both `absoluteDirectory` and `manifestPath` are absolute native filesystem paths.

- [ ] **Step 1: Add failing recursive-layout tests**

Create `scripts/lib/test-workspace.mjs` with a reusable fixture writer:

```js
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export function makeWorkspace(t, files) {
  const root = mkdtempSync(join(tmpdir(), "edgegamers-layout-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const [relativePath, value] of Object.entries(files)) {
    const path = join(root, relativePath);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, typeof value === "string"
      ? value
      : `${JSON.stringify(value, null, 2)}\n`);
  }
  return root;
}

export const BASE_POLICY = {
  games: ["cs2"],
  externalScopes: {
    "@s2script/sdk": "global",
    "@s2script/cs2": "cs2",
  },
};
```

Create `scripts/lib/workspace-layout.test.mjs` with tests that assert:

```js
import assert from "node:assert/strict";
import test from "node:test";
import {
  findOwningPackage,
  inspectWorkspaceLayout,
  scopeAllows,
} from "./workspace-layout.mjs";
import { BASE_POLICY, makeWorkspace } from "./test-workspace.mjs";

test("discovers packages recursively and derives only the first-segment scope", (t) => {
  const root = makeWorkspace(t, {
    "workspace-policy.json": BASE_POLICY,
    "plugins/global/platform/maul/package.json": { name: "@edgegamers/maul" },
    "plugins/cs2/servers/ttt/package.json": { name: "@edgegamers/ttt" },
    "packages/cs2/features/votes/package.json": { name: "@edgegamers/votes" },
  });
  const result = inspectWorkspaceLayout(root);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.packages.map(({ directory, kind, scope }) => ({
    directory, kind, scope,
  })), [
    { directory: "packages/cs2/features/votes", kind: "package", scope: "cs2" },
    { directory: "plugins/cs2/servers/ttt", kind: "plugin", scope: "cs2" },
    { directory: "plugins/global/platform/maul", kind: "plugin", scope: "global" },
  ]);
  assert.equal(findOwningPackage(
    result.packages,
    `${result.byName.get("@edgegamers/ttt").absoluteDirectory}/src/plugin.ts`,
  ).name, "@edgegamers/ttt");
});

test("reports every invalid layout entry deterministically", (t) => {
  const root = makeWorkspace(t, {
    "workspace-policy.json": BASE_POLICY,
    "plugins/package.json": { name: "@edgegamers/missing-scope" },
    "plugins/cs22/oops/package.json": { name: "@edgegamers/oops" },
    "plugins/cs2/outer/package.json": { name: "@edgegamers/duplicate" },
    "plugins/cs2/outer/inner/package.json": { name: "@edgegamers/inner" },
    "packages/global/duplicate/package.json": { name: "@edgegamers/duplicate" },
  });
  assert.deepEqual(inspectWorkspaceLayout(root).errors, [
    "packages/global/duplicate/package.json: duplicate package name @edgegamers/duplicate (also plugins/cs2/outer/package.json)",
    "plugins/cs2/outer/inner/package.json: package root is nested inside plugins/cs2/outer",
    "plugins/cs22/oops/package.json: unknown game scope cs22",
    "plugins/package.json: package root requires a scope and package directory",
  ]);
});

test("allows only global or same-game targets", () => {
  assert.equal(scopeAllows("global", "global"), true);
  assert.equal(scopeAllows("global", "cs2"), false);
  assert.equal(scopeAllows("cs2", "global"), true);
  assert.equal(scopeAllows("cs2", "cs2"), true);
  assert.equal(scopeAllows("cs2", "dota2"), false);
});
```

- [ ] **Step 2: Run the layout test and verify it fails**

Run: `node --test scripts/lib/workspace-layout.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `scripts/lib/workspace-layout.mjs`.

- [ ] **Step 3: Implement the policy and recursive layout module**

Create `workspace-policy.json` exactly as approved:

```json
{
  "games": ["cs2"],
  "externalScopes": {
    "@s2script/sdk": "global",
    "@s2script/cs2": "cs2"
  }
}
```

Implement `scripts/lib/workspace-layout.mjs` with these rules:

```js
const WORKSPACE_ROOTS = new Map([
  ["packages", "package"],
  ["plugins", "plugin"],
]);
const EXCLUDED_DIRECTORIES = new Set([".s2script", "dist", "node_modules"]);

export function scopeAllows(sourceScope, targetScope) {
  return targetScope === "global" || sourceScope === targetScope;
}
```

`loadWorkspacePolicy` must parse `workspace-policy.json`; require `games` to be a non-empty, duplicate-free array of lowercase IDs matching `/^[a-z0-9][a-z0-9-]*$/u`; forbid `global` in `games`; require every `externalScopes` value to be `global` or a listed game; and expose `games` as a `Set` and `externalScopes` as a `Map`.

`inspectWorkspaceLayout` must recursively walk both roots, skip excluded directories, collect every `package.json`, parse manifests, normalize paths, and accumulate rather than throw validation errors. It must sort manifests by repository-relative path before detecting nested roots and duplicate names so diagnostics are stable. A valid package needs a non-empty string `name`, a relative path shaped `<root>/<scope>/<one-or-more package path segments>`, and a known scope. Build `byName` only from the first valid occurrence of each name.

`requireValidWorkspaceLayout` must call `inspectWorkspaceLayout` and throw one `Error` whose message is `Workspace layout is invalid:\n- ${errors.join("\n- ")}` when errors exist. `findOwningPackage` must select the deepest package root containing the file using `path.relative`, never string-prefix matching.

- [ ] **Step 4: Run the layout tests and repository formatting check**

Run: `node --test scripts/lib/workspace-layout.test.mjs`

Expected: 3 tests PASS.

Run: `npm run lint -- --no-warn-ignored`

Expected: PASS for the new modules under the existing ESLint configuration.

- [ ] **Step 5: Commit the layout foundation**

```powershell
git add workspace-policy.json scripts/lib/workspace-layout.mjs scripts/lib/workspace-layout.test.mjs scripts/lib/test-workspace.mjs
git commit -m "feat: add recursive workspace scope model"
```

### Task 2: Source Reference Scanner and Boundary Policy

**Files:**
- Create: `scripts/lib/source-imports.mjs`
- Create: `scripts/lib/source-imports.test.mjs`
- Create: `scripts/lib/workspace-boundary-policy.mjs`
- Create: `scripts/lib/workspace-boundary-policy.test.mjs`
- Create: `scripts/check-workspace-boundaries.mjs`

**Interfaces:**
- Consumes: `inspectWorkspaceLayout`, `findOwningPackage`, and `scopeAllows` from Task 1.
- Produces: `findSourceFiles(packageDirectory, { includeDeclarations = false } = {}): string[]`
- Produces: `collectModuleReferences(sourcePath): { references, hasNonliteralPackageLoad }`
- Produces: `resolveRelativeSourceImport({ sourcePath, specifier, sourceFiles }): { target?: string, error?: string }`
- Produces: `validateWorkspaceBoundaries(rootDir): string[]`
- A module reference is `{ specifier, runtime, line, column }`; `runtime` is false only when the entire import/export is type-only.

- [ ] **Step 1: Add failing source-scanner tests**

Create `scripts/lib/source-imports.test.mjs`. Write a fixture containing normal imports, `import type`, type-only named imports, exports, dynamic imports, and `require`. Assert exact results:

```js
test("collects runtime and type module references with source locations", (t) => {
  const root = makeWorkspace(t, {
    "sample.ts": [
      'import { plugin } from "@s2script/sdk/plugin";',
      'import type { Player } from "@s2script/cs2";',
      'export type { Api } from "@edgegamers/api";',
      'await import("@edgegamers/runtime");',
      'require("@edgegamers/legacy");',
      "",
    ].join("\n"),
  });
  const result = collectModuleReferences(join(root, "sample.ts"));
  assert.equal(result.hasNonliteralPackageLoad, false);
  assert.deepEqual(result.references.map(({ specifier, runtime, line }) => ({
    specifier, runtime, line,
  })), [
    { specifier: "@s2script/sdk/plugin", runtime: true, line: 1 },
    { specifier: "@s2script/cs2", runtime: false, line: 2 },
    { specifier: "@edgegamers/api", runtime: false, line: 3 },
    { specifier: "@edgegamers/runtime", runtime: true, line: 4 },
    { specifier: "@edgegamers/legacy", runtime: true, line: 5 },
  ]);
});
```

Also assert that `import(variable)`, `require()`, and `require(variable)` set `hasNonliteralPackageLoad`; source discovery excludes `node_modules`, `dist`, and `.s2script`; declaration files are omitted by default and included when `includeDeclarations: true`; and relative resolution supports TypeScript extension substitution, `.d.ts` contracts, and `index.ts`.

- [ ] **Step 2: Run the scanner test and verify it fails**

Run: `node --test scripts/lib/source-imports.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `scripts/lib/source-imports.mjs`.

- [ ] **Step 3: Extract and generalize the TypeScript source scanner**

Move the reusable algorithms currently embedded in `scripts/lib/license-policy.mjs` into `scripts/lib/source-imports.mjs`: source-file discovery, type-only import/export detection, AST traversal, normalized path keys, containment checks, relative module candidates, and relative resolution.

Use `ts.getLineAndCharacterOfPosition(node.getStart(source))` to store 1-based `line` and `column`. Include type-only references in `references`; preserve the `runtime` boolean so licensing can continue ignoring type-only edges in Task 4. Scan `.ts`, `.tsx`, `.mts`, `.cts`, `.js`, `.jsx`, `.mjs`, and `.cjs`. By default omit `.d.ts`, `.d.mts`, and `.d.cts`; include them when `includeDeclarations` is true. Add declaration-file candidates to relative resolution so ordinary type imports of sibling `api.d.ts` contracts are valid.

- [ ] **Step 4: Run scanner tests and verify they pass**

Run: `node --test scripts/lib/source-imports.test.mjs`

Expected: all scanner tests PASS.

- [ ] **Step 5: Add failing boundary-policy tests**

Create `scripts/lib/workspace-boundary-policy.test.mjs` with table-driven fixtures for the permission matrix. Include these exact cases:

```js
const cases = [
  ["global imports global", "plugins/global/a", "@edgegamers/global-b", []],
  ["cs2 imports global", "plugins/cs2/a", "@edgegamers/global-b", []],
  ["cs2 imports cs2", "plugins/cs2/a", "@edgegamers/cs2-b", []],
  ["global rejects cs2", "plugins/global/a", "@edgegamers/cs2-b",
    ["plugins/global/a/src/index.ts:1:1 -> @edgegamers/cs2-b: global code cannot reference cs2-scoped package @edgegamers/cs2-b"]],
  ["cs2 rejects another game", "plugins/cs2/a", "@edgegamers/dota-b",
    ["plugins/cs2/a/src/index.ts:1:1 -> @edgegamers/dota-b: cs2 code cannot reference dota2-scoped package @edgegamers/dota-b"]],
];
```

For the cross-game fixture, extend that fixture's policy with `dota2` and add a `packages/dota2/b/package.json`. Add separate tests proving:

- relative imports across package roots use the target owner's scope;
- dependencies in each of the four npm dependency maps are checked;
- `pluginDependencies`, `optionalPluginDependencies`, and `libraries` are checked;
- `@s2script/sdk/chat` is global and `@s2script/cs2` is CS2;
- an unknown `@s2script/dota2` fails as unclassified when `dota2` is absent from `externalScopes`;
- `lodash` is neutral;
- non-literal package loads produce a diagnostic;
- diagnostics are sorted by source path, line, and target.

- [ ] **Step 6: Run the boundary test and verify it fails**

Run: `node --test scripts/lib/workspace-boundary-policy.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `scripts/lib/workspace-boundary-policy.mjs`.

- [ ] **Step 7: Implement dependency classification and validation**

Implement `validateWorkspaceBoundaries(rootDir)` with this flow:

```js
export function validateWorkspaceBoundaries(rootDir) {
  const layout = inspectWorkspaceLayout(rootDir);
  const errors = [...layout.errors];
  const sourceFiles = new Set(layout.packages.flatMap(({ absoluteDirectory }) =>
    findSourceFiles(absoluteDirectory, { includeDeclarations: true })));

  for (const sourcePackage of layout.packages) {
    validateManifestReferences({ sourcePackage, layout, errors });
    validateSourceReferences({ sourcePackage, sourceFiles, layout, errors });
  }
  return [...new Set(errors)].sort(compareDiagnostics);
}
```

Bare-specifier classification must strip a subpath to its npm package name (`@scope/name` or the first unscoped segment), then check workspace `byName`, then exact `externalScopes`. Any package name beginning `@s2script/` that matches neither source must emit `unclassified Source2Script package <name>; add it to workspace-policy.json`. Other unmatched names return neutral and generate no boundary edge.

Manifest checks must iterate sorted entries from all approved fields. `s2script.libraries` may be either an object or absent; only workspace/external entries create a scope edge. Source checks must validate type-only and runtime references alike. Relative references within the same package pass; cross-package targets use `findOwningPackage`; a relative package-loading reference that cannot resolve to exactly one scanned source file emits the resolver error.

Create `scripts/check-workspace-boundaries.mjs` as a thin CLI that prints `Workspace boundaries are valid.` and returns 0 when no errors exist; otherwise print `Workspace boundary check failed:` followed by `- <error>` lines and return 1. Export `main({ root, write, error })` for direct testing and guard execution with `pathToFileURL` like the existing scripts.

- [ ] **Step 8: Run focused boundary validation**

Run: `node --test scripts/lib/source-imports.test.mjs scripts/lib/workspace-boundary-policy.test.mjs`

Expected: all tests PASS.

Run: `node scripts/check-workspace-boundaries.mjs`

Expected before migration: FAIL with missing-scope diagnostics for `plugins/maul/package.json` and `plugins/ttt/package.json`. This failure proves the new gate sees the current flat layout.

- [ ] **Step 9: Commit the boundary checker**

```powershell
git add scripts/lib/source-imports.mjs scripts/lib/source-imports.test.mjs scripts/lib/workspace-boundary-policy.mjs scripts/lib/workspace-boundary-policy.test.mjs scripts/check-workspace-boundaries.mjs
git commit -m "feat: enforce workspace game boundaries"
```

### Task 3: Migrate the Workspace and Wire the Developer Gate

**Files:**
- Modify: `package.json:12-31`
- Modify: `package-lock.json`
- Modify: `tsconfig.base.json:17-20`
- Move: `plugins/maul` to `plugins/global/maul`
- Move: `plugins/ttt` to `plugins/cs2/ttt`
- Modify: `plugins/global/maul/tsconfig.json`
- Modify: `plugins/cs2/ttt/tsconfig.json`

**Interfaces:**
- Consumes: `scripts/check-workspace-boundaries.mjs` from Task 2.
- Produces: root scripts `workspace:check` and `test`; makes `lint` run boundary validation first.
- Produces: recursive npm and Source2Script workspace selection.

- [ ] **Step 1: Move the existing plugins into their approved scopes**

```powershell
New-Item -ItemType Directory -Force plugins/global, plugins/cs2
git mv plugins/maul plugins/global/maul
git mv plugins/ttt plugins/cs2/ttt
```

Change both moved `tsconfig.json` files from `../../tsconfig.base.json` to `../../../tsconfig.base.json`.

- [ ] **Step 2: Update workspace patterns and root commands**

Change `package.json` to:

```json
"workspaces": [
  "plugins/*/**",
  "packages/*/**"
],
"s2script": {
  "workspace": {
    "plugins": [
      "plugins/*/**"
    ]
  }
},
"scripts": {
  "workspace:check": "node scripts/check-workspace-boundaries.mjs",
  "create:plugin": "node scripts/create-plugin.mjs",
  "lint": "npm run workspace:check && eslint .",
  "typecheck": "tsc --noEmit -p tsconfig.base.json",
  "test": "node --test"
}
```

Keep all existing scripts not shown above unchanged. Change `tsconfig.base.json` includes to:

```json
"include": [
  "plugins/**/*.ts",
  "packages/**/*.ts"
]
```

- [ ] **Step 3: Refresh the npm lockfile workspace paths**

Run: `npm install --package-lock-only --ignore-scripts`

Expected: PASS; `package-lock.json` records `plugins/global/maul` and `plugins/cs2/ttt` and removes the flat workspace entries.

- [ ] **Step 4: Verify workspace selection and compilation**

Run: `npm run workspace:check`

Expected: PASS with `Workspace boundaries are valid.`

Run: `npm run typecheck`

Expected: PASS.

Run: `npx --no-install s2s build`

Expected: PASS and exactly one `.s2sp` appears under each moved plugin's `dist/` directory, proving the recursive Source2Script glob works with the pinned CLI.

- [ ] **Step 5: Commit the workspace migration**

```powershell
git add package.json package-lock.json tsconfig.base.json plugins/global/maul plugins/cs2/ttt
git commit -m "refactor: organize plugins by game scope"
```

### Task 4: Make Repository Policies Consume Recursive Discovery

**Files:**
- Modify: `scripts/build-server-bundles.mjs:17-31`
- Modify: `scripts/check-changeset.mjs:20-35`
- Modify: `scripts/lib/changeset-policy.mjs:1-66`
- Modify: `scripts/lib/license-policy.mjs:1-330`
- Modify: `scripts/lib/license-artifacts.mjs:1-50`
- Test: `scripts/build-server-bundles.test.mjs`
- Test: `scripts/lib/changeset-policy.test.mjs`
- Test: `scripts/lib/license-policy.test.mjs`
- Test: `scripts/lib/license-artifacts.test.mjs`

**Interfaces:**
- Consumes: `requireValidWorkspaceLayout`, `findOwningPackage`, `findSourceFiles`, `collectModuleReferences`, and `resolveRelativeSourceImport`.
- Preserves: `discoverWorkspacePlugins(root)` output `{ packageName, directory }[]` for bundle planning.
- Changes: `evaluateChangesetCoverage` receives recursively discovered plugin records whose `directory` is repository-relative.
- Preserves: public licensing entry points used by `check-licenses.mjs` and `check-license-artifacts.mjs`.

- [ ] **Step 1: Add failing recursive-consumer tests**

Create `scripts/build-server-bundles.test.mjs` and assert `discoverWorkspacePlugins` returns:

```js
[
  { packageName: "@edgegamers/ttt", directory: "plugins/cs2/servers/ttt" },
  { packageName: "@edgegamers/maul", directory: "plugins/global/maul" },
].sort((left, right) => left.packageName.localeCompare(right.packageName))
```

Create `scripts/lib/changeset-policy.test.mjs` with two publishable plugins at `plugins/cs2/servers/ttt` and `plugins/global/maul`; assert a changed file below the former affects only `@edgegamers/ttt`, while a file under `plugins/cs2/servers/ttt-extra` affects neither package.

Create `scripts/lib/license-policy.test.mjs` with `workspace-policy.json`, a root `package.json`, and nested manifests at `plugins/global/maul/package.json`, `plugins/cs2/servers/ttt/package.json`, and `packages/global/config/package.json`. Assert `discoverWorkspaceManifests` returns the root plus all three nested manifests, while `discoverSource2ScriptPluginManifests` returns only the two plugin manifests. The end-to-end `npm run license:check` in Step 6 proves entry-point validation against the repository's canonical license files.

Create `scripts/lib/license-artifacts.test.mjs` asserting `isPluginArtifactPath("plugins/cs2/servers/ttt/dist/ttt.s2sp")` and `isPluginArtifactPath("plugins/global/maul/dist/maul.s2sp")` are true, while `plugins/cs2/dist/ttt.s2sp`, `plugins/cs2/ttt/build/ttt.s2sp`, and `packages/cs2/ttt/dist/ttt.s2sp` are false. Export `isPluginArtifactPath` if it is currently private.

- [ ] **Step 2: Run consumer tests and verify the flat assumptions fail**

Run: `node --test scripts/build-server-bundles.test.mjs scripts/lib/changeset-policy.test.mjs scripts/lib/license-policy.test.mjs scripts/lib/license-artifacts.test.mjs`

Expected: FAIL because existing discovery supports only one level and the artifact regular expression accepts only `plugins/<name>/dist`.

- [ ] **Step 3: Refactor server-bundle discovery**

Replace direct `readdirSync(pluginsRoot)` logic in `discoverWorkspacePlugins` with:

```js
export function discoverWorkspacePlugins(root) {
  const { packages } = requireValidWorkspaceLayout(root);
  return packages
    .filter(({ kind }) => kind === "plugin")
    .map(({ name, directory }) => ({ packageName: name, directory }))
    .sort((left, right) => left.packageName.localeCompare(right.packageName));
}
```

Keep artifact discovery and server-bundle selection based on package name.

- [ ] **Step 4: Refactor Changeset ownership**

Make `check-changeset.mjs` obtain plugins from `requireValidWorkspaceLayout(root)` and pass full repository-relative directories into `evaluateChangesetCoverage`. Replace the first-segment regular expression in `evaluateChangesetCoverage` with containment matching against each publishable plugin directory:

```js
const packageName = publishablePlugins
  .filter(({ directory }) => normalized === directory
    || normalized.startsWith(`${directory}/`))
  .sort((left, right) => right.directory.length - left.directory.length)[0]?.name;
```

Remove `parsePluginMetadata` if no caller remains; manifest parsing and validation now belong to workspace layout.

- [ ] **Step 5: Refactor licensing discovery and import scanning**

Delete `discoverPatternManifests`, its one-level glob parser, and the duplicated source-scanner functions from `license-policy.mjs`. Implement workspace discovery from `requireValidWorkspaceLayout(rootDir)`:

```js
export function discoverWorkspaceManifests(rootDir) {
  const rootPath = join(rootDir, "package.json");
  const rootManifest = readJson(rootPath);
  const { packages } = requireValidWorkspaceLayout(rootDir);
  return [
    { path: rootPath, manifest: rootManifest },
    ...packages.map(({ manifestPath: path, manifest }) => ({ path, manifest })),
  ];
}

export function discoverSource2ScriptPluginManifests(rootDir) {
  const { packages } = requireValidWorkspaceLayout(rootDir);
  return packages
    .filter(({ kind }) => kind === "plugin")
    .map(({ manifestPath: path, manifest }) => ({ path, manifest }));
}
```

Import `findSourceFiles`, `collectModuleReferences`, and `resolveRelativeSourceImport` from `source-imports.mjs`. In licensing validation, filter collected references to `runtime === true` before applying the existing approved-dependency rules so Task 2's inclusion of type-only references does not change licensing semantics.

Change license artifact recognition to `^plugins/[^/]+/(?:[^/]+/)+dist/[^/]+\.s2sp$`, and update the no-artifacts message to `plugins/**/dist/*.s2sp: no built plugin artifacts found`.

- [ ] **Step 6: Run policy tests and checks**

Run: `node --test scripts/build-server-bundles.test.mjs scripts/lib/changeset-policy.test.mjs scripts/lib/license-policy.test.mjs scripts/lib/license-artifacts.test.mjs`

Expected: all consumer tests PASS.

Run: `npm run license:check`

Expected: PASS with the moved plugins and recursive package patterns.

Run: `npm run build`

Expected: PASS; the recursive license checks run before build, and recursive artifact checks run afterward.

Run: `npm run bundles:servers -- --environment development`

Expected: PASS after Task 3's build; the TTT bundle still selects `@edgegamers/ttt` by package name.

- [ ] **Step 7: Commit the recursive consumer refactor**

```powershell
git add scripts/build-server-bundles.mjs scripts/build-server-bundles.test.mjs scripts/check-changeset.mjs scripts/lib/changeset-policy.mjs scripts/lib/changeset-policy.test.mjs scripts/lib/license-policy.mjs scripts/lib/license-policy.test.mjs scripts/lib/license-artifacts.mjs scripts/lib/license-artifacts.test.mjs
git commit -m "refactor: share recursive workspace discovery"
```

### Task 5: Scope-Aware Plugin Creation Wrapper

**Files:**
- Create: `scripts/create-plugin.mjs`
- Test: `scripts/create-plugin.test.mjs`
- Modify: `package.json:26` only if Task 3 deferred the script switch while the file was absent.

**Interfaces:**
- Consumes: `loadWorkspacePolicy` and `validateWorkspaceBoundaries`.
- Produces: `parsePluginDestination(destination, policy): { scope, segments, name }`
- Produces: `createPlugin({ root, destination, generate }): void`
- CLI contract: `npm run create:plugin -- <global-or-game>/<arbitrary folders>/<plugin-name>`.

- [ ] **Step 1: Add failing destination and generation tests**

Create `scripts/create-plugin.test.mjs`. Test `parsePluginDestination` rejects absolute paths, `..`, `.`, backslash traversal, missing package names (`global` or `cs2` alone), unknown games, and empty segments. Assert it accepts both `global/maul-helper` and `cs2/ttt/rounds/my-plugin`.

Test `createPlugin` with an injected `generate({ temporaryRoot, name, game })` that writes:

```json
{
  "package.json": { "name": "@edgegamers/generated", "main": "src/plugin.ts" },
  "tsconfig.json": { "extends": "./generated-default.json" },
  "src/plugin.ts": "import { plugin } from '@s2script/sdk/plugin';\n"
}
```

Assert the wrapper:

- passes `game: undefined` for a global destination and `game: "cs2"` for a CS2 destination;
- copies the generated package only into `plugins/<destination>`;
- writes the correct relative root `tsconfig.base.json` path using `/` separators;
- refuses an existing destination without invoking `generate`;
- removes only the newly created destination when post-generation boundary validation fails;
- always removes its temporary directory.

- [ ] **Step 2: Run creator tests and verify they fail**

Run: `node --test scripts/create-plugin.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `scripts/create-plugin.mjs`.

- [ ] **Step 3: Implement safe destination parsing and generation**

Implement `parsePluginDestination` by converting `\` to `/`, rejecting absolute paths before conversion, splitting on `/`, and requiring every segment to match `/^[a-z0-9][a-z0-9._-]*$/u`. Require at least two segments, classify the first through policy, and use the last as the generator package directory name.

Implement the default generator with the repository-pinned SDK CLI rather than a global command:

```js
function defaultGenerate({ root, temporaryRoot, name, game }) {
  const cli = join(root, "node_modules", "@s2script", "sdk", "dist", "cli.js");
  const args = [cli, "create", name];
  if (game) args.push("--game", game);
  execFileSync(process.execPath, args, { cwd: temporaryRoot, stdio: "inherit" });
}
```

`createPlugin` must require the final destination not to exist, create a unique temporary directory with `mkdtempSync(join(tmpdir(), "edgegamers-create-plugin-"))`, call `generate`, require `<temporaryRoot>/<name>/package.json`, create the destination parent, and recursively copy that generated directory into the destination. Parse the generated `tsconfig.json` with `ts.parseConfigFileTextToJson`, fail on its parse diagnostic, set `extends` to the `/`-normalized value of `relative(destination, join(root, "tsconfig.base.json"))`, write formatted JSON with a trailing newline, and call `validateWorkspaceBoundaries(root)`.

Wrap temporary cleanup in `finally`. Track whether the destination was created by this invocation; on any failure after copying, remove only that exact destination with `rmSync(destination, { recursive: true, force: true })`, then rethrow.

The CLI `main` must require exactly one destination argument, print usage on error, and preserve the generator's output. Do not prompt for scope because it is already explicit in the destination.

- [ ] **Step 4: Run creator tests and a real smoke generation**

Run: `node --test scripts/create-plugin.test.mjs`

Expected: all creator tests PASS.

Run: `npm run create:plugin -- cs22/smoke-plugin`

Expected: FAIL before generation with `unknown game scope cs22`; no directory is created.

Run a real generator smoke test into `global/generator-smoke`, inspect that its manifest/source/tsconfig were generated correctly, then remove only `plugins/global/generator-smoke` because it is an explicit disposable test target.

Expected: generation succeeds, `npm run workspace:check` passes while it exists, and cleanup leaves no tracked or untracked smoke files.

- [ ] **Step 5: Commit the creation wrapper**

```powershell
git add scripts/create-plugin.mjs scripts/create-plugin.test.mjs package.json
git commit -m "feat: add scope-aware plugin creation"
```

### Task 6: Documentation, CI, and End-to-End Verification

**Files:**
- Modify: `.github/workflows/validate.yml:35-58`
- Modify: `.github/CONTRIBUTING.md`
- Modify: `README.md`
- Modify: `packages/README.md`
- Modify: `docs/architecture.md`
- Modify: `docs/plugin-development.md`
- Modify: `docs/getting-started.md`
- Modify: `docs/local-development.md`
- Modify: `docs/SETUP.md`
- Modify: `docs/DESIGN.md`

**Interfaces:**
- Documents: first-segment scope policy, arbitrary deeper layout, dependency matrix, creation command, focused check, and full validation sequence.
- CI: adds `npm test` between typecheck and build.

- [ ] **Step 1: Add the CI test gate**

Insert this step after Typecheck and before Build Source2Script workspace:

```yaml
      - name: Test
        run: npm test
```

Keep the artifact upload path `plugins/**/dist/*.s2sp`; it already supports arbitrary depth.

- [ ] **Step 2: Update contributor-facing documentation**

Make the following statements consistent across all listed documentation:

```text
plugins/global/** and packages/global/** are game-agnostic.
plugins/<game>/** and packages/<game>/** are scoped to a game listed in workspace-policy.json.
Only the first segment is policy; directories below it are free-form.
Global code may use global code only. Game code may use global code and same-game code.
Run npm run workspace:check for a focused result; npm run lint includes it automatically.
Create plugins with npm run create:plugin -- <scope>/<optional folders>/<plugin-name>.
```

Use the concrete migration examples `plugins/global/maul` and `plugins/cs2/ttt`. Replace every remaining flat-workspace example (`plugins/*`, `packages/*`, `plugins/<plugin>`) when it describes repository layout rather than a conceptual artifact destination. Preserve `addons/s2script/plugins/`, which is a runtime server path and not a repository workspace path.

Update every local validation block to include, in order:

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
```

- [ ] **Step 3: Run the complete automated test suite**

Run: `npm test`

Expected: all layout, scanner, boundary, consumer, creator, and existing tests PASS.

- [ ] **Step 4: Run the complete repository gate**

Run these commands separately so a failure is attributable:

```powershell
npm run lint
npm run typecheck
npm run license:check
npm run build
npm run bundles:servers -- --environment development
git diff --check
git status --short
```

Expected:

- lint reports valid workspace boundaries and no ESLint errors;
- typecheck exits 0;
- license policy exits 0;
- both moved plugins produce one `.s2sp` artifact and artifact licensing passes in `postbuild`;
- the development server bundle builds with `@edgegamers/ttt` selected;
- `git diff --check` emits no output;
- `git status --short` lists only the intended tracked implementation and documentation changes, with generated artifacts ignored.

- [ ] **Step 5: Commit documentation and CI**

```powershell
git add .github/workflows/validate.yml .github/CONTRIBUTING.md README.md packages/README.md docs/architecture.md docs/plugin-development.md docs/getting-started.md docs/local-development.md docs/SETUP.md docs/DESIGN.md
git commit -m "docs: explain workspace scope boundaries"
```

- [ ] **Step 6: Review the final commit range**

Run:

```powershell
git log --oneline --decorate 67cb5bf..HEAD
git diff --stat 67cb5bf..HEAD
git diff --check 67cb5bf..HEAD
```

Expected: six focused implementation commits after the design commit, a diff limited to the planned workspace policy/tooling/plugin moves/tests/docs, and no whitespace errors.
