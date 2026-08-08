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

  it("builds, manifests, uploads, and deploys development artifacts", () => {
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

    for (const required of [
      "environment: development",
      "DEV_SSH_HOST: ${{ secrets.DEV_SSH_HOST }}",
      "DEV_SSH_PORT: ${{ secrets.DEV_SSH_PORT }}",
      "DEV_SSH_USER: ${{ secrets.DEV_SSH_USER }}",
      "DEV_SSH_KEY: ${{ secrets.DEV_SSH_KEY }}",
      "DEV_BASE_SHA: ${{ github.event.before }}",
      "DEV_HEAD_SHA: ${{ github.sha }}",
      "npm run deploy:dev",
    ]) {
      expect(deployDev).toContain(required);
    }

    expect(deployDev).not.toContain("DEV_S2SCRIPT_PLUGIN_DIR:");
  });

  it("validates main and gates plugin releases and registry deploy on Changesets", () => {
    const release = workflow("release.yml");

    for (const required of [
      "branches:",
      "- main",
      "npm run lint",
      "npm run typecheck",
      "npm test",
      "npm run build",
      "npm run release:plan",
      "npm run release:github-plugins",
      "GH_TOKEN: ${{ github.token }}",
      "permissions:",
      "contents: write",
      "has-changesets",
      "npm run deploy:registry-opt-ins",
      "S2SCRIPT_TOKEN: ${{ secrets.S2SCRIPT_TOKEN }}",
    ]) {
      expect(release).toContain(required);
    }

    expect(release).not.toContain("changesets/action@v2");
    expect(release).not.toContain("PROD_SSH_PRIVATE_KEY");

    const stepsIndex = release.indexOf("    steps:");
    const detectIndex = release.indexOf("      - name: Detect pending Changesets");
    const planIndex = release.indexOf("      - name: Create plugin release plan");
    const githubIndex = release.indexOf("      - name: Publish GitHub plugin releases");
    const deployIndex = release.indexOf("      - name: Deploy Source2Script packages");
    const skipIndex = release.indexOf("      - name: Skip Source2Script deploy");
    const jobConfiguration = release.slice(0, stepsIndex);
    const deployStep = release.slice(deployIndex, skipIndex);

    expect(detectIndex).toBeGreaterThan(stepsIndex);
    expect(planIndex).toBeGreaterThan(detectIndex);
    expect(githubIndex).toBeGreaterThan(planIndex);
    expect(deployIndex).toBeGreaterThan(githubIndex);
    expect(release.slice(planIndex, githubIndex)).toContain(
      "if: steps.detect.outputs.has-changesets == 'true'",
    );
    expect(release.slice(githubIndex, deployIndex)).toContain(
      "if: steps.detect.outputs.has-changesets == 'true'",
    );
    expect(jobConfiguration).not.toContain("S2SCRIPT_TOKEN");
    expect(deployStep).toContain(
      "S2SCRIPT_TOKEN: ${{ secrets.S2SCRIPT_TOKEN }}",
    );
    expect(release.slice(0, deployIndex) + release.slice(skipIndex)).not.toContain(
      "S2SCRIPT_TOKEN",
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
