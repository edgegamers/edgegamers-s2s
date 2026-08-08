import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { validatePluginOrganization } from "../lib/plugin-organization.mjs";

function writePlugin(root, scope, name, packageJson, source = "export {};\n") {
  const pluginRoot = join(root, "plugins", scope, name);
  mkdirSync(join(pluginRoot, "src"), { recursive: true });
  writeFileSync(join(pluginRoot, "package.json"), JSON.stringify(packageJson));
  writeFileSync(join(pluginRoot, "src", "plugin.ts"), source);
}

describe("validatePluginOrganization", () => {
  it("allows game plugins to reference global plugins", () => {
    const root = mkdtempSync(join(tmpdir(), "edgegamers-plugin-org-"));

    try {
      writePlugin(root, "global", "maul", {
        name: "@edgegamers/maul",
        license: "MIT OR Apache-2.0",
      });
      writePlugin(
        root,
        "cs2",
        "ttt",
        {
          name: "@edgegamers/ttt",
          license: "MIT OR Apache-2.0",
          s2script: {
            pluginDependencies: {
              "@edgegamers/maul": "^0.1.0",
            },
          },
        },
        'import type { MaulApi } from "@edgegamers/maul";\nvoid 0;\n',
      );

      expect(validatePluginOrganization(root)).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects cross-game EdgeGamers plugin references", () => {
    const root = mkdtempSync(join(tmpdir(), "edgegamers-plugin-org-"));

    try {
      writePlugin(root, "cs2", "cs-admin", {
        name: "@edgegamers/cs-admin",
        license: "MIT OR Apache-2.0",
      });
      writePlugin(root, "deadlock", "deadlock-mode", {
        name: "@edgegamers/deadlock-mode",
        license: "MIT OR Apache-2.0",
        s2script: {
          pluginDependencies: {
            "@edgegamers/cs-admin": "^0.1.0",
          },
        },
      });

      expect(validatePluginOrganization(root)).toEqual([
        "plugins/deadlock/deadlock-mode/package.json: deadlock plugin cannot reference cs2 package @edgegamers/cs-admin",
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it.each([
    ["dynamic import", 'void import("@edgegamers/cs-admin");\n'],
    ["require", 'require("@edgegamers/cs-admin");\n'],
  ])("rejects cross-game references through %s", (_label, source) => {
    const root = mkdtempSync(join(tmpdir(), "edgegamers-plugin-org-"));

    try {
      writePlugin(root, "cs2", "cs-admin", {
        name: "@edgegamers/cs-admin",
        license: "MIT OR Apache-2.0",
      });
      writePlugin(root, "deadlock", "deadlock-mode", {
        name: "@edgegamers/deadlock-mode",
        license: "MIT OR Apache-2.0",
      }, source);

      expect(validatePluginOrganization(root)).toEqual([
        "plugins/deadlock/deadlock-mode/package.json: deadlock plugin cannot reference cs2 package @edgegamers/cs-admin",
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
