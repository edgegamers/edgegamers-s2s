import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function readRepositoryFile(path) {
  return readFileSync(join(root, ...path), "utf8");
}

describe("GitHub governance files", () => {
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
});
