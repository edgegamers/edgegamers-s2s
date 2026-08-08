import { describe, expect, it } from "vitest";
import {
  buildGhReleaseCommands,
  publishGitHubPluginReleases,
} from "../publish-github-plugin-releases.mjs";

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
            artifactPath: "plugins/global/reference-api/dist/reference-api.s2sp",
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
      "plugins/global/reference-api/dist/reference-api.s2sp#reference-api.s2sp",
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

describe("publishGitHubPluginReleases", () => {
  it("uploads and replaces the stable asset when the release already exists", () => {
    const calls = [];
    const plan = planWithOneRelease();

    publishGitHubPluginReleases({
      root: "repo-root",
      repository: "edgegamers/edgegamers-s2s",
      plan,
      execFile: (command, args) => {
        calls.push({ command, args });
        return Buffer.from("");
      },
    });

    expect(calls).toEqual([
      {
        command: "gh",
        args: [
          "release",
          "view",
          "plugin/reference-api/v1.2.3",
          "--repo",
          "edgegamers/edgegamers-s2s",
        ],
      },
      {
        command: "gh",
        args: [
          "release",
          "upload",
          "plugin/reference-api/v1.2.3",
          "plugins/global/reference-api/dist/reference-api.s2sp#reference-api.s2sp",
          "--repo",
          "edgegamers/edgegamers-s2s",
          "--clobber",
        ],
      },
    ]);
  });

  it("creates the release with the stable asset when the release is missing", () => {
    const calls = [];
    const plan = planWithOneRelease();

    publishGitHubPluginReleases({
      root: "repo-root",
      repository: "edgegamers/edgegamers-s2s",
      plan,
      execFile: (command, args) => {
        calls.push({ command, args });
        if (args[1] === "view") {
          throw new Error("release not found");
        }
        return Buffer.from("");
      },
    });

    expect(calls).toEqual([
      {
        command: "gh",
        args: [
          "release",
          "view",
          "plugin/reference-api/v1.2.3",
          "--repo",
          "edgegamers/edgegamers-s2s",
        ],
      },
      {
        command: "gh",
        args: [
          "release",
          "create",
          "plugin/reference-api/v1.2.3",
          "plugins/global/reference-api/dist/reference-api.s2sp#reference-api.s2sp",
          "--repo",
          "edgegamers/edgegamers-s2s",
          "--title",
          "@edgegamers/reference-api v1.2.3",
          "--notes",
          "SHA-256: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          "--latest=false",
        ],
      },
    ]);
  });
});

function planWithOneRelease() {
  return {
    schemaVersion: 1,
    releases: [
      {
        packageName: "@edgegamers/reference-api",
        version: "1.2.3",
        releaseTag: "plugin/reference-api/v1.2.3",
        assetName: "reference-api.s2sp",
        artifactPath: "plugins/global/reference-api/dist/reference-api.s2sp",
        sha256: "a".repeat(64),
        publishToRegistry: false,
      },
    ],
  };
}
