import assert from "node:assert/strict";
import test from "node:test";
import { discoverWorkspacePlugins } from "./build-server-bundles.mjs";
import { BASE_POLICY, makeWorkspace } from "./lib/test-workspace.mjs";

test("discovers nested workspace plugins for server bundle planning", (t) => {
  const root = makeWorkspace(t, {
    "workspace-policy.json": BASE_POLICY,
    "plugins/cs2/servers/ttt/package.json": { name: "@edgegamers/ttt" },
    "plugins/global/maul/package.json": { name: "@edgegamers/maul" },
  });

  assert.deepEqual(discoverWorkspacePlugins(root), [
    { packageName: "@edgegamers/ttt", directory: "plugins/cs2/servers/ttt" },
    { packageName: "@edgegamers/maul", directory: "plugins/global/maul" },
  ].sort((left, right) => left.packageName.localeCompare(right.packageName)));
});
