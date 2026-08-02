import {
  copyFileSync,
  existsSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import {
  findS2spFiles,
  isWorkspaceArtifact,
} from "./lib/development-manifest.mjs";

export function writeLocalArtifacts({ root = process.cwd() } = {}) {
  const outputDirectory = join(root, "artifacts", "local-development");
  const sourceArtifacts = findS2spFiles(join(root, "plugins"))
    .map((absolutePath) => ({
      absolutePath,
      relativePath: relative(root, absolutePath),
    }))
    .filter((artifact) => isWorkspaceArtifact(artifact.relativePath));

  if (sourceArtifacts.length === 0) {
    throw new Error("No built .s2sp artifacts found. Run `npm run build` first.");
  }

  rmSync(outputDirectory, { recursive: true, force: true });
  mkdirSync(outputDirectory, { recursive: true });

  const copied = [];
  const usedFileNames = new Set();

  for (const artifact of sourceArtifacts) {
    const fileName = basename(artifact.relativePath);

    if (usedFileNames.has(fileName)) {
      throw new Error(`Duplicate local artifact file name: ${fileName}`);
    }

    usedFileNames.add(fileName);

    const destination = join(outputDirectory, fileName);
    copyFileSync(artifact.absolutePath, destination);
    copied.push(relative(root, destination).replaceAll("\\", "/"));
  }

  copied.sort();

  const manifestSource = join(root, "artifacts", "development-manifest.json");
  if (existsSync(manifestSource)) {
    copyFileSync(manifestSource, join(outputDirectory, "development-manifest.json"));
  }

  writeFileSync(
    join(outputDirectory, "README.txt"),
    [
      "Local Source2Script development artifacts.",
      "",
      "Run `npm run artifacts:local` from the repository root to rebuild this folder.",
      "Copy the .s2sp files from this directory into your local development server plugin path.",
      "",
      "Files:",
      ...copied.map((artifact) => `- ${artifact}`),
      "",
    ].join("\n"),
  );

  return { copied, outputDirectory };
}

export function main({ root = process.cwd(), write = console.log, error = console.error } = {}) {
  try {
    const result = writeLocalArtifacts({ root });
    write(
      `Copied ${result.copied.length} .s2sp artifacts to ${relative(root, result.outputDirectory).replaceAll("\\", "/")}.`,
    );
    return 0;
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught);
    error(`Local artifact collection failed: ${message}`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main();
}
