import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join, relative } from "node:path";
import {
  discoverSource2ScriptPluginManifests,
  discoverWorkspaceManifests,
  validateRepositoryLicensing,
} from "./license-policy.mjs";
import { BASE_POLICY, makeWorkspace } from "./test-workspace.mjs";

function manifestPaths(root, manifests) {
  return manifests.map(({ path }) => relative(root, path).replaceAll("\\", "/"));
}

function makeLicensedPluginWorkspace(t, {
  main = "src/plugin.ts",
  withMain = true,
  entryBody = "export {};",
  sourceFiles = {},
}) {
  const repositoryRoot = process.cwd();
  const mit = readFileSync(join(repositoryRoot, "licenses/MIT.txt"), "utf8");
  const normalizedMit = mit.replaceAll("\r\n", "\n");
  return makeWorkspace(t, {
    "workspace-policy.json": BASE_POLICY,
    "package.json": {
      name: "@edgegamers/root",
      license: "MIT OR Apache-2.0",
      workspaces: ["plugins/*/**", "packages/*/**"],
      s2script: { workspace: { plugins: ["plugins/*/**"] } },
    },
    "LICENSE": readFileSync(join(repositoryRoot, "LICENSE"), "utf8"),
    ".github/CONTRIBUTING.md": readFileSync(join(repositoryRoot, ".github/CONTRIBUTING.md"), "utf8"),
    "licenses/MIT.txt": mit,
    "licenses/Apache-2.0.txt": readFileSync(join(repositoryRoot, "licenses/Apache-2.0.txt"), "utf8"),
    "licenses/NOTICE": readFileSync(join(repositoryRoot, "licenses/NOTICE"), "utf8"),
    "licenses/README.md": readFileSync(join(repositoryRoot, "licenses/README.md"), "utf8"),
    "plugins/global/example/package.json": {
      name: "@edgegamers/example",
      license: "MIT OR Apache-2.0",
      private: true,
      ...(withMain ? { main } : {}),
      s2script: { apiVersion: "1.x" },
    },
    ...sourceFiles,
    [`plugins/global/example/${main}`]: sourceFiles[`plugins/global/example/${main}`]
      ?? `/*!\n${normalizedMit}*/\n${entryBody}\n`,
  });
}

test("discovers recursive workspace and Source2Script plugin manifests", (t) => {
  const root = makeWorkspace(t, {
    "workspace-policy.json": BASE_POLICY,
    "package.json": {
      name: "@edgegamers/root",
      workspaces: ["plugins/*/**", "packages/*/**"],
      s2script: { workspace: { plugins: ["plugins/*/**"] } },
    },
    "plugins/global/maul/package.json": { name: "@edgegamers/maul", private: true },
    "plugins/cs2/servers/ttt/package.json": { name: "@edgegamers/ttt", private: true },
    "packages/global/config/package.json": { name: "@edgegamers/config" },
  });

  assert.deepEqual(manifestPaths(root, discoverWorkspaceManifests(root)), [
    "package.json",
    "packages/global/config/package.json",
    "plugins/cs2/servers/ttt/package.json",
    "plugins/global/maul/package.json",
  ]);
  assert.deepEqual(manifestPaths(root, discoverSource2ScriptPluginManifests(root)), [
    "plugins/cs2/servers/ttt/package.json",
    "plugins/global/maul/package.json",
  ]);
});

test("does not validate test-only Node imports as plugin runtime dependencies", (t) => {
  const root = makeLicensedPluginWorkspace(t, {
    sourceFiles: {
      "plugins/global/example/test/plugin.test.ts": 'import test from "node:test";\ntest("fixture", () => {});\n',
    },
  });

  assert.deepEqual(validateRepositoryLicensing(root), []);
});

test("does not validate co-located test files as plugin runtime dependencies", (t) => {
  const root = makeLicensedPluginWorkspace(t, {
    sourceFiles: {
      "plugins/global/example/src/channel.test.ts": 'import test from "node:test";\ntest("fixture", () => {});\n',
    },
  });

  assert.deepEqual(validateRepositoryLicensing(root), []);
});

test("resolves an emitted JavaScript entry to source without validating co-located tests", (t) => {
  const root = makeLicensedPluginWorkspace(t, {
    main: "dist/plugin.js",
    sourceFiles: {
      "plugins/global/example/src/plugin.ts": "export {};\n",
      "plugins/global/example/src/plugin.test.ts": 'import test from "node:test";\ntest("fixture", () => {});\n',
    },
  });

  assert.deepEqual(validateRepositoryLicensing(root), []);
});

test("does not broaden runtime validation when a plugin has no entry", (t) => {
  const root = makeLicensedPluginWorkspace(t, {
    withMain: false,
    sourceFiles: {
      "plugins/global/example/src/plugin.test.ts": 'import test from "node:test";\ntest("fixture", () => {});\n',
    },
  });

  assert.deepEqual(validateRepositoryLicensing(root), []);
});

test("validates runtime files reachable from the plugin entry", (t) => {
  const root = makeLicensedPluginWorkspace(t, {
    entryBody: 'import "./runtime.ts";',
    sourceFiles: {
      "plugins/global/example/src/runtime.ts": 'import test from "node:test";\nvoid test;\n',
    },
  });

  assert.deepEqual(validateRepositoryLicensing(root), [
    "plugins/global/example/src/runtime.ts -> node:test: bare runtime import is not an approved plugin dependency or licensed first-party bundled library",
  ]);
});

test("validates an entry point under a test directory", (t) => {
  const root = makeLicensedPluginWorkspace(t, {
    main: "test/plugin.ts",
    entryBody: 'import test from "node:test";\nvoid test;',
  });

  assert.deepEqual(validateRepositoryLicensing(root), [
    "plugins/global/example/test/plugin.ts -> node:test: bare runtime import is not an approved plugin dependency or licensed first-party bundled library",
  ]);
});
