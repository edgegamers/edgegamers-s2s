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
    "plugins/global/platform/maul/package.json": { name: "@edgegamers/maul", private: true },
    "plugins/cs2/servers/ttt/package.json": { name: "@edgegamers/ttt", private: true },
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
    "plugins/cs2/outer/package.json": { name: "@edgegamers/duplicate", private: true },
    "plugins/cs2/outer/inner/package.json": { name: "@edgegamers/inner", private: true },
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

test("requires explicit boolean publication state for plugins only", (t) => {
  const root = makeWorkspace(t, {
    "workspace-policy.json": BASE_POLICY,
    "plugins/global/private/package.json": {
      name: "@edgegamers/private",
      private: true,
    },
    "plugins/global/public/package.json": {
      name: "@edgegamers/public",
      private: false,
    },
    "plugins/global/missing/package.json": { name: "@edgegamers/missing" },
    "plugins/global/string/package.json": {
      name: "@edgegamers/string",
      private: "false",
    },
    "packages/global/shared/package.json": { name: "@edgegamers/shared" },
  });

  const result = inspectWorkspaceLayout(root);
  assert.deepEqual(result.errors, [
    "plugins/global/missing/package.json: plugin manifest requires an explicit boolean private field",
    "plugins/global/string/package.json: plugin manifest requires an explicit boolean private field",
  ]);
  assert.equal(result.byName.get("@edgegamers/private").manifest.private, true);
  assert.equal(result.byName.get("@edgegamers/public").manifest.private, false);
});

test("reports nesting beneath an invalid outer manifest", (t) => {
  const root = makeWorkspace(t, {
    "workspace-policy.json": BASE_POLICY,
    "plugins/cs2/outer/package.json": "{ invalid",
    "plugins/cs2/outer/inner/package.json": { name: "@edgegamers/inner", private: true },
  });
  assert.deepEqual(inspectWorkspaceLayout(root).errors, [
    "plugins/cs2/outer/inner/package.json: package root is nested inside plugins/cs2/outer",
    "plugins/cs2/outer/package.json: invalid package manifest",
  ]);
});
