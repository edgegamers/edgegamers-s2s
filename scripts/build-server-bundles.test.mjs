import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { discoverWorkspacePlugins } from "./build-server-bundles.mjs";
import { parseServerBundleList } from "./lib/server-bundle-list.mjs";
import { createServerBundlePlan } from "./lib/server-bundle-plan.mjs";
import { BASE_POLICY, makeWorkspace } from "./lib/test-workspace.mjs";

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));

test("discovers nested workspace plugins for server bundle planning", (t) => {
  const root = makeWorkspace(t, {
    "workspace-policy.json": BASE_POLICY,
    "plugins/cs2/servers/ttt/package.json": { name: "@edgegamers/ttt", private: true },
    "plugins/global/maul/package.json": { name: "@edgegamers/maul", private: true },
  });

  assert.deepEqual(discoverWorkspacePlugins(root), [
    { packageName: "@edgegamers/ttt", directory: "plugins/cs2/servers/ttt" },
    { packageName: "@edgegamers/maul", directory: "plugins/global/maul" },
  ].sort((left, right) => left.packageName.localeCompare(right.packageName)));
});

test("plans the current TTT server from staged modular packages", () => {
  const selectedPackages = parseServerBundleList(
    readFileSync(join(repositoryRoot, "server-bundles", "ttt-s2s.txt"), "utf8"),
  );
  const workspacePlugins = discoverWorkspacePlugins(repositoryRoot);
  const plan = createServerBundlePlan({
    server: "ttt-s2s",
    environment: "development",
    commit: "test",
    generatedAt: "2026-08-26T00:00:00.000Z",
    selectedPackages,
    workspacePlugins,
    artifactFiles: selectedPackages.map((packageName) => ({
      packageName,
      path: `artifacts/${packageName}.s2sp`,
      bytes: Buffer.from(packageName),
    })),
  });

  assert.deepEqual(
    plan.manifest.plugins.map((plugin) => plugin.packageName),
    ["@edgegamers/blackbox", "@edgegamers/ttt-core"],
  );
});
