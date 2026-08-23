import assert from "node:assert/strict";
import test from "node:test";
import { evaluateChangesetCoverage } from "./changeset-policy.mjs";

test("matches changed files within recursive plugin directories without prefix collisions", () => {
  const plugins = [
    {
      directory: "plugins/cs2/servers/ttt",
      name: "@edgegamers/ttt",
      private: false,
    },
    {
      directory: "plugins/global/maul",
      name: "@edgegamers/maul",
      private: false,
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
