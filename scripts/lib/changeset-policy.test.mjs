import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateChangesetCoverage,
  isTrustedVersionPullRequest,
  parseChangesetPackages,
} from "./changeset-policy.mjs";
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
    {
      directory: "plugins/global/other",
      name: "@edgegamers/other",
      manifest: { private: false },
    },
  ];

  assert.deepEqual(evaluateChangesetCoverage({
    changedFiles: [
      "plugins/cs2/servers/ttt/src/plugin.ts",
      "plugins/global/other/src/plugin.ts",
    ],
    plugins,
    coveredPackages: new Set(["@edgegamers/ttt"]),
  }), {
    affectedPackages: ["@edgegamers/other", "@edgegamers/ttt"],
    missingPackages: ["@edgegamers/other"],
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

test("parses covered packages and reports malformed release lines", () => {
  assert.deepEqual(parseChangesetPackages([{
    path: ".changeset/release.md",
    content: [
      "---",
      '"@edgegamers/one": patch',
      '"@edgegamers/two": minor',
      "---",
      "Release both plugins.",
      "",
    ].join("\n"),
  }]), new Set(["@edgegamers/one", "@edgegamers/two"]));

  assert.throws(() => parseChangesetPackages([{
    path: ".changeset/bad.md",
    content: "---\n\"@edgegamers/one\": huge\n---\nBad bump.\n",
  }]), /\.changeset\/bad\.md: invalid release line/u);
});

test("trusts only the exact bot-authored dev version pull request", () => {
  const expected = {
    eventName: "pull_request",
    baseRef: "dev",
    headRef: "changeset-release/dev",
    author: "github-actions[bot]",
  };
  assert.equal(isTrustedVersionPullRequest(expected), true);
  for (const [field, value] of [
    ["eventName", "workflow_dispatch"],
    ["baseRef", "main"],
    ["headRef", "changeset-release/lookalike"],
    ["author", "developer"],
  ]) {
    assert.equal(isTrustedVersionPullRequest({ ...expected, [field]: value }), false);
  }
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
