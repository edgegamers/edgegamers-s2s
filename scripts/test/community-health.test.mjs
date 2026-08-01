import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "..", "..");
const LEADERSHIP_URL =
  "https://www.edgegamers.com/forums/list/contact-leadership/post-thread";

function readProjectFile(relativePath) {
  return readFileSync(resolve(ROOT, relativePath), "utf8");
}

describe("community health policies", () => {
  it("routes vulnerability reports through the confidential leadership form", () => {
    const security = readProjectFile(".github/SECURITY.md");

    expect(security).toContain("# Security Policy");
    expect(security).toContain("## Supported versions");
    expect(security).toContain("## Reporting a vulnerability");
    expect(security).toContain(LEADERSHIP_URL);
    expect(security).toMatch(/do not (open|report).*public GitHub issue/iu);
    expect(security).toContain("no guaranteed response or resolution time");
  });
});
