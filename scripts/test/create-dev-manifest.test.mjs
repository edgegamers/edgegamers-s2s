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
        "reference-api",
        "dist",
      );
      mkdirSync(distDirectory, { recursive: true });
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
            "plugins/reference-api/dist/reference-api.s2sp",
          revision: "dev.abcdef1",
        }),
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
