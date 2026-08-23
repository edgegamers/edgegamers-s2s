import assert from "node:assert/strict";
import test from "node:test";
import { evaluateChangesetCoverage } from "./changeset-policy.mjs";
import { BASE_POLICY, makeWorkspace } from "./test-workspace.mjs";
import { requireValidWorkspaceLayout } from "./workspace-layout.mjs";

test("matches changed files within recursive plugin directories without prefix collisions", () => {
  const plugins = [
    {
      directory: "plugins/cs2/servers/ttt",
      name: "@edgegamers/ttt",
      manifest: { private: false },
    },
    {
      directory: "plugins/global/maul",
      name: "@edgegamers/maul",
      manifest: { private: false },
    },
  ];

  assert.deepEqual(evaluateChangesetCoverage({
    changedFiles: ["plugins/cs2/servers/ttt/src/plugin.ts"],
    plugins,
    coveredPackages: new Set(),
  }), {
    affectedPackages: ["@edgegamers/ttt"],
    missingPackages: ["@edgegamers/ttt"],
  });
  assert.deepEqual(evaluateChangesetCoverage({
    changedFiles: ["plugins/cs2/servers/ttt-extra/src/plugin.ts"],
    plugins,
    coveredPackages: new Set(),
  }), {
    affectedPackages: [],
    missingPackages: [],
  });
});

test("ignores private plugins from recursive workspace-layout records", (t) => {
  const root = makeWorkspace(t, {
    "workspace-policy.json": BASE_POLICY,
    "plugins/cs2/servers/private/package.json": {
      name: "@edgegamers/private",
      private: true,
    },
  });
  const { packages } = requireValidWorkspaceLayout(root);

  assert.deepEqual(evaluateChangesetCoverage({
    changedFiles: ["plugins/cs2/servers/private/src/plugin.ts"],
    plugins: packages,
    coveredPackages: new Set(),
  }), {
    affectedPackages: [],
    missingPackages: [],
  });
});
