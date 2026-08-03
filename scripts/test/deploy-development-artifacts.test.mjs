import { describe, expect, it } from "vitest";
import {
  buildDeployPlan,
  remoteManifestPath,
} from "../deploy-development-artifacts.mjs";

describe("remoteManifestPath", () => {
  it("stores the managed manifest beside live plugins", () => {
    expect(remoteManifestPath("/srv/cs2/game/csgo/addons/s2script/plugins")).toBe(
      "/srv/cs2/game/csgo/addons/s2script/plugins/.edgegamers-development-manifest.json",
    );
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
});
