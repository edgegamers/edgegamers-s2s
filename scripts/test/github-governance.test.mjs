import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function readRepositoryFile(path) {
  return readFileSync(join(root, ...path), "utf8");
}

describe("GitHub governance files", () => {
  it("documents the manual GitHub setup steps that cannot be verified locally yet", () => {
    const readme = readRepositoryFile([".github", "README.md"]);

    for (const required of [
      "Branch rules",
      "CODEOWNERS",
      "Labels",
      "Issue templates",
      "Pull request template",
      "Environments",
      "Secrets",
      "Deployment stubs",
      "Local-only milestone",
    ]) {
      expect(readme).toContain(required);
    }

    expect(readme).toContain("Do not add production server deployment secrets yet.");
    expect(readme).toContain("Server deployment remains intentionally stubbed.");
  });

  it("keeps local GitHub governance files present for maintainers", () => {
    for (const path of [
      [".github", "CODEOWNERS"],
      [".github", "pull_request_template.md"],
      [".github", "labels.yml"],
      [".github", "ISSUE_TEMPLATE", "bug_report.yml"],
      [".github", "ISSUE_TEMPLATE", "feature_request.yml"],
      [".github", "ISSUE_TEMPLATE", "config.yml"],
    ]) {
      expect(existsSync(join(root, ...path))).toBe(true);
    }
  });

  it("keeps maintainer-only labels explicit", () => {
    const labels = readRepositoryFile([".github", "labels.yml"]);

    for (const label of [
      "no-changeset",
      "release:hotfix",
      "sync-required",
      "breaking-change",
      "plugin",
      "shared-package",
      "ci",
      "documentation",
    ]) {
      expect(labels).toContain(`name: ${label}`);
    }
  });
});
