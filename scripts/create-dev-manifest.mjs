import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import {
  createDevelopmentManifest,
  findS2spFiles,
  isWorkspaceArtifact,
} from "./lib/development-manifest.mjs";

function currentCommit(root) {
  return execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim();
}

export function writeDevelopmentManifest({ root, commit, generatedAt }) {
  const artifacts = findS2spFiles(join(root, "plugins"))
    .map((absolutePath) => ({
      absolutePath,
      path: relative(root, absolutePath),
    }))
    .filter((artifact) => isWorkspaceArtifact(artifact.path))
    .map((artifact) => ({
      path: artifact.path,
      bytes: readFileSync(artifact.absolutePath),
    }));
  const manifest = createDevelopmentManifest({
    artifacts,
    commit,
    generatedAt,
  });
  const outputDirectory = join(root, "artifacts");
  const outputPath = join(outputDirectory, "development-manifest.json");
  const temporaryPath = `${outputPath}.tmp`;

  mkdirSync(outputDirectory, { recursive: true });

  try {
    writeFileSync(temporaryPath, `${JSON.stringify(manifest, null, 2)}\n`);
    renameSync(temporaryPath, outputPath);
  } finally {
    if (existsSync(temporaryPath)) unlinkSync(temporaryPath);
  }

  return { manifest, outputPath };
}

export function main({
  root = process.cwd(),
  commit = process.env.GITHUB_SHA ?? currentCommit(root),
  generatedAt = new Date().toISOString(),
  write = console.log,
  error = console.error,
} = {}) {
  try {
    const result = writeDevelopmentManifest({ root, commit, generatedAt });
    write(
      `Wrote ${relative(root, result.outputPath).replaceAll("\\", "/")} with ${result.manifest.plugins.length} plugin artifacts.`,
    );
    return 0;
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught);
    error(`Development manifest failed: ${message}`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main();
}
