import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";
import {
  collectModuleReferences,
  findSourceFiles,
  resolveRelativeSourceImport,
} from "./source-imports.mjs";
import { makeWorkspace } from "./test-workspace.mjs";

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
  assert.deepEqual(Object.keys(result).sort(), ["hasNonliteralPackageLoad", "references"]);
  assert.deepEqual(result.references.map(({ specifier, runtime, line }) => ({
    specifier, runtime, line,
  })), [
    { specifier: "@s2script/sdk/plugin", runtime: true, line: 1 },
    { specifier: "@s2script/cs2", runtime: false, line: 2 },
    { specifier: "@edgegamers/api", runtime: false, line: 3 },
    { specifier: "@edgegamers/runtime", runtime: true, line: 4 },
    { specifier: "@edgegamers/legacy", runtime: true, line: 5 },
  ]);
  assert.deepEqual(result.references.map(({ column }) => column), [1, 1, 1, 7, 1]);
});

test("reports nonliteral dynamic and require package loads", (t) => {
  const root = makeWorkspace(t, {
    "sample.ts": [
      "import(variable);",
      "require();",
      "require(variable);",
      "",
    ].join("\n"),
  });
  const result = collectModuleReferences(join(root, "sample.ts"));
  assert.equal(result.hasNonliteralPackageLoad, true);
  assert.deepEqual(result.references, []);
});

test("treats empty named imports and exports as runtime module references", (t) => {
  const root = makeWorkspace(t, {
    "sample.ts": [
      'import {} from "@edgegamers/import-side-effect";',
      'export {} from "@edgegamers/export-side-effect";',
      "",
    ].join("\n"),
  });
  const result = collectModuleReferences(join(root, "sample.ts"));
  assert.deepEqual(result.references.map(({ specifier, runtime }) => ({ specifier, runtime })), [
    { specifier: "@edgegamers/import-side-effect", runtime: true },
    { specifier: "@edgegamers/export-side-effect", runtime: true },
  ]);
});

test("collects literal dynamic imports with options", (t) => {
  const root = makeWorkspace(t, {
    "sample.ts": 'await import("./data.json", { with: { type: "json" } });\n',
  });
  const result = collectModuleReferences(join(root, "sample.ts"));
  assert.equal(result.hasNonliteralPackageLoad, false);
  assert.deepEqual(result.references.map(({ specifier, runtime, line, column }) => ({
    specifier, runtime, line, column,
  })), [
    { specifier: "./data.json", runtime: true, line: 1, column: 7 },
  ]);
});

test("discovers supported source files while excluding generated output and declarations by default", (t) => {
  const root = makeWorkspace(t, {
    "src/index.ts": "",
    "src/component.tsx": "",
    "src/types.d.ts": "",
    "src/module.d.mts": "",
    "src/common.d.cts": "",
    "node_modules/ignored.ts": "",
    "dist/ignored.ts": "",
    ".s2script/ignored.ts": "",
  });
  assert.deepEqual(findSourceFiles(root).map((path) => path.slice(root.length + 1).replaceAll("\\", "/")), [
    "src/component.tsx",
    "src/index.ts",
  ]);
  assert.deepEqual(findSourceFiles(root, { includeDeclarations: true })
    .map((path) => path.slice(root.length + 1).replaceAll("\\", "/")), [
      "src/common.d.cts",
      "src/component.tsx",
      "src/index.ts",
      "src/module.d.mts",
      "src/types.d.ts",
    ]);
});

test("resolves TypeScript substitutions, declarations, and index modules", (t) => {
  const root = makeWorkspace(t, {
    "src/consumer.ts": "",
    "src/api.ts": "",
    "src/contracts.d.ts": "",
    "src/feature/index.ts": "",
  });
  const sourceFiles = new Set(findSourceFiles(root, { includeDeclarations: true }));
  for (const [specifier, expected] of [
    ["./api.js", "src/api.ts"],
    ["./contracts", "src/contracts.d.ts"],
    ["./feature", "src/feature/index.ts"],
  ]) {
    const result = resolveRelativeSourceImport({
      sourcePath: join(root, "src/consumer.ts"), specifier, sourceFiles,
    });
    assert.equal(result.target, join(root, expected));
    assert.equal(result.error, undefined);
  }
});
