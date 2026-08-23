import assert from "node:assert/strict";
import test from "node:test";
import { main as checkChangeset } from "./check-changeset.mjs";
import { BASE_POLICY, makeWorkspace } from "./lib/test-workspace.mjs";

function runCheck(t, releaseContext) {
  const root = makeWorkspace(t, {
    "workspace-policy.json": BASE_POLICY,
    "plugins/global/public/package.json": {
      name: "@edgegamers/public",
      private: false,
    },
  });
  const output = [];
  const warnings = [];
  const errors = [];
  const exitCode = checkChangeset({
    root,
    baseRef: "origin/dev",
    releaseContext,
    git(args) {
      if (args[0] === "merge-base") return "base-sha";
      if (args[0] === "diff") return "plugins/global/public/src/plugin.ts";
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
    eventName: "pull_request",
    baseRef: "dev",
    headRef: "feature/plugin",
    author: "developer",
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
    eventName: "pull_request",
    baseRef: "dev",
    headRef: "changeset-release/dev",
    author: "github-actions[bot]",
  });
  assert.equal(result.exitCode, 0);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.warnings, [
    "Trusted version pull request may consume Changesets for: @edgegamers/public",
  ]);
});
