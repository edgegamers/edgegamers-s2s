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

  it("keeps development deploys to package build and GitLab triggers", () => {
    const deployDev = workflow("deploy-dev.yml");

    expect(deployDev).toContain("npm run build");
    expect(deployDev).toContain("npm run bundles:servers -- --environment development");
    expect(deployDev).toContain("cron: '30 9 * * *'");
    expect(deployDev).toContain("contents: write");
    expect(deployDev).toContain("SERVER_BUNDLE_RELEASE_TAG=dev-latest");
    expect(deployDev).toContain("gh release upload \"$SERVER_BUNDLE_RELEASE_TAG\"");
    expect(deployDev).toContain("npm run trigger:servers -- --environment development --ref dev");

    for (const forbidden of [
      "ssh ",
      "scp ",
      "rsync",
      "DEV_SSH",
      "manifest:dev",
      "artifacts:local",
      "actions/upload-artifact@v4",
      "ghcr.io/s2script/s2script-runtime-image",
      "SOURCE2_UPDATE_ON_START",
      "payload",
    ]) {
      expect(deployDev).not.toContain(forbidden);
    }
  });

  it("keeps production release package-oriented and server-repo agnostic", () => {
    const release = workflow("release.yml");

    expect(release).toContain("npm run build");
    expect(release).toContain("npm run bundles:servers -- --environment production");
    expect(release).toContain("contents: write");
    expect(release).toContain("SERVER_BUNDLE_RELEASE_TAG=latest");
    expect(release).toContain("gh release upload \"$SERVER_BUNDLE_RELEASE_TAG\"");
    expect(release).toContain("npm run deploy -- --ci");

    for (const forbidden of [
      "ssh ",
      "scp ",
      "rsync",
      "docker compose",
      "actions/upload-artifact@v4",
      "SOURCE2_UPDATE_ON_START",
      "ghcr.io/s2script/s2script-runtime-image",
    ]) {
      expect(release).not.toContain(forbidden);
    }
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
