import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateChangesetCoverage,
  findUnsupportedPublicRetirements,
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
    actor: "github-actions[bot]",
    headRepository: "edgegamers/edgegamers-s2s",
    repository: "edgegamers/edgegamers-s2s",
    changes: [
      { status: "D", path: ".changeset/public-fix.md" },
      { status: "M", path: "plugins/global/public/package.json" },
      { status: "A", path: "plugins/global/public/CHANGELOG.md" },
    ],
    pluginDirectories: new Set(["plugins/global/public"]),
  };
  assert.equal(isTrustedVersionPullRequest(expected), true);
  for (const [field, value] of [
    ["eventName", "workflow_dispatch"],
    ["baseRef", "main"],
    ["headRef", "changeset-release/lookalike"],
    ["author", "developer"],
    ["actor", "developer"],
    ["headRepository", "developer/edgegamers-s2s"],
    ["repository", "edgegamers/lookalike"],
  ]) {
    assert.equal(isTrustedVersionPullRequest({ ...expected, [field]: value }), false);
  }
});

test("rejects version pull requests containing non-generated or lookalike paths", () => {
  const expected = {
    eventName: "pull_request",
    baseRef: "dev",
    headRef: "changeset-release/dev",
    author: "github-actions[bot]",
    actor: "github-actions[bot]",
    headRepository: "edgegamers/edgegamers-s2s",
    repository: "edgegamers/edgegamers-s2s",
    pluginDirectories: new Set(["plugins/global/public"]),
  };
  for (const change of [
    { status: "M", path: ".changeset/config.json" },
    { status: "M", path: ".changeset/README.md" },
    { status: "A", path: ".changeset/not-a-release.txt" },
    { status: "M", path: "plugins/global/public/src/plugin.ts" },
    { status: "M", path: "plugins/global/public/package.json.bak" },
    { status: "M", path: "plugins/global/public/CHANGELOG.md/extra" },
    { status: "M", path: ".github/workflows/validate.yml" },
    { status: "M", path: "scripts/check-changeset.mjs" },
  ]) {
    assert.equal(isTrustedVersionPullRequest({
      ...expected,
      changes: [change],
    }), false, `${change.status} ${change.path}`);
  }
});

test("ignores clearly non-runtime plugin files but still requires runtime coverage", () => {
  const plugins = [{
    directory: "plugins/global/public",
    name: "@edgegamers/public",
    manifest: { private: false },
  }];
  const nonRuntimeFiles = [
    "plugins/global/public/README",
    "plugins/global/public/readme.md",
    "plugins/global/public/README.development.md",
    "plugins/global/public/docs/configuration.md",
    "plugins/global/public/test/plugin.ts",
    "plugins/global/public/tests/plugin.ts",
    "plugins/global/public/src/plugin.test.ts",
    "plugins/global/public/src/plugin.spec.mts",
    "plugins/global/public/.github/workflows/test.yml",
    "plugins/global/public/.gitlab-ci.yml",
  ];

  assert.deepEqual(evaluateChangesetCoverage({
    changedFiles: nonRuntimeFiles,
    plugins,
    coveredPackages: new Set(),
  }), {
    affectedPackages: [],
    missingPackages: [],
  });
  assert.deepEqual(evaluateChangesetCoverage({
    changedFiles: [
      ...nonRuntimeFiles,
      "plugins/global/public/src/plugin.ts",
      "plugins/global/public/package.json",
    ],
    plugins,
    coveredPackages: new Set(),
  }), {
    affectedPackages: ["@edgegamers/public"],
    missingPackages: ["@edgegamers/public"],
  });
});

test("reports direct deletion and de-publication of base-public plugins", () => {
  const basePlugins = [
    {
      directory: "plugins/global/deleted",
      name: "@edgegamers/deleted",
      manifest: { private: false },
    },
    {
      directory: "plugins/global/private-now",
      name: "@edgegamers/private-now",
      manifest: { private: false },
    },
    {
      directory: "plugins/global/still-public",
      name: "@edgegamers/still-public",
      manifest: { private: false },
    },
  ];
  const headPlugins = [
    {
      directory: "plugins/global/private-now",
      name: "@edgegamers/private-now",
      manifest: { private: true },
    },
    {
      directory: "plugins/global/still-public",
      name: "@edgegamers/still-public",
      manifest: { private: false },
    },
  ];

  assert.deepEqual(findUnsupportedPublicRetirements({
    basePlugins,
    headPlugins,
  }), [
    {
      directory: "plugins/global/deleted",
      name: "@edgegamers/deleted",
      reason: "deleted",
    },
    {
      directory: "plugins/global/private-now",
      name: "@edgegamers/private-now",
      reason: "changed to private",
    },
  ]);
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
