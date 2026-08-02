import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function workflow(name) {
  return readFileSync(join(root, ".github", "workflows", name), "utf8");
}

describe("GitHub workflows", () => {
  it("validates pull requests with the full local quality gate", () => {
    const validate = workflow("validate.yml");

    for (const required of [
      "node-version-file: .nvmrc",
      "npm ci",
      "npm run lint",
      "npm run typecheck",
      "npm test",
      "npm run build",
      "npm run changeset:check",
      "node scripts/verify-main-source.mjs",
      "actions/upload-artifact@v4",
    ]) {
      expect(validate).toContain(required);
    }
  });

  it("builds, manifests, and uploads development artifacts without server deployment", () => {
    const deployDev = workflow("deploy-dev.yml");

    for (const required of [
      "branches:",
      "- dev",
      "npm run build",
      "npm run manifest:dev",
      "npm run artifacts:local",
      "development-manifest.json",
      "actions/upload-artifact@v4",
    ]) {
      expect(deployDev).toContain(required);
    }

    expect(deployDev).not.toContain("DEV_SSH_PRIVATE_KEY");
    expect(deployDev).not.toContain("DEV_RECONCILE_COMMAND");
  });

  it("validates main and only runs Source2Script deploy when Changesets exist", () => {
    const release = workflow("release.yml");

    for (const required of [
      "branches:",
      "- main",
      "npm run lint",
      "npm run typecheck",
      "npm test",
      "npm run build",
      "has-changesets",
      "npm run deploy",
      "Server release is intentionally skipped",
    ]) {
      expect(release).toContain(required);
    }

    expect(release).not.toContain("changesets/action@v2");
    expect(release).not.toContain("PROD_SSH_PRIVATE_KEY");
    expect(release).not.toContain("production-manifest.json");
  });

  it("opens a main-to-dev synchronization pull request after hotfix merges", () => {
    const syncHotfix = workflow("sync-hotfix.yml");

    for (const required of [
      "branches:",
      "- main",
      "github.event.pull_request.merged == true",
      "startsWith(github.event.pull_request.head.ref, 'hotfix/')",
      "gh pr create",
      "--base dev",
      "--head main",
    ]) {
      expect(syncHotfix).toContain(required);
    }
  });
});
