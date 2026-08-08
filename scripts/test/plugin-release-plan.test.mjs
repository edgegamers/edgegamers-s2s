import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { writePluginReleasePlan } from "../create-plugin-release-plan.mjs";
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
          directory: "global/reference-api",
          name: "@edgegamers/reference-api",
          version: "1.2.3",
          publishToRegistry: true,
        },
      ],
      artifacts: [
        {
          packageName: "@edgegamers/reference-api",
          path: "plugins/global/reference-api/dist/reference-api.s2sp",
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
        artifactPath: "plugins/global/reference-api/dist/reference-api.s2sp",
        sha256:
          "5e689e2b01672bf33996e75d5e372ff60c536ce1599a1458e867cd8f4bef5160",
        publishToRegistry: true,
      },
    ]);
  });
});

describe("writePluginReleasePlan", () => {
  it("plans only plugins named in pending Changesets", () => {
    const root = mkdtempSync(join(tmpdir(), "edgegamers-release-plan-"));

    try {
      writePluginFixture({
        root,
        scope: "global",
        directory: "reference-api",
        name: "@edgegamers/reference-api",
        version: "1.2.3",
        publishToRegistry: true,
      });
      writePluginFixture({
        root,
        scope: "global",
        directory: "reference-consumer",
        name: "@edgegamers/reference-consumer",
        version: "4.5.6",
        publishToRegistry: true,
      });
      mkdirSync(join(root, ".changeset"), { recursive: true });
      writeFileSync(
        join(root, ".changeset", "release-api.md"),
        '---\n"@edgegamers/reference-api": patch\n---\n\nRelease API.\n',
      );

      const { plan } = writePluginReleasePlan({
        root,
        generatedAt: "2026-08-08T12:00:00.000Z",
      });

      expect(plan.releases.map((release) => release.packageName)).toEqual([
        "@edgegamers/reference-api",
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("writes an empty plan without requiring artifacts when no Changesets exist", () => {
    const root = mkdtempSync(join(tmpdir(), "edgegamers-release-plan-"));

    try {
      mkdirSync(join(root, "plugins", "global", "reference-api"), { recursive: true });
      mkdirSync(join(root, ".changeset"), { recursive: true });
      writeFileSync(
        join(root, "plugins", "global", "reference-api", "package.json"),
        JSON.stringify({
          name: "@edgegamers/reference-api",
          version: "1.2.3",
        }),
      );

      const { outputPath, plan } = writePluginReleasePlan({
        root,
        generatedAt: "2026-08-08T12:00:00.000Z",
      });

      expect(plan.releases).toEqual([]);
      expect(JSON.parse(readFileSync(outputPath, "utf8")).releases).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

function writePluginFixture({
  root,
  scope,
  directory,
  name,
  version,
  publishToRegistry,
}) {
  const pluginDirectory = join(root, "plugins", scope, directory);
  mkdirSync(join(pluginDirectory, "dist"), { recursive: true });
  writeFileSync(
    join(pluginDirectory, "package.json"),
    JSON.stringify({
      name,
      version,
      edgegamers: { release: { publishToRegistry } },
    }),
  );
  writeFileSync(join(pluginDirectory, "dist", `${directory}.s2sp`), directory);
}
