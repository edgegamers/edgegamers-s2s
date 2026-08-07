import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { main } from "../check-changeset.mjs";

describe("check-changeset CLI", () => {
  it("reports a changed publishable plugin covered by a Changeset", () => {
    const root = mkdtempSync(join(tmpdir(), "edgegamers-changeset-"));

    try {
      mkdirSync(join(root, "plugins", "global", "public-plugin"), { recursive: true });
      mkdirSync(join(root, ".changeset"), { recursive: true });
      writeFileSync(
        join(root, "package.json"),
        JSON.stringify({
          s2script: {
            workspace: {
              plugins: ["plugins/global/*"],
            },
          },
        }),
      );
      writeFileSync(
        join(root, "plugins", "global", "public-plugin", "package.json"),
        JSON.stringify({
          name: "@edgegamers/public-plugin",
          version: "1.0.0",
        }),
      );
      writeFileSync(
        join(root, ".changeset", "covered.md"),
        '---\n"@edgegamers/public-plugin": patch\n---\n\nFix behavior.\n',
      );

      const messages = [];
      const git = (args) => {
        if (args[0] === "merge-base") return "base-commit";
        if (args[0] === "diff") return "plugins/global/public-plugin/src/plugin.ts";
        throw new Error(`Unexpected git arguments: ${args.join(" ")}`);
      };

      const exitCode = main({
        root,
        baseRef: "origin/dev",
        allowMissing: false,
        git,
        write: (message) => messages.push(message),
        warn: (message) => messages.push(message),
        error: (message) => messages.push(message),
      });

      expect(exitCode).toBe(0);
      expect(messages).toContain(
        "Changesets cover: @edgegamers/public-plugin",
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
