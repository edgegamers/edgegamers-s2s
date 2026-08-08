import { describe, expect, it } from "vitest";
import {
  createPluginReleasePlan,
  pluginReleaseTag,
  stablePluginFileName,
} from "../lib/plugin-release-plan.mjs";

describe("stablePluginFileName", () => {
  it("uses the unscoped package segment and no version", () => {
    expect(stablePluginFileName("@edgegamers/reference-api")).toBe(
      "reference-api.s2sp",
    );
  });
});

describe("pluginReleaseTag", () => {
  it("puts the version in the tag", () => {
    expect(
      pluginReleaseTag({
        packageName: "@edgegamers/reference-api",
        version: "1.2.3",
      }),
    ).toBe("plugin/reference-api/v1.2.3");
  });
});

describe("createPluginReleasePlan", () => {
  it("maps packages to stable artifact names and registry intent", () => {
    const plan = createPluginReleasePlan({
      generatedAt: "2026-08-08T12:00:00.000Z",
      plugins: [
        {
          directory: "reference-api",
          name: "@edgegamers/reference-api",
          version: "1.2.3",
          publishToRegistry: true,
        },
      ],
      artifacts: [
        {
          packageName: "@edgegamers/reference-api",
          path: "plugins/reference-api/dist/reference-api.s2sp",
          bytes: Buffer.from("plugin"),
        },
      ],
    });

    expect(plan.releases).toEqual([
      {
        packageName: "@edgegamers/reference-api",
        version: "1.2.3",
        releaseTag: "plugin/reference-api/v1.2.3",
        assetName: "reference-api.s2sp",
        artifactPath: "plugins/reference-api/dist/reference-api.s2sp",
        sha256:
          "5e689e2b01672bf33996e75d5e372ff60c536ce1599a1458e867cd8f4bef5160",
        publishToRegistry: true,
      },
    ]);
  });
});
