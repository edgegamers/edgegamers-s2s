import { describe, expect, it } from "vitest";
import {
  buildDeployPlan,
  buildRemoteScript,
  remoteManifestPath,
} from "../deploy-development-artifacts.mjs";

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
