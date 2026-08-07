import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  readServerDefinition,
  resolveServerPlugins,
} from "../lib/server-plugin-resolver.mjs";

const roots = [];

function write(root, path, contents) {
  const target = join(root, path);
  mkdirSync(join(target, ".."), { recursive: true });
  writeFileSync(target, contents);
}

function createFixture() {
  const root = mkdtempSync(join(tmpdir(), "edgegamers-server-resolver-"));
  roots.push(root);
  write(root, "servers/games/cs2/ttt/server.json", JSON.stringify({
    name: "ttt",
    game: "cs2",
    environments: ["development", "production"],
    pluginChannel: { development: "dev", production: "main" },
    inherits: ["empty"],
  }));
  write(root, "servers/games/cs2/empty/server.json", JSON.stringify({
    name: "empty",
    game: "cs2",
    environments: ["development"],
    pluginChannel: { development: "dev" },
  }));
  write(root, "servers/games/cs2/empty/s2script-plugins.txt", [
    "@edgegamers/core",
    "",
  ].join("\n"));
  write(root, "servers/games/cs2/ttt/s2script-plugins.txt", [
    "# comments are ignored",
    "@edgegamers/ttt",
    "",
  ].join("\n"));
  return root;
}

const manifest = {
  schemaVersion: 1,
  managedBy: "edgegamers-s2s",
  channel: "main",
  plugins: [
    {
      name: "@edgegamers/core",
      scope: "global",
      fileName: "core.s2sp",
      sha256: "0".repeat(64),
    },
    {
      name: "@edgegamers/ttt",
      scope: "game",
      game: "cs2",
      fileName: "ttt.s2sp",
      sha256: "1".repeat(64),
    },
    {
      name: "@edgegamers/deadlock-api",
      scope: "game",
      game: "deadlock",
      fileName: "deadlock-api.s2sp",
      sha256: "2".repeat(64),
    },
  ],
};

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("readServerDefinition", () => {
  it("reads server metadata and package-name plugin list", () => {
    const server = readServerDefinition({
      rootDir: createFixture(),
      game: "cs2",
      serverName: "ttt",
    });

    expect(server).toEqual(expect.objectContaining({
      name: "ttt",
      game: "cs2",
      directory: expect.stringContaining("servers"),
      pluginNames: ["@edgegamers/core", "@edgegamers/ttt"],
      inheritedServers: ["empty"],
    }));
  });
});

describe("resolveServerPlugins", () => {
  it("selects only the plugins declared by the server", () => {
    const server = readServerDefinition({
      rootDir: createFixture(),
      game: "cs2",
      serverName: "ttt",
    });

    expect(resolveServerPlugins({ server, manifest })).toEqual({
      server: "ttt",
      game: "cs2",
      channel: "main",
      plugins: [
        expect.objectContaining({ name: "@edgegamers/core", fileName: "core.s2sp" }),
        expect.objectContaining({ name: "@edgegamers/ttt", fileName: "ttt.s2sp" }),
      ],
      fileNames: ["core.s2sp", "ttt.s2sp"],
    });
  });

  it("rejects unknown server plugin names", () => {
    const root = createFixture();
    write(root, "servers/games/cs2/ttt/s2script-plugins.txt", "@edgegamers/missing\n");
    const server = readServerDefinition({ rootDir: root, game: "cs2", serverName: "ttt" });

    expect(() => resolveServerPlugins({ server, manifest })).toThrow(
      "servers/games/cs2/ttt/s2script-plugins.txt: channel main does not contain @edgegamers/missing",
    );
  });

  it("rejects a plugin from another game", () => {
    const root = createFixture();
    write(root, "servers/games/cs2/ttt/s2script-plugins.txt", "@edgegamers/deadlock-api\n");
    const server = readServerDefinition({ rootDir: root, game: "cs2", serverName: "ttt" });

    expect(() => resolveServerPlugins({ server, manifest })).toThrow(
      "servers/games/cs2/ttt/s2script-plugins.txt: cs2 server must not include deadlock plugin @edgegamers/deadlock-api",
    );
  });
});
