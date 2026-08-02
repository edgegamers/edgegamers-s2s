import { describe, expect, it } from "vitest";
import { evaluateMainSourcePolicy } from "../lib/main-source-policy.mjs";

describe("evaluateMainSourcePolicy", () => {
  it("allows pull requests into non-production branches", () => {
    expect(
      evaluateMainSourcePolicy({
        baseRef: "dev",
        headRef: "feature/example",
        allowHotfix: false,
      }),
    ).toEqual({
      allowed: true,
      message: "Pull request does not target main.",
    });
  });

  it("allows normal production promotion only from dev", () => {
    expect(
      evaluateMainSourcePolicy({
        baseRef: "main",
        headRef: "dev",
        allowHotfix: false,
      }),
    ).toEqual({
      allowed: true,
      message: "Production promotion correctly originates from dev.",
    });
  });

  it("allows explicitly approved hotfix branches into main", () => {
    expect(
      evaluateMainSourcePolicy({
        baseRef: "main",
        headRef: "hotfix/fix-login",
        allowHotfix: true,
      }),
    ).toEqual({
      allowed: true,
      message: "Approved hotfix source: hotfix/fix-login",
    });
  });

  it("rejects unapproved feature branches into main", () => {
    expect(
      evaluateMainSourcePolicy({
        baseRef: "main",
        headRef: "feature/skip-dev",
        allowHotfix: false,
      }),
    ).toEqual({
      allowed: false,
      message:
        "Pull requests into main must originate from dev. Received: feature/skip-dev",
    });
  });
});
