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
import { deployRegistryOptIns } from "../deploy-registry-opt-ins.mjs";

describe("deployRegistryOptIns", () => {
  it("skips deploy without changing package.json when no planned release opts in", () => {
    const root = mkdtempSync(join(tmpdir(), "edgegamers-registry-deploy-"));
    const originalPackageJson = writeWorkspace(root);

    try {
      writePlan(root, [
        {
          packageName: "@edgegamers/reference-api",
          publishToRegistry: false,
        },
      ]);
      const messages = [];

      const result = deployRegistryOptIns({
        root,
        execFile: () => {
          throw new Error("deploy should be skipped");
        },
        write: (message) => messages.push(message),
      });

      expect(result).toBe(0);
      expect(readFileSync(join(root, "package.json"), "utf8")).toBe(
        originalPackageJson,
      );
      expect(messages).toContain(
        "No plugin releases opted into Source2Script registry publishing; skipping deploy.",
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("deploys only planned registry opt-ins and restores package.json", () => {
    const root = mkdtempSync(join(tmpdir(), "edgegamers-registry-deploy-"));
    const originalPackageJson = writeWorkspace(root);
    const calls = [];

    try {
      writePluginPackage(root, "reference-api", "@edgegamers/reference-api");
      writePluginPackage(
        root,
        "reference-consumer",
        "@edgegamers/reference-consumer",
      );
      writePlan(root, [
        {
          packageName: "@edgegamers/reference-api",
          publishToRegistry: true,
        },
        {
          packageName: "@edgegamers/reference-consumer",
          publishToRegistry: false,
        },
      ]);

      const result = deployRegistryOptIns({
        root,
        execFile: (command, args) => {
          calls.push({ command, args });
          const packageJson = JSON.parse(
            readFileSync(join(root, "package.json"), "utf8"),
          );
          expect(packageJson.s2script.workspace.plugins).toEqual([
            "plugins/reference-api",
          ]);
        },
      });

      expect(result).toBe(0);
      expect(calls).toHaveLength(1);
      expect(calls[0].args.slice(-2)).toEqual(["deploy", "--ci"]);
      expect(readFileSync(join(root, "package.json"), "utf8")).toBe(
        originalPackageJson,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

function writeWorkspace(root) {
  const content = `${JSON.stringify(
    {
      name: "@edgegamers/s2script-plugins",
      private: true,
      s2script: { workspace: { plugins: ["plugins/*"] } },
    },
    null,
    2,
  )}\n`;
  writeFileSync(join(root, "package.json"), content);
  return content;
}

function writePluginPackage(root, directory, name) {
  mkdirSync(join(root, "plugins", directory), { recursive: true });
  writeFileSync(
    join(root, "plugins", directory, "package.json"),
    JSON.stringify({ name, version: "1.0.0" }),
  );
}

function writePlan(root, releases) {
  mkdirSync(join(root, "artifacts"), { recursive: true });
  writeFileSync(
    join(root, "artifacts", "plugin-release-plan.json"),
    `${JSON.stringify({ schemaVersion: 1, releases }, null, 2)}\n`,
  );
}
