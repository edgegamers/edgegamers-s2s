import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export function buildGhReleaseCommands({ plan, repository }) {
  if (plan.schemaVersion !== 1) {
    throw new Error("Unsupported plugin release plan schema");
  }
  return plan.releases.map((release) => ({
    command: "gh",
    args: [
      "release",
      "create",
      release.releaseTag,
      `${release.artifactPath}#${release.assetName}`,
      "--repo",
      repository,
      "--title",
      `${release.packageName} v${release.version}`,
      "--notes",
      `SHA-256: ${release.sha256}`,
      "--latest=false",
    ],
  }));
}

export function publishGitHubPluginReleases({
  root = process.cwd(),
  repository,
  plan,
  execFile = execFileSync,
} = {}) {
  if (plan.schemaVersion !== 1) {
    throw new Error("Unsupported plugin release plan schema");
  }

  for (const release of plan.releases) {
    const asset = `${release.artifactPath}#${release.assetName}`;
    const viewArgs = [
      "release",
      "view",
      release.releaseTag,
      "--repo",
      repository,
    ];

    let releaseExists = true;
    try {
      execFile("gh", viewArgs, { cwd: root, stdio: "ignore" });
    } catch {
      releaseExists = false;
    }

    if (releaseExists) {
      execFile(
        "gh",
        [
          "release",
          "upload",
          release.releaseTag,
          asset,
          "--repo",
          repository,
          "--clobber",
        ],
        { cwd: root, stdio: "inherit" },
      );
    } else {
      execFile(
        "gh",
        [
          "release",
          "create",
          release.releaseTag,
          asset,
          "--repo",
          repository,
          "--title",
          `${release.packageName} v${release.version}`,
          "--notes",
          `SHA-256: ${release.sha256}`,
          "--latest=false",
        ],
        { cwd: root, stdio: "inherit" },
      );
    }
  }
}

export function main({
  root = process.cwd(),
  env = process.env,
  execFile = execFileSync,
} = {}) {
  const repository = env.GITHUB_REPOSITORY;
  if (!repository) throw new Error("GITHUB_REPOSITORY is required");
  const plan = JSON.parse(
    readFileSync(join(root, "artifacts", "plugin-release-plan.json"), "utf8"),
  );
  publishGitHubPluginReleases({ root, repository, plan, execFile });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
