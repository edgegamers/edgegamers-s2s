import { describe, expect, it } from "vitest";
import {
  createServerBundlePlan,
  stablePluginFileName,
} from "../lib/server-bundle-plan.mjs";

describe("stablePluginFileName", () => {
  it("uses the unscoped package segment", () => {
    expect(stablePluginFileName("@edgegamers/reference-api")).toBe(
      "reference-api.s2sp",
    );
  });
});

describe("createServerBundlePlan", () => {
  it("maps selected packages to built artifacts and bundle metadata", () => {
    const plan = createServerBundlePlan({
      server: "ttt-s2s",
      environment: "development",
      commit: "abcdef1234567890",
      generatedAt: "2026-08-08T12:00:00.000Z",
      selectedPackages: ["@edgegamers/reference-api"],
      workspacePlugins: [
        {
          packageName: "@edgegamers/reference-api",
          directory: "plugins/reference-api",
        },
      ],
      artifactFiles: [
        {
          packageName: "@edgegamers/reference-api",
          path: "plugins/reference-api/dist/reference-api.s2sp",
          bytes: Buffer.from("plugin"),
        },
      ],
    });

    expect(plan.manifest).toEqual({
      schemaVersion: 1,
      managedBy: "edgegamers-s2s",
      server: "ttt-s2s",
      environment: "development",
      commit: "abcdef1234567890",
      generatedAt: "2026-08-08T12:00:00.000Z",
      plugins: [
        {
          packageName: "@edgegamers/reference-api",
          fileName: "reference-api.s2sp",
          sha256:
            "5e689e2b01672bf33996e75d5e372ff60c536ce1599a1458e867cd8f4bef5160",
        },
      ],
    });
    expect(plan.files).toEqual([
      {
        sourcePath: "plugins/reference-api/dist/reference-api.s2sp",
        zipPath: "plugins/reference-api.s2sp",
      },
    ]);
  });

  it("rejects selected packages outside the workspace", () => {
    expect(() =>
      createServerBundlePlan({
        server: "ttt-s2s",
        environment: "development",
        commit: "abcdef",
        generatedAt: "2026-08-08T12:00:00.000Z",
        selectedPackages: ["@edgegamers/missing"],
        workspacePlugins: [],
        artifactFiles: [],
      }),
    ).toThrow("server-bundles/ttt-s2s.txt references unknown workspace package @edgegamers/missing");
  });
});
