import assert from "node:assert/strict";
import test from "node:test";
import { main as checkChangeset } from "./check-changeset.mjs";
import { BASE_POLICY, makeWorkspace } from "./lib/test-workspace.mjs";

const TRUSTED_RELEASE_CONTEXT = {
  eventName: "pull_request",
  baseRef: "dev",
  headRef: "changeset-release/dev",
  author: "github-actions[bot]",
  actor: "github-actions[bot]",
  headRepository: "edgegamers/edgegamers-s2s",
  repository: "edgegamers/edgegamers-s2s",
};

function runCheck(t, {
  releaseContext,
  files = {},
  includeHeadPublic = true,
  changedOutput = "M\tplugins/global/public/src/plugin.ts",
  baseManifests = {
    "plugins/global/public/package.json": {
      name: "@edgegamers/public",
      private: false,
    },
  },
} = {}) {
  const workspaceFiles = {
    "workspace-policy.json": BASE_POLICY,
    ...files,
  };
  if (includeHeadPublic && !("plugins/global/public/package.json" in files)) {
    workspaceFiles["plugins/global/public/package.json"] = {
      name: "@edgegamers/public",
      private: false,
    };
  }
  const root = makeWorkspace(t, workspaceFiles);
  const output = [];
  const warnings = [];
  const errors = [];
  const exitCode = checkChangeset({
    root,
    baseRef: "origin/dev",
    releaseContext,
    git(args) {
      if (args[0] === "merge-base") return "base-sha";
      if (args[0] === "diff") return changedOutput;
      if (args[0] === "ls-tree") return Object.keys(baseManifests).join("\n");
      if (args[0] === "show") {
        const path = args[1].slice("base-sha:".length);
        return JSON.stringify(baseManifests[path]);
      }
      throw new Error(`Unexpected git call: ${args.join(" ")}`);
    },
    write: (line) => output.push(line),
    warn: (line) => warnings.push(line),
    error: (line) => errors.push(line),
  });
  return { exitCode, output, warnings, errors };
}

test("rejects ordinary public changes without a Changeset", (t) => {
  const result = runCheck(t, {
    releaseContext: {
      eventName: "pull_request",
      baseRef: "dev",
      headRef: "feature/plugin",
      author: "developer",
      actor: "developer",
      headRepository: "edgegamers/edgegamers-s2s",
      repository: "edgegamers/edgegamers-s2s",
    },
  });
  assert.equal(result.exitCode, 1);
  assert.deepEqual(result.warnings, []);
  assert.deepEqual(result.errors, [
    "A Changeset is required for changed public plugins:",
    "- @edgegamers/public",
    "Run `npm run changeset` and commit the generated .changeset file.",
  ]);
});

test("allows only the trusted version pull request to consume Changesets", (t) => {
  const result = runCheck(t, {
    releaseContext: TRUSTED_RELEASE_CONTEXT,
    changedOutput: [
      "D\t.changeset/public-fix.md",
      "M\tplugins/global/public/package.json",
      "A\tplugins/global/public/CHANGELOG.md",
    ].join("\n"),
  });
  assert.equal(result.exitCode, 0);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.warnings, [
    "Trusted version pull request may consume Changesets for: @edgegamers/public",
  ]);
});

test("allows production promotion from dev after Changesets are consumed", (t) => {
  const result = runCheck(t, {
    releaseContext: {
      eventName: "pull_request",
      baseRef: "main",
      headRef: "dev",
      author: "developer",
      actor: "developer",
      headRepository: "edgegamers/edgegamers-s2s",
      repository: "edgegamers/edgegamers-s2s",
    },
    changedOutput: [
      "M\tplugins/global/public/src/plugin.ts",
      "M\tplugins/global/public/package.json",
      "A\tplugins/global/public/CHANGELOG.md",
    ].join("\n"),
  });

  assert.equal(result.exitCode, 0);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.warnings, [
    "Production promotion from dev may contain already-versioned public changes for: @edgegamers/public",
  ]);
});

test("does not let a pre-existing base Changeset cover a later pull request", (t) => {
  const result = runCheck(t, {
    files: {
      ".changeset/prior.md": [
        "---",
        '"@edgegamers/public": patch',
        "---",
        "An earlier change.",
        "",
      ].join("\n"),
    },
  });

  assert.equal(result.exitCode, 1);
  assert.match(result.errors.join("\n"), /@edgegamers\/public/u);
});

test("accepts a newly added pull-request Changeset for the changed public plugin", (t) => {
  const result = runCheck(t, {
    files: {
      ".changeset/current.md": [
        "---",
        '"@edgegamers/public": patch',
        "---",
        "The current change.",
        "",
      ].join("\n"),
    },
    changedOutput: [
      "M\tplugins/global/public/src/plugin.ts",
      "A\t.changeset/current.md",
    ].join("\n"),
  });

  assert.equal(result.exitCode, 0);
  assert.deepEqual(result.output, ["Changesets cover: @edgegamers/public"]);
});

test("accepts a pull-request modification to an existing Changeset", (t) => {
  const result = runCheck(t, {
    files: {
      ".changeset/revised.md": [
        "---",
        '"@edgegamers/public": minor',
        "---",
        "The current pull request revised this release intent.",
        "",
      ].join("\n"),
    },
    changedOutput: [
      "M\tplugins/global/public/src/plugin.ts",
      "M\t.changeset/revised.md",
    ].join("\n"),
  });

  assert.equal(result.exitCode, 0);
  assert.deepEqual(result.output, ["Changesets cover: @edgegamers/public"]);
});

test("rejects deleting a base-public plugin with staged-retirement guidance", (t) => {
  const result = runCheck(t, {
    includeHeadPublic: false,
    changedOutput: "D\tplugins/global/public/package.json",
  });

  assert.equal(result.exitCode, 1);
  assert.match(result.errors.join("\n"), /@edgegamers\/public.*deleted/u);
  assert.match(result.errors.join("\n"), /deprecation release.*registry yank/iu);
});

test("rejects changing a base-public plugin to private", (t) => {
  const result = runCheck(t, {
    files: {
      "plugins/global/public/package.json": {
        name: "@edgegamers/public",
        private: true,
      },
    },
    changedOutput: "M\tplugins/global/public/package.json",
  });

  assert.equal(result.exitCode, 1);
  assert.match(result.errors.join("\n"), /@edgegamers\/public.*changed to private/u);
});

test("rejects a human synchronization of the bot branch", (t) => {
  const result = runCheck(t, {
    releaseContext: { ...TRUSTED_RELEASE_CONTEXT, actor: "developer" },
    changedOutput: "M\tplugins/global/public/package.json",
  });

  assert.equal(result.exitCode, 1);
  assert.deepEqual(result.warnings, []);
});

test("rejects a trusted-looking bot pull request with source changes", (t) => {
  const result = runCheck(t, {
    releaseContext: TRUSTED_RELEASE_CONTEXT,
    changedOutput: "M\tplugins/global/public/src/plugin.ts",
  });

  assert.equal(result.exitCode, 1);
  assert.deepEqual(result.warnings, []);
});
