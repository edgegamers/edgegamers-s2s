import { createHash } from "node:crypto";
import { existsSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";

export function createDevelopmentManifest({
  artifacts,
  commit,
  generatedAt,
}) {
  if (!commit.trim()) throw new Error("Commit identity is required");
  if (artifacts.length === 0) throw new Error("No .s2sp artifacts found");

  const seen = new Set();
  const plugins = artifacts.map((artifact) => {
    const normalizedPath = artifact.path.replaceAll("\\", "/");

    if (seen.has(normalizedPath)) {
      throw new Error(`Duplicate artifact path: ${normalizedPath}`);
    }
    seen.add(normalizedPath);

    return {
      artifact: normalizedPath,
      fileName: basename(normalizedPath),
      revision: `dev.${commit.slice(0, 7)}`,
      sha256: createHash("sha256").update(artifact.bytes).digest("hex"),
    };
  });

  plugins.sort((left, right) => left.artifact.localeCompare(right.artifact));

  return {
    environment: "development",
    commit,
    generatedAt,
    plugins,
  };
}

export function isWorkspaceArtifact(path) {
  const normalizedPath = path.replaceAll("\\", "/");
  return /^plugins\/[^/]+\/dist\/[^/]+\.s2sp$/u.test(normalizedPath);
}

export function findS2spFiles(root) {
  if (!existsSync(root)) return [];

  const files = [];

  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);

    if (entry.isDirectory()) {
      files.push(...findS2spFiles(path));
    } else if (entry.isFile() && entry.name.endsWith(".s2sp")) {
      files.push(path);
    }
  }

  return files.sort();
}
