import { describe, expect, it } from "vitest";
import { buildGhReleaseCommands } from "../publish-github-plugin-releases.mjs";

describe("buildGhReleaseCommands", () => {
  it("creates stable-named GitHub release assets", () => {
    const commands = buildGhReleaseCommands({
      repository: "edgegamers/edgegamers-s2s",
      plan: {
        schemaVersion: 1,
        releases: [
          {
            packageName: "@edgegamers/reference-api",
            version: "1.2.3",
            releaseTag: "plugin/reference-api/v1.2.3",
            assetName: "reference-api.s2sp",
            artifactPath: "plugins/reference-api/dist/reference-api.s2sp",
            sha256: "a".repeat(64),
            publishToRegistry: false,
          },
        ],
      },
    });

    expect(commands[0].args).toEqual([
      "release",
      "create",
      "plugin/reference-api/v1.2.3",
      "plugins/reference-api/dist/reference-api.s2sp#reference-api.s2sp",
      "--repo",
      "edgegamers/edgegamers-s2s",
      "--title",
      "@edgegamers/reference-api v1.2.3",
      "--notes",
      "SHA-256: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "--latest=false",
    ]);
  });
});
