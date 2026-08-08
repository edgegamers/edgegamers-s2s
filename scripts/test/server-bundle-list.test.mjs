import { describe, expect, it } from "vitest";
import { parseServerBundleList } from "../lib/server-bundle-list.mjs";

describe("parseServerBundleList", () => {
  it("ignores blank lines and comments", () => {
    expect(parseServerBundleList("\n# comment\n@edgegamers/a\n\n@edgegamers/b # inline\n")).toEqual([
      "@edgegamers/a",
      "@edgegamers/b",
    ]);
  });

  it("rejects duplicate packages", () => {
    expect(() => parseServerBundleList("@edgegamers/a\n@edgegamers/a\n")).toThrow(
      "Duplicate plugin package: @edgegamers/a",
    );
  });

  it("rejects unscoped package names", () => {
    expect(() => parseServerBundleList("bad-package\n")).toThrow(
      "Invalid plugin package name: bad-package",
    );
  });
});
