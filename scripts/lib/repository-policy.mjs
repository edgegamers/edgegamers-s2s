import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function normalize(path) {
  return path.replaceAll("\\", "/");
}

function discoverPatternManifests(rootDir, pattern) {
  const normalized = normalize(pattern);
  const segments = normalized.split("/");
  if (!segments.includes("*")) {
    const path = join(rootDir, normalized, "package.json");
    return existsSync(path) ? [path] : [];
  }
  if (segments.some((segment) => segment !== "*" && /[*?]/u.test(segment))) {
    throw new Error(`Unsupported workspace pattern: ${pattern}`);
  }

  let directories = [rootDir];
  for (const segment of segments) {
    const next = [];
    for (const directory of directories) {
      if (segment === "*") {
        if (!existsSync(directory)) continue;
        for (const entry of readdirSync(directory, { withFileTypes: true })) {
          if (entry.isDirectory()) next.push(join(directory, entry.name));
        }
      } else {
        next.push(join(directory, segment));
      }
    }
    directories = next;
  }

  return directories
    .map((directory) => join(directory, "package.json"))
    .filter((path) => existsSync(path))
    .sort();
}

export function discoverPluginManifests(rootDir) {
  const rootManifest = readJson(join(rootDir, "package.json"));
  const pluginPatterns = rootManifest.s2script?.workspace?.plugins ?? [];
  const manifests = new Map();

  for (const pattern of pluginPatterns) {
    for (const path of discoverPatternManifests(rootDir, pattern)) {
      manifests.set(path, {
        path,
        relativePath: normalize(relative(rootDir, path)),
        packageDir: dirname(path),
        manifest: readJson(path),
      });
    }
  }

  return [...manifests.values()].sort((left, right) =>
    left.relativePath.localeCompare(right.relativePath),
  );
}

function expectedScopeFromPath(relativePath) {
  const parts = relativePath.split("/");
  if (parts[0] !== "plugins") return undefined;
  if (parts[1] === "global" && parts.length >= 4) {
    return { scope: "global" };
  }
  if (parts[1] === "games" && parts.length >= 5) {
    return { scope: "game", game: parts[2] };
  }
  return undefined;
}

function dependencyNames(manifest) {
  return [
    ...Object.keys(manifest.s2script?.pluginDependencies ?? {}),
    ...Object.keys(manifest.s2script?.optionalPluginDependencies ?? {}),
  ];
}

function validatePluginMetadata(errors, plugin) {
  const expected = expectedScopeFromPath(plugin.relativePath);
  const metadata = plugin.manifest.edgegamers;
  if (!expected) return;
  if (!metadata || typeof metadata !== "object") {
    errors.push(`${plugin.relativePath}: missing edgegamers metadata`);
    return;
  }
  if (metadata.scope !== expected.scope) {
    errors.push(`${plugin.relativePath}: plugin metadata must declare edgegamers.scope ${JSON.stringify(expected.scope)}`);
  }
  if (expected.scope === "global" && "game" in metadata) {
    errors.push(`${plugin.relativePath}: global plugin metadata must not declare edgegamers.game`);
  }
  if (expected.scope === "game" && metadata.game !== expected.game) {
    errors.push(`${plugin.relativePath}: game plugin metadata must declare edgegamers.game ${JSON.stringify(expected.game)}`);
  }
  if (plugin.manifest.private === false && metadata.publicRegistry !== true) {
    errors.push(`${plugin.relativePath}: public registry package ${plugin.manifest.name} must set edgegamers.publicRegistry true`);
  }
}

function validatePluginDependencies(errors, plugins) {
  const byName = new Map(plugins.map((plugin) => [plugin.manifest.name, plugin]));

  for (const plugin of plugins) {
    const metadata = plugin.manifest.edgegamers;
    if (!metadata) continue;
    for (const dependencyName of dependencyNames(plugin.manifest)) {
      const dependency = byName.get(dependencyName);
      if (!dependency?.manifest.edgegamers) continue;
      const dependencyMetadata = dependency.manifest.edgegamers;
      if (metadata.scope === "global" && dependencyMetadata.scope === "game") {
        errors.push(`${plugin.relativePath}: global plugin ${plugin.manifest.name} must not depend on game plugin ${dependency.manifest.name}`);
      }
      if (metadata.scope === "game"
        && dependencyMetadata.scope === "game"
        && metadata.game !== dependencyMetadata.game) {
        errors.push(`${plugin.relativePath}: game plugin ${plugin.manifest.name} for ${metadata.game} must not depend on ${dependencyMetadata.game} plugin ${dependency.manifest.name}`);
      }
    }
  }
}

function readPluginList(path) {
  return readFileSync(path, "utf8")
    .split(/\r?\n/u)
    .map((line) => line.replace(/#.*/u, "").trim())
    .filter(Boolean);
}

function discoverServerPluginLists(rootDir) {
  const serversRoot = join(rootDir, "servers", "games");
  if (!existsSync(serversRoot)) return [];
  const lists = [];

  for (const gameEntry of readdirSync(serversRoot, { withFileTypes: true })) {
    if (!gameEntry.isDirectory()) continue;
    const game = gameEntry.name;
    const gameRoot = join(serversRoot, game);
    for (const serverEntry of readdirSync(gameRoot, { withFileTypes: true })) {
      if (!serverEntry.isDirectory()) continue;
      const listPath = join(gameRoot, serverEntry.name, "s2script-plugins.txt");
      if (!existsSync(listPath)) continue;
      lists.push({
        game,
        server: serverEntry.name,
        path: listPath,
        relativePath: normalize(relative(rootDir, listPath)),
        plugins: readPluginList(listPath),
      });
    }
  }

  return lists.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

function validateServerPluginLists(errors, rootDir, plugins) {
  const byName = new Map(plugins.map((plugin) => [plugin.manifest.name, plugin]));
  for (const list of discoverServerPluginLists(rootDir)) {
    for (const pluginName of list.plugins) {
      const plugin = byName.get(pluginName);
      if (!plugin) {
        errors.push(`${list.relativePath}: unknown plugin ${pluginName}`);
        continue;
      }
      const metadata = plugin.manifest.edgegamers;
      if (metadata?.scope === "game" && metadata.game !== list.game) {
        errors.push(`${list.relativePath}: ${list.game} server must not include ${metadata.game} plugin ${pluginName}`);
      }
    }
  }
}

export function validateRepositoryPolicy(rootDir) {
  const errors = [];
  const plugins = discoverPluginManifests(rootDir);

  for (const plugin of plugins) validatePluginMetadata(errors, plugin);
  validatePluginDependencies(errors, plugins);
  validateServerPluginLists(errors, rootDir, plugins);

  return errors;
}
