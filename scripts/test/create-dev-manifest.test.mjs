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
import { writeDevelopmentManifest } from "../create-dev-manifest.mjs";

describe("create-dev-manifest CLI", () => {
  it("writes a manifest from the SDK workspace artifact layout", () => {
    const root = mkdtempSync(join(tmpdir(), "edgegamers-manifest-"));

    try {
      const distDirectory = join(
        root,
        "plugins",
        "global",
        "reference-api",
        "dist",
      );
      mkdirSync(distDirectory, { recursive: true });
      writeFileSync(
        join(root, "plugins", "global", "reference-api", "package.json"),
        JSON.stringify({ name: "@edgegamers/reference-api" }),
      );
      writeFileSync(
        join(distDirectory, "reference-api.s2sp"),
        "reference artifact",
      );

      writeDevelopmentManifest({
        root,
        commit: "abcdef1234567890",
        generatedAt: "2026-07-31T12:00:00.000Z",
      });

      const manifest = JSON.parse(
        readFileSync(
          join(root, "artifacts", "development-manifest.json"),
          "utf8",
        ),
      );

      expect(manifest.generatedAt).toBe("2026-07-31T12:00:00.000Z");
      expect(manifest.plugins).toEqual([
        expect.objectContaining({
          artifact:
            "plugins/global/reference-api/dist/reference-api.s2sp",
          packageName: "@edgegamers/reference-api",
          revision: "dev.abcdef1",
        }),
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
