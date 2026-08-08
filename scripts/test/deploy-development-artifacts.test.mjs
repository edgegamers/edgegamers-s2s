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
import {
  buildDeployPlan,
  buildRemoteScript,
  findChangedPluginPackages,
  readDevelopmentTargets,
  remoteManifestPath,
  selectAffectedTargets,
  writeTargetArtifacts,
} from "../deploy-development-artifacts.mjs";

describe("remoteManifestPath", () => {
  it("stores the managed manifest beside live plugins", () => {
    expect(remoteManifestPath("/srv/cs2/game/csgo/addons/s2script/plugins")).toBe(
      "/srv/cs2/game/csgo/addons/s2script/plugins/.edgegamers-development-manifest.json",
    );
  });
});

describe("buildRemoteScript", () => {
  it("reconciles enabled and disabled managed plugin paths", () => {
    const script = buildRemoteScript({
      remoteStagingDirectory: "/tmp/edgegamers-s2s-development/123",
      remotePluginDirectory: "/srv/cs2/game/csgo/addons/s2script/plugins",
    });

    expect(script).toContain("function managedRelativePath(plugin)");
    expect(script).toContain('mkdir -p "$plugin_dir/disabled"');
    expect(script).toContain(
      "rmSync(join(pluginDir, relativePath), { force: true });",
    );
    expect(script).toContain(
      "cpSync(join(staging, plugin.fileName), join(pluginDir, managedRelativePath(plugin)), { force: true });",
    );
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

describe("readDevelopmentTargets", () => {
  it("merges inherited common plugins into child server targets", () => {
    const root = mkdtempSync(join(tmpdir(), "edgegamers-dev-targets-"));

    try {
      mkdirSync(join(root, "config"), { recursive: true });
      mkdirSync(join(root, ".dev-server-repos", "empty-s2s"), { recursive: true });
      mkdirSync(join(root, ".dev-server-repos", "ttt-s2s"), { recursive: true });
      writeFileSync(
        join(root, ".dev-server-repos", "empty-s2s", "server-plugins.json"),
        JSON.stringify({
          plugins: [
            { name: "@edgegamers/common" },
            { name: "@edgegamers/shared", enabled: false },
          ],
        }),
      );
      writeFileSync(
        join(root, ".dev-server-repos", "ttt-s2s", "server-plugins.json"),
        JSON.stringify({
          plugins: [
            { name: "@edgegamers/ttt" },
            { name: "@edgegamers/shared", enabled: true },
          ],
        }),
      );
      writeFileSync(
        join(root, "config", "development-servers.json"),
        JSON.stringify({
          servers: [
            {
              name: "empty-s2s",
              pluginDir: "/var/lib/docker/volumes/empty/_data/s2script/plugins",
              intentFile: ".dev-server-repos/empty-s2s/server-plugins.json",
            },
            {
              name: "ttt-s2s",
              pluginDir: "/var/lib/docker/volumes/ttt/_data/s2script/plugins",
              inherits: "empty-s2s",
              intentFile: ".dev-server-repos/ttt-s2s/server-plugins.json",
              disabledPlugins: ["@edgegamers/common"],
            },
          ],
        }),
      );

      expect(readDevelopmentTargets({ root })).toEqual([
        {
          name: "empty-s2s",
          pluginDir: "/var/lib/docker/volumes/empty/_data/s2script/plugins",
          plugins: ["@edgegamers/common"],
          disabledPlugins: ["@edgegamers/shared"],
        },
        {
          name: "ttt-s2s",
          pluginDir: "/var/lib/docker/volumes/ttt/_data/s2script/plugins",
          plugins: ["@edgegamers/shared", "@edgegamers/ttt"],
          disabledPlugins: ["@edgegamers/common"],
        },
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("keeps the old single-directory fallback for manual deployments", () => {
    expect(
      readDevelopmentTargets({
        root: mkdtempSync(join(tmpdir(), "edgegamers-dev-targets-")),
        env: {
          DEV_S2SCRIPT_PLUGIN_DIR:
            "/var/lib/docker/volumes/ttt/_data/s2script/plugins",
        },
      }),
    ).toEqual([
      {
        name: "default",
        pluginDir: "/var/lib/docker/volumes/ttt/_data/s2script/plugins",
        plugins: ["*"],
        disabledPlugins: [],
      },
    ]);
  });
});

describe("selectAffectedTargets", () => {
  it("selects only targets that consume a changed plugin", () => {
    const targets = [
      {
        name: "empty-s2s",
        pluginDir: "/plugins/empty",
        plugins: ["@edgegamers/common"],
        disabledPlugins: [],
      },
      {
        name: "ttt-s2s",
        pluginDir: "/plugins/ttt",
        plugins: ["@edgegamers/common", "@edgegamers/ttt"],
        disabledPlugins: [],
      },
    ];

    expect(
      selectAffectedTargets({
        targets,
        changedPluginPackages: new Set(["@edgegamers/ttt"]),
      }).map((target) => target.name),
    ).toEqual(["ttt-s2s"]);
  });

  it("treats disabled-only plugins as managed target membership", () => {
    const targets = [
      {
        name: "disabled-target",
        pluginDir: "/plugins/disabled-target",
        plugins: [],
        disabledPlugins: ["@edgegamers/disabled"],
      },
    ];

    expect(
      selectAffectedTargets({
        targets,
        changedPluginPackages: new Set(["@edgegamers/disabled"]),
      }).map((target) => target.name),
    ).toEqual(["disabled-target"]);
  });
});

describe("findChangedPluginPackages", () => {
  it("returns plugin packages changed by a git diff", () => {
    const packages = new Map([["ttt", "@edgegamers/ttt"]]);
    const changed = findChangedPluginPackages({
      root: "/repo",
      base: "before",
      head: "after",
      pluginPackageByDirectory: packages,
      execFile: () => "plugins/ttt/src/index.ts\nREADME.md\n",
    });

    expect(changed).toEqual(new Set(["@edgegamers/ttt"]));
  });

  it("treats shared package changes as unknown server impact", () => {
    expect(
      findChangedPluginPackages({
        root: "/repo",
        base: "before",
        head: "after",
        execFile: () => "packages/shared/index.ts\n",
      }),
    ).toBeUndefined();
  });
});

describe("writeTargetArtifacts", () => {
  it("writes a target-specific manifest and disabled plugin path intent", () => {
    const root = mkdtempSync(join(tmpdir(), "edgegamers-target-artifacts-"));
    const source = join(root, "artifacts", "local-development");

    try {
      mkdirSync(source, { recursive: true });
      writeFileSync(join(source, "common.s2sp"), "common");
      writeFileSync(join(source, "ttt.s2sp"), "ttt");
      writeFileSync(
        join(source, "development-manifest.json"),
        JSON.stringify({
          schemaVersion: 1,
          managedBy: "edgegamers-s2s",
          environment: "development",
          plugins: [
            {
              artifact: "plugins/common/dist/common.s2sp",
              packageName: "@edgegamers/common",
              fileName: "common.s2sp",
              enabled: true,
              installPath: "enabled",
              sha256: "a".repeat(64),
            },
            {
              artifact: "plugins/ttt/dist/ttt.s2sp",
              packageName: "@edgegamers/ttt",
              fileName: "ttt.s2sp",
              enabled: true,
              installPath: "enabled",
              sha256: "b".repeat(64),
            },
          ],
        }),
      );

      const targetDirectory = writeTargetArtifacts({
        root,
        sourceArtifactDirectory: source,
        target: {
          name: "ttt-s2s",
          pluginDir: "/plugins/ttt",
          plugins: ["@edgegamers/common", "@edgegamers/ttt"],
          disabledPlugins: ["@edgegamers/common"],
        },
      });
      const manifest = JSON.parse(
        readFileSync(join(targetDirectory, "development-manifest.json"), "utf8"),
      );

      expect(manifest.plugins).toEqual([
        expect.objectContaining({
          packageName: "@edgegamers/common",
          enabled: false,
          installPath: "disabled",
        }),
        expect.objectContaining({
          packageName: "@edgegamers/ttt",
          enabled: true,
          installPath: "enabled",
        }),
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
