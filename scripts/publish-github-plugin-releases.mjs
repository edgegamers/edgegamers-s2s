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
  for (const command of buildGhReleaseCommands({ plan, repository })) {
    execFile(command.command, command.args, { cwd: root, stdio: "inherit" });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
