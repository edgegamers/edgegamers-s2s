import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { unzipSync } from "fflate";
import { findS2spFiles, isWorkspaceArtifact } from "./development-manifest.mjs";

export function validateArtifact({ artifactPath, bytes, mitText }) {
  let entries;
  try {
    entries = unzipSync(bytes);
  } catch (error) {
    return [`${artifactPath}: malformed zip archive: ${error.message}`];
  }
  const plugin = entries["plugin.js"];
  if (!plugin) return [`${artifactPath}: archive is missing plugin.js`];
  if (!Buffer.from(plugin).toString("utf8").includes(mitText)) {
    return [`${artifactPath}: plugin.js does not contain the complete MIT notice`];
  }
  return [];
}

export function validateBuiltArtifacts({ rootDir }) {
  const mitPath = join(rootDir, "licenses", "MIT.txt");
  if (!existsSync(mitPath)) return ["licenses/MIT.txt: required licensing file is missing"];
  const mitText = readFileSync(mitPath, "utf8").trim();
  const artifacts = findS2spFiles(join(rootDir, "plugins"))
    .filter((path) => isWorkspaceArtifact(relative(rootDir, path)));
  if (artifacts.length === 0) return ["plugins/*/dist/*.s2sp: no built plugin artifacts found"];
  return artifacts.flatMap((path) => validateArtifact({
    artifactPath: relative(rootDir, path).replaceAll("\\", "/"),
    bytes: readFileSync(path),
    mitText,
  }));
}
