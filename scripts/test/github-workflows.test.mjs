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

  it("builds server bundles and triggers server pipelines for development", () => {
    const deployDev = workflow("deploy-dev.yml");

    for (const required of [
      "branches:",
      "- dev",
      "npm run lint",
      "npm run typecheck",
      "npm test",
      "npm run build",
      "npm run bundles:servers -- --environment development",
      "server-bundles-${{ github.sha }}",
      "artifacts/server-bundles/",
      "actions/upload-artifact@v4",
      "npm run trigger:servers -- --environment development --ref dev",
      "GITLAB_URL: ${{ secrets.GITLAB_URL }}",
      "GITLAB_PROJECT_ID_TTT_S2S: ${{ secrets.GITLAB_PROJECT_ID_TTT_S2S }}",
      "GITLAB_TRIGGER_TOKEN_TTT_S2S: ${{ secrets.GITLAB_TRIGGER_TOKEN_TTT_S2S }}",
    ]) {
      expect(deployDev).toContain(required);
    }

    for (const removed of [
      "DEV_SSH_HOST",
      "DEV_SSH_KEY",
      "DEV_S2SCRIPT_PLUGIN_DIR",
      "npm run deploy:dev",
      "rsync",
    ]) {
      expect(deployDev).not.toContain(removed);
    }
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
      "npm run bundles:servers -- --environment production",
      "server-bundles-${{ github.sha }}",
      "artifacts/server-bundles/",
      "has-changesets",
      "npm run deploy -- --ci",
      "S2SCRIPT_TOKEN: ${{ secrets.S2SCRIPT_TOKEN }}",
    ]) {
      expect(release).toContain(required);
    }

    expect(release).not.toContain("changesets/action@v2");
    expect(release).not.toContain("PROD_SSH_PRIVATE_KEY");

    const stepsIndex = release.indexOf("    steps:");
    const deployIndex = release.indexOf("      - name: Deploy Source2Script packages");
    const skipIndex = release.indexOf("      - name: Skip Source2Script deploy");
    const jobConfiguration = release.slice(0, stepsIndex);
    const deployStep = release.slice(deployIndex, skipIndex);

    expect(jobConfiguration).not.toContain("S2SCRIPT_TOKEN");
    expect(deployStep).toContain(
      "S2SCRIPT_TOKEN: ${{ secrets.S2SCRIPT_TOKEN }}",
    );
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
