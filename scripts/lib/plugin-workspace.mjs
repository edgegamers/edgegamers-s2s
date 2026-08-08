import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

export function normalizePath(path) {
  return path.replaceAll("\\", "/");
}

export function pluginPathPattern() {
  return /^plugins\/([^/]+)\/([^/]+)\//u;
}

export function parsePluginPath(path) {
  const normalized = normalizePath(path);
  const match = pluginPathPattern().exec(normalized);
  if (!match) return undefined;
  return {
    scope: match[1],
    directory: `${match[1]}/${match[2]}`,
    name: match[2],
  };
}

export function isWorkspaceArtifactPath(path) {
  return /^plugins\/[^/]+\/[^/]+\/dist\/[^/]+[.]s2sp$/u.test(
    normalizePath(path),
  );
}

export function discoverPluginPackagePaths(root) {
  const pluginsRoot = join(root, "plugins");
  const result = [];

  if (!existsSync(pluginsRoot)) return result;

  for (const scopeEntry of readdirSync(pluginsRoot, { withFileTypes: true })) {
    if (!scopeEntry.isDirectory()) continue;

    const scopeRoot = join(pluginsRoot, scopeEntry.name);
    for (const pluginEntry of readdirSync(scopeRoot, { withFileTypes: true })) {
      if (!pluginEntry.isDirectory()) continue;

      const packagePath = join(scopeRoot, pluginEntry.name, "package.json");
      if (existsSync(packagePath)) result.push(packagePath);
    }
  }

  return result.sort();
}

export function readPluginPackages(root) {
  return discoverPluginPackagePaths(root).map((packagePath) => {
    const relativePackagePath = normalizePath(relative(root, packagePath));
    const parsed = parsePluginPath(relativePackagePath);
    if (!parsed) throw new Error(`${relativePackagePath}: invalid plugin path`);
    return {
      ...parsed,
      packagePath,
      relativePackagePath,
      packageJson: JSON.parse(readFileSync(packagePath, "utf8")),
    };
  });
}
