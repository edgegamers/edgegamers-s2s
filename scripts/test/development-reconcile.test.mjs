import { describe, expect, it } from "vitest";
import {
  listManagedFileNames,
  planManagedReconcile,
  quotePosix,
  validateRemotePluginDirectory,
} from "../lib/development-reconcile.mjs";

const manifest = (fileNames) => ({
  schemaVersion: 1,
  managedBy: "edgegamers-s2s",
  environment: "development",
  commit: "abcdef1234567890",
  generatedAt: "2026-08-03T12:00:00.000Z",
  plugins: fileNames.map((fileName) => ({
    artifact: `plugins/${fileName}/dist/${fileName}.s2sp`,
    fileName: `${fileName}.s2sp`,
    revision: "dev.abcdef1",
    sha256: "0".repeat(64),
    enabled: true,
    installPath: "enabled",
  })),
});

describe("planManagedReconcile", () => {
  it("deletes only stale files from the previous managed manifest", () => {
    expect(
      planManagedReconcile({
        previousManifest: manifest(["old", "keep"]),
        nextManifest: manifest(["keep", "new"]),
      }),
    ).toEqual({
      deletePaths: ["old.s2sp"],
      copyEntries: [
        { fileName: "keep.s2sp", installPath: "enabled" },
        { fileName: "new.s2sp", installPath: "enabled" },
      ],
    });
  });

  it("does not delete anything without a previous managed manifest", () => {
    expect(
      planManagedReconcile({
        previousManifest: undefined,
        nextManifest: manifest(["new"]),
      }),
    ).toEqual({
      deletePaths: [],
      copyEntries: [{ fileName: "new.s2sp", installPath: "enabled" }],
    });
  });

  it("moves disabled plugins into the disabled directory", () => {
    const next = manifest(["alpha"]);
    next.plugins[0].enabled = false;
    next.plugins[0].installPath = "disabled";

    expect(
      planManagedReconcile({
        previousManifest: undefined,
        nextManifest: next,
      }),
    ).toEqual({
      deletePaths: [],
      copyEntries: [{ fileName: "alpha.s2sp", installPath: "disabled" }],
    });
  });

  it("deletes stale managed files from enabled and disabled paths", () => {
    const previous = manifest(["old"]);
    previous.plugins[0].installPath = "disabled";

    expect(
      planManagedReconcile({
        previousManifest: previous,
        nextManifest: manifest(["new"]),
      }).deletePaths,
    ).toEqual(["disabled/old.s2sp"]);
  });
});

describe("listManagedFileNames", () => {
  it("rejects manifests from another owner", () => {
    expect(() =>
      listManagedFileNames({ ...manifest(["api"]), managedBy: "other" }),
    ).toThrow("Unsupported development manifest owner");
  });
});

describe("validateRemotePluginDirectory", () => {
  it("accepts an absolute plugin directory", () => {
    expect(
      validateRemotePluginDirectory("/srv/cs2/game/csgo/addons/s2script/plugins"),
    ).toBe("/srv/cs2/game/csgo/addons/s2script/plugins");
  });

  it("rejects empty and root-like destinations", () => {
    for (const value of ["", "/", "/srv", "/srv/"]) {
      expect(() => validateRemotePluginDirectory(value)).toThrow(
        "Unsafe remote plugin directory",
      );
    }
  });
});

describe("quotePosix", () => {
  it("quotes single quotes safely", () => {
    expect(quotePosix("/tmp/edge's plugins")).toBe("'/tmp/edge'\"'\"'s plugins'");
  });
});
