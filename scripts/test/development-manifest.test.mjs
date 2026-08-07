import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createDevelopmentManifest,
  findS2spFiles,
  isWorkspaceArtifact,
} from "../lib/development-manifest.mjs";

describe("createDevelopmentManifest", () => {
  it("marks the manifest as EdgeGamers managed", () => {
    const manifest = createDevelopmentManifest({
      artifacts: [
        {
          path: "plugins/global/api/dist/api.s2sp",
          bytes: Buffer.from("api"),
          metadata: {
            name: "@edgegamers/api",
            scope: "global",
            publicRegistry: false,
          },
        },
      ],
      commit: "abcdef1234567890",
      generatedAt: "2026-08-03T12:00:00.000Z",
    });

    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.managedBy).toBe("edgegamers-s2s");
    expect(manifest.environment).toBe("development");
  });

  it("rejects duplicate artifact file names", () => {
    expect(() =>
      createDevelopmentManifest({
        artifacts: [
          {
            path: "plugins/global/one/dist/shared.s2sp",
            bytes: Buffer.from("one"),
            metadata: {
              name: "@edgegamers/one",
              scope: "global",
              publicRegistry: false,
            },
          },
          {
            path: "plugins/global/two/dist/shared.s2sp",
            bytes: Buffer.from("two"),
            metadata: {
              name: "@edgegamers/two",
              scope: "global",
              publicRegistry: false,
            },
          },
        ],
        commit: "abcdef1234567890",
        generatedAt: "2026-08-03T12:00:00.000Z",
      }),
    ).toThrow("Duplicate artifact file name: shared.s2sp");
  });

  it("sorts artifacts, normalizes paths, and records immutable identity", () => {
    const manifest = createDevelopmentManifest({
      artifacts: [
        {
          path: "plugins\\games\\cs2\\zeta\\dist\\zeta.s2sp",
          bytes: Buffer.from("zeta"),
          metadata: {
            name: "@edgegamers/zeta",
            scope: "game",
            game: "cs2",
            publicRegistry: false,
          },
        },
        {
          path: "plugins/global/alpha/dist/alpha.s2sp",
          bytes: Buffer.from("alpha"),
          metadata: {
            name: "@edgegamers/alpha",
            scope: "global",
            publicRegistry: true,
          },
        },
      ],
      commit: "abcdef1234567890",
      generatedAt: "2026-07-31T12:00:00.000Z",
      channel: "main",
    });

    expect(manifest).toEqual({
      schemaVersion: 1,
      managedBy: "edgegamers-s2s",
      environment: "development",
      channel: "main",
      commit: "abcdef1234567890",
      generatedAt: "2026-07-31T12:00:00.000Z",
      plugins: [
        {
          name: "@edgegamers/zeta",
          scope: "game",
          game: "cs2",
          publicRegistry: false,
          artifact: "plugins/games/cs2/zeta/dist/zeta.s2sp",
          fileName: "zeta.s2sp",
          revision: "dev.abcdef1",
          sha256: "5cc10d9143b2cff082cf5fb373073b13d02d12c9a4d24a97d822d701404fb421",
        },
        expect.objectContaining({
          name: "@edgegamers/alpha",
          scope: "global",
          publicRegistry: true,
          artifact: "plugins/global/alpha/dist/alpha.s2sp",
          fileName: "alpha.s2sp",
          revision: "dev.abcdef1",
        }),
      ],
    });
  });

  it("rejects an empty artifact set", () => {
    expect(() =>
      createDevelopmentManifest({
        artifacts: [],
        commit: "abcdef1234567890",
        generatedAt: "2026-07-31T12:00:00.000Z",
      }),
    ).toThrow("No .s2sp artifacts found");
  });

  it("rejects duplicate normalized artifact paths", () => {
    expect(() =>
      createDevelopmentManifest({
        artifacts: [
          {
            path: "plugins\\global\\api\\dist\\api.s2sp",
            bytes: Buffer.from("one"),
            metadata: {
              name: "@edgegamers/api",
              scope: "global",
              publicRegistry: false,
            },
          },
          {
            path: "plugins/global/api/dist/api.s2sp",
            bytes: Buffer.from("two"),
            metadata: {
              name: "@edgegamers/api",
              scope: "global",
              publicRegistry: false,
            },
          },
        ],
        commit: "abcdef1234567890",
        generatedAt: "2026-07-31T12:00:00.000Z",
      }),
    ).toThrow("Duplicate artifact path");
  });
});

describe("findS2spFiles", () => {
  it("finds nested artifacts in deterministic order", () => {
    const root = mkdtempSync(join(tmpdir(), "edgegamers-s2sp-"));

    try {
      mkdirSync(join(root, "zeta"), { recursive: true });
      writeFileSync(join(root, "zeta", "zeta.s2sp"), "zeta");
      writeFileSync(join(root, "alpha.s2sp"), "alpha");

      expect(findS2spFiles(root).map((path) => basename(path))).toEqual([
        "alpha.s2sp",
        "zeta.s2sp",
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("isWorkspaceArtifact", () => {
  it("accepts nested global and game SDK dist artifacts on either path separator", () => {
    expect(
      isWorkspaceArtifact("plugins/global/reference-api/dist/reference-api.s2sp"),
    ).toBe(true);
    expect(
      isWorkspaceArtifact("plugins\\games\\cs2\\reference-api\\dist\\reference-api.s2sp"),
    ).toBe(true);
    expect(
      isWorkspaceArtifact("plugins/reference-api/output/reference-api.s2sp"),
    ).toBe(false);
  });
});
