import { describe, expect, it } from "vitest";
import {
  evaluateChangesetCoverage,
  parseChangesetPackages,
  parsePluginMetadata,
} from "../lib/changeset-policy.mjs";

const plugins = [
  { directory: "public-plugin", name: "@edgegamers/public-plugin", private: false },
  { directory: "private-plugin", name: "@edgegamers/private-plugin", private: true },
];

describe("evaluateChangesetCoverage", () => {
  it("does not require a Changeset when no publishable plugin changed", () => {
    expect(
      evaluateChangesetCoverage({
        changedFiles: ["README.md", "plugins/private-plugin/src/plugin.ts"],
        plugins,
        coveredPackages: new Set(),
      }),
    ).toEqual({ affectedPackages: [], missingPackages: [] });
  });

  it("reports every changed publishable plugin without a Changeset", () => {
    expect(
      evaluateChangesetCoverage({
        changedFiles: ["plugins/public-plugin/src/plugin.ts"],
        plugins,
        coveredPackages: new Set(),
      }),
    ).toEqual({
      affectedPackages: ["@edgegamers/public-plugin"],
      missingPackages: ["@edgegamers/public-plugin"],
    });
  });

  it("accepts a covered publishable plugin and normalizes Windows paths", () => {
    expect(
      evaluateChangesetCoverage({
        changedFiles: ["plugins\\public-plugin\\src\\plugin.ts"],
        plugins,
        coveredPackages: new Set(["@edgegamers/public-plugin"]),
      }),
    ).toEqual({
      affectedPackages: ["@edgegamers/public-plugin"],
      missingPackages: [],
    });
  });
});

describe("parseChangesetPackages", () => {
  it("reads package names from valid Changeset frontmatter", () => {
    expect(
      parseChangesetPackages([
        {
          path: ".changeset/bright-tools.md",
          content: '---\n"@edgegamers/public-plugin": minor\n---\n\nAdd commands.\n',
        },
      ]),
    ).toEqual(new Set(["@edgegamers/public-plugin"]));
  });

  it("rejects malformed release lines with the source path", () => {
    expect(() =>
      parseChangesetPackages([
        {
          path: ".changeset/broken.md",
          content: "---\n@edgegamers/public-plugin maybe\n---\n",
        },
      ]),
    ).toThrow(".changeset/broken.md");
  });
});

describe("parsePluginMetadata", () => {
  it("rejects a package without a name and identifies its directory", () => {
    expect(() => parsePluginMetadata("broken", '{"private":false}')).toThrow(
      "plugins/broken/package.json",
    );
  });
});
