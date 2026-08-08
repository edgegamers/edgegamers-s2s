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
        { path: "plugins/api/dist/api.s2sp", bytes: Buffer.from("api") },
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
          { path: "plugins/one/dist/shared.s2sp", bytes: Buffer.from("one") },
          { path: "plugins/two/dist/shared.s2sp", bytes: Buffer.from("two") },
        ],
        commit: "abcdef1234567890",
        generatedAt: "2026-08-03T12:00:00.000Z",
      }),
    ).toThrow("Duplicate artifact file name: shared.s2sp");
  });

  it("sorts artifacts, normalizes paths, and records immutable identity", () => {
    const manifest = createDevelopmentManifest({
      artifacts: [
        { path: "plugins\\zeta\\dist\\zeta.s2sp", bytes: Buffer.from("zeta") },
        {
          path: "plugins/alpha/dist/alpha.s2sp",
          packageName: "@edgegamers/alpha",
          bytes: Buffer.from("alpha"),
        },
      ],
      commit: "abcdef1234567890",
      generatedAt: "2026-07-31T12:00:00.000Z",
    });

    expect(manifest).toEqual({
      schemaVersion: 1,
      managedBy: "edgegamers-s2s",
      environment: "development",
      commit: "abcdef1234567890",
      generatedAt: "2026-07-31T12:00:00.000Z",
      plugins: [
        {
          artifact: "plugins/alpha/dist/alpha.s2sp",
          packageName: "@edgegamers/alpha",
          fileName: "alpha.s2sp",
          enabled: true,
          installPath: "enabled",
          revision: "dev.abcdef1",
          sha256:
            "8ed3f6ad685b959ead7022518e1af76cd816f8e8ec7ccdda1ed4018e8f2223f8",
        },
        expect.objectContaining({
          artifact: "plugins/zeta/dist/zeta.s2sp",
          fileName: "zeta.s2sp",
          enabled: true,
          installPath: "enabled",
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
          { path: "plugins\\api\\dist\\api.s2sp", bytes: Buffer.from("one") },
          { path: "plugins/api/dist/api.s2sp", bytes: Buffer.from("two") },
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
  it("accepts only direct SDK dist artifacts on either path separator", () => {
    expect(
      isWorkspaceArtifact("plugins/reference-api/dist/reference-api.s2sp"),
    ).toBe(true);
    expect(
      isWorkspaceArtifact("plugins\\reference-api\\dist\\reference-api.s2sp"),
    ).toBe(true);
    expect(
      isWorkspaceArtifact("plugins/reference-api/output/reference-api.s2sp"),
    ).toBe(false);
  });
});
