import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildDeployPlan,
  buildRemoteScript,
  resolveDeploymentTargets,
  remoteManifestPath,
} from "../deploy-development-artifacts.mjs";

const roots = [];

function write(root, path, contents) {
  const target = join(root, path);
  mkdirSync(join(target, ".."), { recursive: true });
  writeFileSync(target, contents);
}

function createServerFixture() {
  const root = mkdtempSync(join(tmpdir(), "edgegamers-dev-targets-"));
  roots.push(root);
  for (const server of ["empty", "ttt"]) {
    write(root, `servers/games/cs2/${server}/server.json`, JSON.stringify({
      name: server,
      game: "cs2",
      environments: ["development"],
      pluginChannel: { development: "dev" },
    }));
  }
  write(root, "servers/games/cs2/empty/s2script-plugins.txt", "@edgegamers/core\n");
  write(root, "servers/games/cs2/ttt/s2script-plugins.txt", "@edgegamers/core\n@edgegamers/ttt\n");
  return root;
}

const manifest = {
  schemaVersion: 1,
  managedBy: "edgegamers-s2s",
  channel: "dev",
  plugins: [
    { name: "@edgegamers/core", scope: "global", fileName: "core.s2sp", sha256: "0".repeat(64) },
    { name: "@edgegamers/ttt", scope: "game", game: "cs2", fileName: "ttt.s2sp", sha256: "1".repeat(64) },
  ],
};

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("remoteManifestPath", () => {
  it("stores the managed manifest beside live plugins", () => {
    expect(remoteManifestPath("/srv/cs2/game/csgo/addons/s2script/plugins")).toBe(
      "/srv/cs2/game/csgo/addons/s2script/plugins/.edgegamers-development-manifest.json",
    );
  });
});

describe("buildRemoteScript", () => {
  it("validates managed manifests and copies only listed plugins", () => {
    const script = buildRemoteScript({
      remoteStagingDirectory: "/tmp/edgegamers-s2s-development/123",
      remotePluginDirectory: "/srv/cs2/game/csgo/addons/s2script/plugins",
      selectedFileNames: ["core.s2sp", "ttt.s2sp"],
    });

    expect(script).toContain("function listManagedFileNames(manifest)");
    expect(script).toContain(
      'const selectedFileNames = new Set(["core.s2sp","ttt.s2sp"]);',
    );
    expect(script).toContain(
      "const selectedPlugins = next.plugins.filter((plugin) => selectedFileNames.size === 0 || selectedFileNames.has(plugin.fileName));",
    );
    expect(script).toContain(
      "const previousFileNames = listManagedFileNames(previous);",
    );
    expect(script).toContain(
      "cpSync(join(staging, fileName), join(pluginDir, fileName), { force: true });",
    );
    expect(script).toContain("writeFileSync(manifestPath, `${JSON.stringify(filteredManifest, null, 2)}\\n`);");
    expect(script).not.toContain('cp -f "$staging/development-manifest.json" "$manifest_path"');
    expect(script).not.toContain('find "$staging"');
  });
});

describe("resolveDeploymentTargets", () => {
  it("builds multiple dev targets from DEV_SERVER_TARGETS", () => {
    const root = createServerFixture();

    const targets = resolveDeploymentTargets({
      root,
      manifest,
      env: {
        DEV_SSH_HOST: "dev.example.test",
        DEV_SSH_PORT: "22",
        DEV_SSH_USER: "deploy",
        DEV_SERVER_TARGETS: JSON.stringify([
          {
            game: "cs2",
            server: "empty",
            pluginDir: "/srv/empty/addons/s2script/plugins",
          },
          {
            game: "cs2",
            server: "ttt",
            pluginDir: "/srv/ttt/addons/s2script/plugins",
          },
        ]),
      },
    });

    expect(targets).toEqual([
      {
        game: "cs2",
        serverName: "empty",
        host: "dev.example.test",
        port: "22",
        user: "deploy",
        remotePluginDirectory: "/srv/empty/addons/s2script/plugins",
        selectedFileNames: ["core.s2sp"],
      },
      {
        game: "cs2",
        serverName: "ttt",
        host: "dev.example.test",
        port: "22",
        user: "deploy",
        remotePluginDirectory: "/srv/ttt/addons/s2script/plugins",
        selectedFileNames: ["core.s2sp", "ttt.s2sp"],
      },
    ]);
  });

  it("keeps the legacy single target environment shape", () => {
    const root = createServerFixture();

    expect(resolveDeploymentTargets({
      root,
      manifest,
      env: {
        DEV_SSH_HOST: "dev.example.test",
        DEV_SSH_USER: "deploy",
        DEV_S2SCRIPT_PLUGIN_DIR: "/srv/ttt/addons/s2script/plugins",
        DEV_SERVER_GAME: "cs2",
        DEV_SERVER_NAME: "ttt",
      },
    })).toEqual([
      expect.objectContaining({
        serverName: "ttt",
        port: "22",
        selectedFileNames: ["core.s2sp", "ttt.s2sp"],
      }),
    ]);
  });
});

describe("buildDeployPlan", () => {
  it("builds rsync and ssh commands from explicit inputs", () => {
    const plan = buildDeployPlan({
      host: "example.test",
      port: "2222",
      user: "deploy",
      keyPath: "/tmp/key",
      localArtifactDirectory: "artifacts/local-development",
      remotePluginDirectory: "/srv/cs2/game/csgo/addons/s2script/plugins",
      runId: "123",
    });

    expect(plan.remoteStagingDirectory).toBe(
      "/tmp/edgegamers-s2s-development/123",
    );
    expect(plan.rsyncArgs).toContain("--delete");
    expect(plan.rsyncArgs).toContain("artifacts/local-development/");
    expect(plan.sshDestination).toBe("deploy@example.test");
  });

  it("rejects run IDs that are unsafe in remote paths", () => {
    expect(() =>
      buildDeployPlan({
        host: "example.test",
        port: "2222",
        user: "deploy",
        keyPath: "/tmp/key",
        localArtifactDirectory: "artifacts/local-development",
        remotePluginDirectory: "/srv/cs2/game/csgo/addons/s2script/plugins",
        runId: "123; rm -rf /",
      }),
    ).toThrow("Unsafe run ID");
  });
});
