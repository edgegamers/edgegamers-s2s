import assert from "node:assert/strict";
import test from "node:test";
import { relative } from "node:path";
import {
  discoverSource2ScriptPluginManifests,
  discoverWorkspaceManifests,
} from "./license-policy.mjs";
import { BASE_POLICY, makeWorkspace } from "./test-workspace.mjs";

function manifestPaths(root, manifests) {
  return manifests.map(({ path }) => relative(root, path).replaceAll("\\", "/"));
}

test("discovers recursive workspace and Source2Script plugin manifests", (t) => {
  const root = makeWorkspace(t, {
    "workspace-policy.json": BASE_POLICY,
    "package.json": {
      name: "@edgegamers/root",
      workspaces: ["plugins/*/**", "packages/*/**"],
      s2script: { workspace: { plugins: ["plugins/*/**"] } },
    },
    "plugins/global/maul/package.json": { name: "@edgegamers/maul" },
    "plugins/cs2/servers/ttt/package.json": { name: "@edgegamers/ttt" },
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
