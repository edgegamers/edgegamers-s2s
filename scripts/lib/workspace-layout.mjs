import { readFileSync, readdirSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";

const WORKSPACE_ROOTS = new Map([
  ["packages", "package"],
  ["plugins", "plugin"],
]);
const EXCLUDED_DIRECTORIES = new Set([".s2script", "dist", "node_modules"]);

export function scopeAllows(sourceScope, targetScope) {
  return targetScope === "global" || sourceScope === targetScope;
}

export function loadWorkspacePolicy(rootDir) {
  const policyPath = resolve(rootDir, "workspace-policy.json");
  let raw;
  try {
    raw = JSON.parse(readFileSync(policyPath, "utf8"));
  } catch (error) {
    throw new Error(`Unable to read workspace policy: ${error.message}`, { cause: error });
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Workspace policy must be an object");
  }
  if (!Array.isArray(raw.games) || raw.games.length === 0
    || raw.games.some((game) => typeof game !== "string"
      || !/^[a-z0-9][a-z0-9-]*$/u.test(game) || game === "global")
    || new Set(raw.games).size !== raw.games.length) {
    throw new Error("Workspace policy games must be a non-empty, duplicate-free array of lowercase IDs");
  }
  const games = new Set(raw.games);
  if (!raw.externalScopes || typeof raw.externalScopes !== "object"
    || Array.isArray(raw.externalScopes)) {
    throw new Error("Workspace policy externalScopes must be an object");
  }
  const externalScopes = new Map(Object.entries(raw.externalScopes));
  for (const scope of externalScopes.values()) {
    if (scope !== "global" && !games.has(scope)) {
      throw new Error(`Workspace policy external scope is unknown: ${scope}`);
    }
  }
  return { games, externalScopes };
}

function repositoryPath(rootDir, absolutePath) {
  return relative(rootDir, absolutePath).split(sep).join("/");
}

function walkManifests(rootDir) {
  const manifests = [];
  for (const [rootName, kind] of WORKSPACE_ROOTS) {
    const rootPath = resolve(rootDir, rootName);
    if (!statSafeDirectory(rootPath)) continue;
    const visit = (directory) => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        if (entry.isDirectory() && !EXCLUDED_DIRECTORIES.has(entry.name)) {
          visit(resolve(directory, entry.name));
        } else if (entry.isFile() && entry.name === "package.json") {
          const manifestPath = resolve(directory, entry.name);
          manifests.push({
            kind,
            absoluteDirectory: directory,
            manifestPath,
            directory: repositoryPath(rootDir, directory),
          });
        }
      }
    };
    visit(rootPath);
  }
  return manifests.sort((a, b) => a.directory.localeCompare(b.directory));
}

function statSafeDirectory(path) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

export function inspectWorkspaceLayout(rootDir) {
  const absoluteRoot = resolve(rootDir);
  const policy = loadWorkspacePolicy(absoluteRoot);
  const errors = [];
  const packages = [];
  const byName = new Map();
  const manifests = walkManifests(absoluteRoot);
  for (let index = 0; index < manifests.length; index += 1) {
    const entry = manifests[index];
    const manifestLabel = `${entry.directory}/package.json`;
    if (entry.directory.split("/").length < 3) continue;
    for (const parent of manifests.slice(0, index)) {
      if (parent.directory.split("/").length < 3) continue;
      const remainder = relative(parent.absoluteDirectory, entry.absoluteDirectory);
      if (remainder !== "" && !remainder.startsWith(`..${sep}`) && !isAbsolute(remainder)) {
        errors.push(`${manifestLabel}: package root is nested inside ${parent.directory}`);
      }
    }
  }

  for (const entry of manifests) {
    const manifestLabel = `${entry.directory}/package.json`;
    let manifest;
    try {
      manifest = JSON.parse(readFileSync(entry.manifestPath, "utf8"));
    } catch {
      errors.push(`${manifestLabel}: invalid package manifest`);
      continue;
    }
    const parts = entry.directory.split("/");
    const scope = parts[1];
    const validPath = parts.length >= 3 && parts[0] === [...WORKSPACE_ROOTS.keys()]
      .find((root) => WORKSPACE_ROOTS.get(root) === entry.kind);
    if (!validPath) {
      errors.push(`${manifestLabel}: package root requires a scope and package directory`);
      continue;
    }
    if (scope !== "global" && !policy.games.has(scope)) {
      errors.push(`${manifestLabel}: unknown game scope ${scope}`);
      continue;
    }
    if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)
      || typeof manifest.name !== "string" || manifest.name.length === 0) {
      errors.push(`${manifestLabel}: package manifest requires a non-empty name`);
      continue;
    }
    const item = { ...entry, scope, name: manifest.name, manifest };
    packages.push(item);
  }
  const groupedNames = new Map();
  for (const item of packages) {
    const group = groupedNames.get(item.name) ?? [];
    group.push(item);
    groupedNames.set(item.name, group);
    if (!byName.has(item.name)) byName.set(item.name, item);
  }
  for (const group of groupedNames.values()) {
    if (group.length > 1) {
      const [first, ...others] = group;
      errors.push(`${first.directory}/package.json: duplicate package name ${first.name} (also ${others.map((item) => `${item.directory}/package.json`).join(", ")})`);
    }
  }
  errors.sort((a, b) => a.localeCompare(b));
  packages.sort((a, b) => a.directory.localeCompare(b.directory));
  return { policy, packages, byName, errors };
}

export function requireValidWorkspaceLayout(rootDir) {
  const result = inspectWorkspaceLayout(rootDir);
  if (result.errors.length > 0) {
    throw new Error(`Workspace layout is invalid:\n- ${result.errors.join("\n- ")}`);
  }
  return result;
}

export function findOwningPackage(packages, absolutePath) {
  let owner;
  for (const candidate of packages) {
    const remainder = relative(candidate.absoluteDirectory, absolutePath);
    if (remainder === "" || (!remainder.startsWith(`..${sep}`) && !isAbsolute(remainder))) {
      if (!owner || candidate.absoluteDirectory.length > owner.absoluteDirectory.length) owner = candidate;
    }
  }
  return owner;
}
