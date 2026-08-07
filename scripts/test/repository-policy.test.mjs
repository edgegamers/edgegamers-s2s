import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { validateRepositoryPolicy } from "../lib/repository-policy.mjs";

const roots = [];

function write(root, path, contents) {
  const target = join(root, path);
  mkdirSync(join(target, ".."), { recursive: true });
  writeFileSync(target, contents);
}

function packageManifest({
  name,
  edgegamers,
  privatePackage = true,
  s2script = {},
}) {
  return JSON.stringify({
    name,
    version: "0.1.0",
    license: "MIT OR Apache-2.0",
    private: privatePackage,
    main: "src/plugin.ts",
    s2script,
    edgegamers,
  });
}

function createFixture() {
  const root = mkdtempSync(join(tmpdir(), "edgegamers-policy-"));
  roots.push(root);
  write(root, "package.json", JSON.stringify({
    name: "@edgegamers/s2script-plugins",
    private: true,
    workspaces: [
      "plugins/global/*",
      "plugins/games/*/*",
      "packages/global/*",
      "packages/games/*/*",
    ],
    s2script: {
      workspace: {
        plugins: [
          "plugins/global/*",
          "plugins/games/*/*",
        ],
      },
    },
  }));
  write(root, "plugins/global/core/package.json", packageManifest({
    name: "@edgegamers/core",
    edgegamers: { scope: "global", publicRegistry: false },
  }));
  write(root, "plugins/global/core/src/plugin.ts", "export {};\n");
  write(root, "plugins/games/cs2/cs2-api/package.json", packageManifest({
    name: "@edgegamers/cs2-api",
    edgegamers: { scope: "game", game: "cs2", publicRegistry: false },
  }));
  write(root, "plugins/games/cs2/cs2-api/src/plugin.ts", "export {};\n");
  write(root, "plugins/games/deadlock/deadlock-api/package.json", packageManifest({
    name: "@edgegamers/deadlock-api",
    edgegamers: { scope: "game", game: "deadlock", publicRegistry: false },
  }));
  write(root, "plugins/games/deadlock/deadlock-api/src/plugin.ts", "export {};\n");
  write(root, "servers/games/cs2/ttt/server.json", JSON.stringify({
    name: "ttt",
    game: "cs2",
    environments: ["development", "production"],
    pluginChannel: { development: "dev", production: "main" },
  }));
  write(root, "servers/games/cs2/ttt/s2script-plugins.txt", [
    "@edgegamers/core",
    "@edgegamers/cs2-api",
    "",
  ].join("\n"));
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("validateRepositoryPolicy", () => {
  it("accepts compatible global and same-game plugin metadata", () => {
    expect(validateRepositoryPolicy(createFixture())).toEqual([]);
  });

  it("rejects a global plugin that depends on a game-specific plugin", () => {
    const root = createFixture();
    const path = join(root, "plugins/global/core/package.json");
    const manifest = JSON.parse(readFileSync(path, "utf8"));
    manifest.s2script.pluginDependencies = { "@edgegamers/cs2-api": "^0.1.0" };
    writeFileSync(path, JSON.stringify(manifest));

    expect(validateRepositoryPolicy(root)).toContain(
      "plugins/global/core/package.json: global plugin @edgegamers/core must not depend on game plugin @edgegamers/cs2-api",
    );
  });

  it("rejects a game plugin that depends on another game's plugin", () => {
    const root = createFixture();
    const path = join(root, "plugins/games/deadlock/deadlock-api/package.json");
    const manifest = JSON.parse(readFileSync(path, "utf8"));
    manifest.s2script.pluginDependencies = { "@edgegamers/cs2-api": "^0.1.0" };
    writeFileSync(path, JSON.stringify(manifest));

    expect(validateRepositoryPolicy(root)).toContain(
      "plugins/games/deadlock/deadlock-api/package.json: game plugin @edgegamers/deadlock-api for deadlock must not depend on cs2 plugin @edgegamers/cs2-api",
    );
  });

  it("rejects plugin metadata that contradicts its path", () => {
    const root = createFixture();
    const path = join(root, "plugins/games/cs2/cs2-api/package.json");
    const manifest = JSON.parse(readFileSync(path, "utf8"));
    manifest.edgegamers.game = "deadlock";
    writeFileSync(path, JSON.stringify(manifest));

    expect(validateRepositoryPolicy(root)).toContain(
      "plugins/games/cs2/cs2-api/package.json: game plugin metadata must declare edgegamers.game \"cs2\"",
    );
  });

  it("rejects a server plugin list entry from another game", () => {
    const root = createFixture();
    write(root, "servers/games/cs2/ttt/s2script-plugins.txt", [
      "@edgegamers/core",
      "@edgegamers/deadlock-api",
      "",
    ].join("\n"));

    expect(validateRepositoryPolicy(root)).toContain(
      "servers/games/cs2/ttt/s2script-plugins.txt: cs2 server must not include deadlock plugin @edgegamers/deadlock-api",
    );
  });

  it("rejects a public package that is not explicitly allowlisted for registry publication", () => {
    const root = createFixture();
    const path = join(root, "plugins/global/core/package.json");
    const manifest = JSON.parse(readFileSync(path, "utf8"));
    manifest.private = false;
    manifest.edgegamers.publicRegistry = false;
    writeFileSync(path, JSON.stringify(manifest));

    expect(validateRepositoryPolicy(root)).toContain(
      "plugins/global/core/package.json: public registry package @edgegamers/core must set edgegamers.publicRegistry true",
    );
  });
});
