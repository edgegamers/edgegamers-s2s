import { readFileSync } from "node:fs";
import { join, relative } from "node:path";

function normalize(path) {
  return path.replaceAll("\\", "/");
}

export function readPluginList(path) {
  return readFileSync(path, "utf8")
    .split(/\r?\n/u)
    .map((line) => line.replace(/#.*/u, "").trim())
    .filter(Boolean);
}

export function readServerDefinition({ rootDir, game, serverName }) {
  return readServerDefinitionInternal({
    rootDir,
    game,
    serverName,
    stack: [],
  });
}

function readServerDefinitionInternal({ rootDir, game, serverName, stack }) {
  if (stack.includes(serverName)) {
    throw new Error(`servers/games/${game}/${serverName}/server.json: server inheritance cycle: ${[...stack, serverName].join(" -> ")}`);
  }

  const directory = join(rootDir, "servers", "games", game, serverName);
  const serverPath = join(directory, "server.json");
  const listPath = join(directory, "s2script-plugins.txt");
  const server = JSON.parse(readFileSync(serverPath, "utf8"));

  if (server.name !== serverName) {
    throw new Error(`${normalize(relative(rootDir, serverPath))}: server name must be ${JSON.stringify(serverName)}`);
  }
  if (server.game !== game) {
    throw new Error(`${normalize(relative(rootDir, serverPath))}: server game must be ${JSON.stringify(game)}`);
  }
  const inheritedServers = Array.isArray(server.inherits) ? server.inherits : [];
  const inheritedPluginNames = inheritedServers.flatMap((inheritedServer) => {
    if (typeof inheritedServer !== "string" || !inheritedServer) {
      throw new Error(`${normalize(relative(rootDir, serverPath))}: inherits entries must be non-empty server names`);
    }
    return readServerDefinitionInternal({
      rootDir,
      game,
      serverName: inheritedServer,
      stack: [...stack, serverName],
    }).pluginNames;
  });
  const pluginNames = [...new Set([
    ...inheritedPluginNames,
    ...readPluginList(listPath),
  ])];

  return {
    name: server.name,
    game: server.game,
    directory,
    listPath,
    relativeListPath: normalize(relative(rootDir, listPath)),
    inheritedServers,
    pluginNames,
  };
}

export function resolveServerPlugins({ server, manifest }) {
  if (manifest.schemaVersion !== 1 || manifest.managedBy !== "edgegamers-s2s") {
    throw new Error("Unsupported EdgeGamers plugin manifest");
  }
  if (!Array.isArray(manifest.plugins)) {
    throw new Error("EdgeGamers plugin manifest plugins must be an array");
  }

  const byName = new Map(manifest.plugins.map((plugin) => [plugin.name, plugin]));
  const plugins = server.pluginNames.map((pluginName) => {
    const plugin = byName.get(pluginName);
    if (!plugin) {
      throw new Error(`${server.relativeListPath}: channel ${manifest.channel} does not contain ${pluginName}`);
    }
    if (plugin.scope === "game" && plugin.game !== server.game) {
      throw new Error(`${server.relativeListPath}: ${server.game} server must not include ${plugin.game} plugin ${pluginName}`);
    }
    return plugin;
  });

  return {
    server: server.name,
    game: server.game,
    channel: manifest.channel,
    plugins,
    fileNames: plugins.map((plugin) => plugin.fileName).sort(),
  };
}
