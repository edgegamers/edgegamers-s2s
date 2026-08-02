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
import { describe, expect, it } from "vitest";
import { writeLocalArtifacts } from "../collect-local-artifacts.mjs";

describe("collect-local-artifacts", () => {
  it("copies every built workspace package into one local development folder", () => {
    const root = mkdtempSync(join(tmpdir(), "edgegamers-local-artifacts-"));

    try {
      mkdirSync(join(root, "plugins", "alpha", "dist"), { recursive: true });
      mkdirSync(join(root, "plugins", "zeta", "dist"), { recursive: true });
      writeFileSync(join(root, "plugins", "alpha", "dist", "alpha.s2sp"), "alpha");
      writeFileSync(join(root, "plugins", "zeta", "dist", "zeta.s2sp"), "zeta");

      const result = writeLocalArtifacts({ root });

      expect(result.copied).toEqual([
        "artifacts/local-development/alpha.s2sp",
        "artifacts/local-development/zeta.s2sp",
      ]);
      expect(
        readFileSync(join(root, "artifacts", "local-development", "alpha.s2sp"), "utf8"),
      ).toBe("alpha");
      expect(
        readFileSync(join(root, "artifacts", "local-development", "zeta.s2sp"), "utf8"),
      ).toBe("zeta");
      expect(
        existsSync(join(root, "artifacts", "local-development", "README.txt")),
      ).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
