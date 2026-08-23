import assert from "node:assert/strict";
import test from "node:test";
import { main as checkWorkspaceBoundaries } from "../check-workspace-boundaries.mjs";
import { validateWorkspaceBoundaries } from "./workspace-boundary-policy.mjs";
import { BASE_POLICY, makeWorkspace } from "./test-workspace.mjs";

function packageFiles({ directory, name, dependencies, source = "", extraManifest = {} }) {
  return {
    [`${directory}/package.json`]: { name, dependencies, ...extraManifest },
    [`${directory}/src/index.ts`]: source,
  };
}

function matrixWorkspace(t, sourceDirectory, targetName, { policy = BASE_POLICY, extra = {} } = {}) {
  const sourceName = "@edgegamers/a";
  return makeWorkspace(t, {
    "workspace-policy.json": policy,
    ...packageFiles({
      directory: sourceDirectory,
      name: sourceName,
      source: `import { value } from "${targetName}";\n`,
    }),
    ...packageFiles({
      directory: targetName.includes("global") ? "packages/global/b"
        : targetName.includes("dota") ? "packages/dota2/b" : "packages/cs2/b",
      name: targetName,
    }),
    ...extra,
  });
}

const cases = [
  ["global imports global", "plugins/global/a", "@edgegamers/global-b", []],
  ["cs2 imports global", "plugins/cs2/a", "@edgegamers/global-b", []],
  ["cs2 imports cs2", "plugins/cs2/a", "@edgegamers/cs2-b", []],
  ["global rejects cs2", "plugins/global/a", "@edgegamers/cs2-b",
    ["plugins/global/a/src/index.ts:1:1 -> @edgegamers/cs2-b: global code cannot reference cs2-scoped package @edgegamers/cs2-b"]],
  ["cs2 rejects another game", "plugins/cs2/a", "@edgegamers/dota-b",
    ["plugins/cs2/a/src/index.ts:1:1 -> @edgegamers/dota-b: cs2 code cannot reference dota2-scoped package @edgegamers/dota-b"]],
];

for (const [name, sourceDirectory, targetName, expected] of cases) {
  test(name, (t) => {
    const crossGame = name === "cs2 rejects another game";
    const root = matrixWorkspace(t, sourceDirectory, targetName, crossGame ? {
      policy: {
        ...BASE_POLICY,
        games: ["cs2", "dota2"],
      },
    } : {});
    assert.deepEqual(validateWorkspaceBoundaries(root), expected);
  });
}

test("uses the owning package scope for relative cross-package imports", (t) => {
  const root = makeWorkspace(t, {
    "workspace-policy.json": BASE_POLICY,
    ...packageFiles({
      directory: "plugins/global/a",
      name: "@edgegamers/a",
      source: 'import { value } from "../../../../packages/cs2/b/src/api";\n',
    }),
    ...packageFiles({ directory: "packages/cs2/b", name: "@edgegamers/b" }),
    "packages/cs2/b/src/api.ts": "export const value = 1;\n",
  });
  assert.deepEqual(validateWorkspaceBoundaries(root), [
    "plugins/global/a/src/index.ts:1:1 -> @edgegamers/b: global code cannot reference cs2-scoped package @edgegamers/b",
  ]);
});

test("checks all manifest dependency maps and Source2Script dependency fields", (t) => {
  const fields = {
    dependencies: { "@edgegamers/cs2-b": "*" },
    devDependencies: { "@edgegamers/cs2-b": "*" },
    optionalDependencies: { "@edgegamers/cs2-b": "*" },
    peerDependencies: { "@edgegamers/cs2-b": "*" },
    s2script: {
      pluginDependencies: { "@edgegamers/cs2-b": "*" },
      optionalPluginDependencies: { "@edgegamers/cs2-b": "*" },
      libraries: { "@edgegamers/cs2-b": "*" },
    },
  };
  const root = makeWorkspace(t, {
    "workspace-policy.json": BASE_POLICY,
    ...packageFiles({ directory: "plugins/global/a", name: "@edgegamers/a", extraManifest: fields }),
    ...packageFiles({ directory: "packages/cs2/b", name: "@edgegamers/cs2-b" }),
  });
  assert.deepEqual(validateWorkspaceBoundaries(root), [
    "plugins/global/a/package.json -> @edgegamers/cs2-b: global code cannot reference cs2-scoped package @edgegamers/cs2-b",
  ]);
});

test("classifies configured Source2Script packages and rejects unknown Source2Script packages", (t) => {
  const root = makeWorkspace(t, {
    "workspace-policy.json": BASE_POLICY,
    ...packageFiles({
      directory: "plugins/global/a",
      name: "@edgegamers/a",
      source: [
        'import "@s2script/sdk/chat";',
        'import "@s2script/cs2";',
        'import "@s2script/dota2";',
        'import "lodash";',
        "",
      ].join("\n"),
    }),
  });
  assert.deepEqual(validateWorkspaceBoundaries(root), [
    "plugins/global/a/src/index.ts:2:1 -> @s2script/cs2: global code cannot reference cs2-scoped package @s2script/cs2",
    "plugins/global/a/src/index.ts:3:1 -> @s2script/dota2: unclassified Source2Script package @s2script/dota2; add it to workspace-policy.json",
  ]);
});

test("reports nonliteral loads and sorts diagnostics by source location and target", (t) => {
  const root = makeWorkspace(t, {
    "workspace-policy.json": BASE_POLICY,
    ...packageFiles({
      directory: "plugins/global/a",
      name: "@edgegamers/a",
      source: [
        'import "@edgegamers/cs2-b";',
        "require(variable);",
        'import "@s2script/cs2";',
        "",
      ].join("\n"),
    }),
    ...packageFiles({ directory: "packages/cs2/b", name: "@edgegamers/cs2-b" }),
  });
  assert.deepEqual(validateWorkspaceBoundaries(root), [
    "plugins/global/a/src/index.ts:1:1 -> @edgegamers/cs2-b: global code cannot reference cs2-scoped package @edgegamers/cs2-b",
    "plugins/global/a/src/index.ts:2: package-loading call must use a string literal so workspace boundaries can be validated",
    "plugins/global/a/src/index.ts:3:1 -> @s2script/cs2: global code cannot reference cs2-scoped package @s2script/cs2",
  ]);
});

test("reports multiple layout errors for one manifest deterministically", (t) => {
  const root = makeWorkspace(t, {
    "workspace-policy.json": BASE_POLICY,
    "plugins/cs2/outer/package.json": { name: "@edgegamers/outer" },
    "plugins/cs2/outer/inner/package.json": { name: "@edgegamers/inner" },
    "plugins/cs2/outer/inner/leaf/package.json": { name: "@edgegamers/leaf" },
  });
  assert.deepEqual(validateWorkspaceBoundaries(root), [
    "plugins/cs2/outer/inner/leaf/package.json: package root is nested inside plugins/cs2/outer",
    "plugins/cs2/outer/inner/leaf/package.json: package root is nested inside plugins/cs2/outer/inner",
    "plugins/cs2/outer/inner/package.json: package root is nested inside plugins/cs2/outer",
  ]);
});

const malformedManifestContainers = [
  ["dependencies", (value) => ({ dependencies: value })],
  ["devDependencies", (value) => ({ devDependencies: value })],
  ["optionalDependencies", (value) => ({ optionalDependencies: value })],
  ["peerDependencies", (value) => ({ peerDependencies: value })],
  ["s2script", (value) => ({ s2script: value })],
  ["s2script.pluginDependencies", (value) => ({
    s2script: { pluginDependencies: value },
  })],
  ["s2script.optionalPluginDependencies", (value) => ({
    s2script: { optionalPluginDependencies: value },
  })],
  ["s2script.libraries", (value) => ({ s2script: { libraries: value } })],
];

for (const [field, manifestFields] of malformedManifestContainers) {
  test(`rejects malformed ${field} containers`, (t) => {
    for (const [shape, value] of [
      ["string", "@edgegamers/cs2-b"],
      ["array", ["@edgegamers/cs2-b"]],
      ["null", null],
    ]) {
      const root = makeWorkspace(t, {
        "workspace-policy.json": BASE_POLICY,
        ...packageFiles({
          directory: "plugins/global/a",
          name: "@edgegamers/a",
          extraManifest: manifestFields(value),
        }),
      });
      assert.deepEqual(validateWorkspaceBoundaries(root), [
        `plugins/global/a/package.json: ${field} must be a plain object`,
      ], `${shape} ${field}`);
    }
  });
}

test("boundary CLI reports failures and successes through injected writers", (t) => {
  const invalidRoot = makeWorkspace(t, {
    "workspace-policy.json": BASE_POLICY,
    ...packageFiles({ directory: "plugins/global/a", name: "@edgegamers/a", dependencies: { "@edgegamers/b": "*" } }),
    ...packageFiles({ directory: "packages/cs2/b", name: "@edgegamers/b" }),
  });
  const output = [];
  const errors = [];
  assert.equal(checkWorkspaceBoundaries({ root: invalidRoot, write: (line) => output.push(line), error: (line) => errors.push(line) }), 1);
  assert.deepEqual(output, []);
  assert.deepEqual(errors, [
    "Workspace boundary check failed:",
    "- plugins/global/a/package.json -> @edgegamers/b: global code cannot reference cs2-scoped package @edgegamers/b",
  ]);

  const validRoot = makeWorkspace(t, {
    "workspace-policy.json": BASE_POLICY,
    ...packageFiles({ directory: "plugins/global/a", name: "@edgegamers/a" }),
  });
  assert.equal(checkWorkspaceBoundaries({ root: validRoot, write: (line) => output.push(line), error: (line) => errors.push(line) }), 0);
  assert.equal(output.at(-1), "Workspace boundaries are valid.");
});

test("boundary CLI reports validation exceptions through its error writer", (t) => {
  const root = makeWorkspace(t, {
    "workspace-policy.json": "{ invalid",
  });
  const output = [];
  const errors = [];
  assert.equal(checkWorkspaceBoundaries({
    root,
    write: (line) => output.push(line),
    error: (line) => errors.push(line),
  }), 1);
  assert.deepEqual(output, []);
  assert.equal(errors[0], "Workspace boundary check failed:");
  assert.match(errors[1], /^- Unable to read workspace policy:/u);
  assert.equal(errors.length, 2);
});
