import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import {
  discoverArtifactFiles,
  writeServerBundles,
} from "../build-server-bundles.mjs";

function write(root, path, contents) {
  const target = join(root, path);
  mkdirSync(join(target, ".."), { recursive: true });
  writeFileSync(target, contents);
}

describe("writeServerBundles", () => {
  it("writes zip, sha256, and manifest for each server list", () => {
    const root = mkdtempSync(join(tmpdir(), "edgegamers-server-bundles-"));

    try {
      write(root, "server-bundles/ttt-s2s.txt", "@edgegamers/reference-api\n");
      write(root, "plugins/reference-api/package.json", JSON.stringify({
        name: "@edgegamers/reference-api",
      }));
      write(root, "plugins/reference-api/dist/reference-api.s2sp", "plugin");

      const result = writeServerBundles({
        root,
        environment: "development",
        commit: "abcdef1234567890",
        generatedAt: "2026-08-08T12:00:00.000Z",
      });

      expect(result.bundles).toHaveLength(1);
      expect(result.bundles[0].artifactName).toBe("ttt-s2s-development");
      expect(existsSync(join(root, result.bundles[0].zipPath))).toBe(true);
      expect(existsSync(join(root, result.bundles[0].sha256Path))).toBe(true);

      const zip = unzipSync(readFileSync(join(root, result.bundles[0].zipPath)));
      expect(Buffer.from(zip["plugins/reference-api.s2sp"]).toString("utf8")).toBe("plugin");
      const manifest = JSON.parse(Buffer.from(zip["plugin-bundle.json"]).toString("utf8"));
      expect(manifest.server).toBe("ttt-s2s");
      expect(manifest.environment).toBe("development");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("discoverArtifactFiles", () => {
  it("discovers Source2Script's scoped package artifact name", () => {
    const root = mkdtempSync(join(tmpdir(), "edgegamers-server-bundles-"));

    try {
      write(root, "plugins/reference-api/dist/_edgegamers_reference-api.s2sp", "plugin");

      expect(discoverArtifactFiles({
        root,
        workspacePlugins: [
          {
            packageName: "@edgegamers/reference-api",
            directory: "plugins/reference-api",
          },
        ],
      })).toEqual([
        {
          packageName: "@edgegamers/reference-api",
          path: "plugins/reference-api/dist/_edgegamers_reference-api.s2sp",
          bytes: Buffer.from("plugin"),
        },
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
