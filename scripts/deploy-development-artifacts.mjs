import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  quotePosix,
  validateRemotePluginDirectory,
} from "./lib/development-reconcile.mjs";

const MANIFEST_FILE = ".edgegamers-development-manifest.json";
const DEFAULT_TARGETS_FILE = "config/development-servers.json";

export function remoteManifestPath(remotePluginDirectory) {
  return `${validateRemotePluginDirectory(remotePluginDirectory)}/${MANIFEST_FILE}`;
}

export function buildDeployPlan({
  host,
  port,
  user,
  keyPath,
  localArtifactDirectory,
  remotePluginDirectory,
  runId,
}) {
  for (const [name, value] of Object.entries({
    host,
    port,
    user,
    keyPath,
    localArtifactDirectory,
    runId,
  })) {
    if (!value) throw new Error(`${name} is required`);
  }

  const safeRemotePluginDirectory = validateRemotePluginDirectory(
    remotePluginDirectory,
  );
  if (typeof runId !== "string" || !/^[A-Za-z0-9._-]+$/u.test(runId)) {
    throw new Error("Unsafe run ID");
  }
  const sshDestination = `${user}@${host}`;
  const sshBaseArgs = [
    "-i",
    keyPath,
    "-p",
    String(port),
    "-o",
    "StrictHostKeyChecking=accept-new",
  ];
  const remoteStagingDirectory = `/tmp/edgegamers-s2s-development/${runId}`;

  return {
    sshDestination,
    remoteStagingDirectory,
    remotePluginDirectory: safeRemotePluginDirectory,
    sshBaseArgs,
    rsyncArgs: [
      "-az",
      "--delete",
      "-e",
      `ssh -i ${keyPath} -p ${port} -o StrictHostKeyChecking=accept-new`,
      `${localArtifactDirectory.replaceAll("\\", "/")}/`,
      `${sshDestination}:${remoteStagingDirectory}/`,
    ],
  };
}

function normalizeStringArray(value, fieldName) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error(`${fieldName} must be an array`);

  return value.map((entry) => {
    if (typeof entry !== "string" || !entry.trim()) {
      throw new Error(`${fieldName} entries must be non-empty strings`);
    }
    return entry.trim();
  });
}

function safeTargetName(name) {
  if (typeof name !== "string" || !/^[A-Za-z0-9._-]+$/u.test(name)) {
    throw new Error(`Unsafe development target name: ${name}`);
  }
  return name;
}

function uniqueSorted(values) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function readPluginPackageByDirectory(root) {
  const pluginsRoot = join(root, "plugins");
  const result = new Map();

  if (!existsSync(pluginsRoot)) return result;

  for (const entry of readdirSync(pluginsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;

    const packageJsonPath = join(pluginsRoot, entry.name, "package.json");
    if (!existsSync(packageJsonPath)) continue;

    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
    if (typeof packageJson.name === "string" && packageJson.name) {
      result.set(entry.name, packageJson.name);
    }
  }

  return result;
}

function pluginPackageFromArtifact({ artifact, pluginPackageByDirectory }) {
  const match = /^plugins\/([^/]+)\/dist\/[^/]+[.]s2sp$/u.exec(
    artifact.replaceAll("\\", "/"),
  );
  if (!match) return undefined;
  return pluginPackageByDirectory.get(match[1]);
}

export function readDevelopmentTargets({
  root = process.cwd(),
  env = process.env,
  inventoryFile = env.DEV_SERVER_INVENTORY_FILE ?? DEFAULT_TARGETS_FILE,
} = {}) {
  const inventoryPath = join(root, inventoryFile);

  if (!existsSync(inventoryPath)) {
    if (!env.DEV_S2SCRIPT_PLUGIN_DIR) {
      throw new Error(
        `Missing ${inventoryFile} and DEV_S2SCRIPT_PLUGIN_DIR fallback`,
      );
    }

    return [
      {
        name: "default",
        pluginDir: validateRemotePluginDirectory(env.DEV_S2SCRIPT_PLUGIN_DIR),
        plugins: ["*"],
        disabledPlugins: [],
      },
    ];
  }

  const inventory = JSON.parse(readFileSync(inventoryPath, "utf8"));
  if (!inventory || !Array.isArray(inventory.servers)) {
    throw new Error("Development server inventory must contain a servers array");
  }

  const rawTargets = new Map();
  for (const server of inventory.servers) {
    const name = safeTargetName(server.name);
    if (rawTargets.has(name)) throw new Error(`Duplicate development target: ${name}`);
    rawTargets.set(name, {
      name,
      pluginDir: validateRemotePluginDirectory(server.pluginDir),
      inherits: normalizeStringArray(
        server.inherits === undefined
          ? []
          : Array.isArray(server.inherits)
            ? server.inherits
            : [server.inherits],
        `${name}.inherits`,
      ),
      plugins: normalizeStringArray(server.plugins, `${name}.plugins`),
      disabledPlugins: normalizeStringArray(
        server.disabledPlugins,
        `${name}.disabledPlugins`,
      ),
    });
  }

  const resolved = new Map();
  function resolveTarget(name, stack = []) {
    if (resolved.has(name)) return resolved.get(name);
    const target = rawTargets.get(name);
    if (!target) throw new Error(`Unknown development target: ${name}`);
    if (stack.includes(name)) {
      throw new Error(
        `Development target inheritance cycle: ${[...stack, name].join(" -> ")}`,
      );
    }

    const inherited = target.inherits.map((parent) =>
      resolveTarget(parent, [...stack, name]),
    );
    const next = {
      name: target.name,
      pluginDir: target.pluginDir,
      plugins: uniqueSorted([
        ...inherited.flatMap((parent) => parent.plugins),
        ...target.plugins,
      ]),
      disabledPlugins: uniqueSorted([
        ...inherited.flatMap((parent) => parent.disabledPlugins),
        ...target.disabledPlugins,
      ]),
    };
    resolved.set(name, next);
    return next;
  }

  return [...rawTargets.keys()].map((name) => resolveTarget(name));
}

export function findChangedPluginPackages({
  root = process.cwd(),
  base,
  head = "HEAD",
  execFile = execFileSync,
  pluginPackageByDirectory = readPluginPackageByDirectory(root),
} = {}) {
  if (!base || /^0+$/u.test(base)) return undefined;

  const output = execFile("git", ["diff", "--name-only", base, head], {
    cwd: root,
    encoding: "utf8",
  });
  const changed = new Set();
  let unknownServerImpact = false;

  for (const path of output.split(/\r?\n/u).filter(Boolean)) {
    const normalized = path.replaceAll("\\", "/");
    const pluginMatch = /^plugins\/([^/]+)\//u.exec(normalized);
    if (pluginMatch) {
      const packageName = pluginPackageByDirectory.get(pluginMatch[1]);
      if (packageName) changed.add(packageName);
      else unknownServerImpact = true;
      continue;
    }

    if (
      normalized.startsWith("packages/") ||
      normalized === "package.json" ||
      normalized === "package-lock.json" ||
      normalized.startsWith("s2script")
    ) {
      unknownServerImpact = true;
    }
  }

  return unknownServerImpact ? undefined : changed;
}

export function selectAffectedTargets({ targets, changedPluginPackages }) {
  if (changedPluginPackages === undefined) {
    return targets.filter(
      (target) => target.plugins.length > 0 || target.disabledPlugins.length > 0,
    );
  }
  if (changedPluginPackages.size === 0) return [];

  return targets.filter((target) => {
    if (target.plugins.includes("*")) return true;
    return [...target.plugins, ...target.disabledPlugins].some((plugin) =>
      changedPluginPackages.has(plugin),
    );
  });
}

export function writeTargetArtifacts({
  root = process.cwd(),
  sourceArtifactDirectory,
  target,
  pluginPackageByDirectory = readPluginPackageByDirectory(root),
}) {
  const sourceManifest = JSON.parse(
    readFileSync(join(sourceArtifactDirectory, "development-manifest.json"), "utf8"),
  );
  const targetPackageNames = new Set([
    ...target.plugins,
    ...target.disabledPlugins,
  ]);
  const disabledPackageNames = new Set(target.disabledPlugins);
  const targetDirectory = join(
    root,
    "artifacts",
    "local-development-targets",
    target.name,
  );

  const plugins = sourceManifest.plugins
    .map((plugin) => {
      const packageName =
        plugin.packageName ??
        pluginPackageFromArtifact({
          artifact: plugin.artifact,
          pluginPackageByDirectory,
        });
      if (!packageName) {
        throw new Error(`Cannot resolve package for ${plugin.artifact}`);
      }
      return { ...plugin, packageName };
    })
    .filter(
      (plugin) =>
        targetPackageNames.has("*") || targetPackageNames.has(plugin.packageName),
    )
    .map((plugin) => {
      const disabled = disabledPackageNames.has(plugin.packageName);
      return {
        ...plugin,
        enabled: !disabled,
        installPath: disabled ? "disabled" : "enabled",
      };
    });

  if (plugins.length === 0) {
    throw new Error(`Development target ${target.name} has no matching plugins`);
  }

  rmSync(targetDirectory, { recursive: true, force: true });
  mkdirSync(targetDirectory, { recursive: true });

  for (const plugin of plugins) {
    cpSync(join(sourceArtifactDirectory, plugin.fileName), join(targetDirectory, plugin.fileName), {
      force: true,
    });
  }

  writeFileSync(
    join(targetDirectory, "development-manifest.json"),
    `${JSON.stringify({ ...sourceManifest, target: target.name, plugins }, null, 2)}\n`,
  );

  return targetDirectory;
}

export function buildRemoteScript({
  remoteStagingDirectory,
  remotePluginDirectory,
}) {
  const staging = quotePosix(remoteStagingDirectory);
  const pluginDir = quotePosix(remotePluginDirectory);
  const manifest = quotePosix(remoteManifestPath(remotePluginDirectory));

  return `set -euo pipefail
staging=${staging}
plugin_dir=${pluginDir}
manifest_path=${manifest}
test -d "$staging"
test -f "$staging/development-manifest.json"
mkdir -p "$plugin_dir"
mkdir -p "$plugin_dir/disabled"
cd "$staging"
previous="$(mktemp)"
if [ -f "$manifest_path" ]; then cp "$manifest_path" "$previous"; else printf '{"schemaVersion":1,"managedBy":"edgegamers-s2s","plugins":[]}' > "$previous"; fi
node - "$previous" "$staging/development-manifest.json" "$staging" "$plugin_dir" <<'NODE'
const { createHash } = require("node:crypto");
const { cpSync, readFileSync, rmSync } = require("node:fs");
const { join } = require("node:path");
const [previousPath, nextPath, staging, pluginDir] = process.argv.slice(2);
const previous = JSON.parse(readFileSync(previousPath, "utf8"));
const next = JSON.parse(readFileSync(nextPath, "utf8"));
function managedRelativePath(plugin) {
  const installPath = plugin.installPath ?? (plugin.enabled === false ? "disabled" : "enabled");
  if (installPath === "enabled") return plugin.fileName;
  if (installPath === "disabled") return "disabled/" + plugin.fileName;
  throw new Error("unsupported plugin install path");
}
function listManagedPlugins(manifest) {
  if (manifest.schemaVersion !== 1 || manifest.managedBy !== "edgegamers-s2s" || !Array.isArray(manifest.plugins)) {
    throw new Error("unsupported manifest");
  }
  return manifest.plugins.map((plugin) => {
    if (!plugin || typeof plugin.fileName !== "string" || !plugin.fileName.endsWith(".s2sp") || plugin.fileName.includes("/") || plugin.fileName.includes("\\\\")) {
      throw new Error("unsafe plugin file name");
    }
    return plugin;
  });
}
const previousPlugins = listManagedPlugins(previous);
const nextPlugins = listManagedPlugins(next);
const nextPaths = new Set(nextPlugins.map(managedRelativePath));
for (const plugin of next.plugins) {
  const digest = createHash("sha256").update(readFileSync(join(staging, plugin.fileName))).digest("hex");
  if (digest !== plugin.sha256) throw new Error("digest mismatch for " + plugin.fileName);
}
for (const plugin of previousPlugins) {
  const relativePath = managedRelativePath(plugin);
  if (!nextPaths.has(relativePath)) rmSync(join(pluginDir, relativePath), { force: true });
}
for (const plugin of nextPlugins) {
  cpSync(join(staging, plugin.fileName), join(pluginDir, managedRelativePath(plugin)), { force: true });
}
NODE
cp -f "$staging/development-manifest.json" "$manifest_path"
rm -f "$previous"
`;
}

export function main({
  env = process.env,
  execFile = execFileSync,
  artifactDirectory = join(process.cwd(), "artifacts", "local-development"),
  root = process.cwd(),
} = {}) {
  const manifestPath = join(artifactDirectory, "development-manifest.json");
  if (!existsSync(manifestPath)) {
    throw new Error(
      `Missing ${manifestPath}. Run npm run artifacts:local first.`,
    );
  }

  const keyPath = env.DEV_SSH_KEY_PATH;
  const targets = readDevelopmentTargets({ root, env });
  const pluginPackageByDirectory = readPluginPackageByDirectory(root);
  const changedPluginPackages = findChangedPluginPackages({
    root,
    base: env.DEV_BASE_SHA,
    head: env.DEV_HEAD_SHA || "HEAD",
    execFile,
    pluginPackageByDirectory,
  });
  const affectedTargets = selectAffectedTargets({ targets, changedPluginPackages });

  if (affectedTargets.length === 0) {
    console.log("No development server targets affected by this change.");
    return;
  }

  for (const target of affectedTargets) {
    const targetArtifactDirectory = writeTargetArtifacts({
      root,
      sourceArtifactDirectory: artifactDirectory,
      target,
      pluginPackageByDirectory,
    });
    const plan = buildDeployPlan({
      host: env.DEV_SSH_HOST,
      port: env.DEV_SSH_PORT || "22",
      user: env.DEV_SSH_USER,
      keyPath,
      localArtifactDirectory: targetArtifactDirectory,
      remotePluginDirectory: target.pluginDir,
      runId: `${env.GITHUB_RUN_ID || String(Date.now())}-${target.name}`,
    });

    console.log(`Deploying development plugins to ${target.name}.`);
    execFile(
      "ssh",
      [
        ...plan.sshBaseArgs,
        plan.sshDestination,
        "mkdir",
        "-p",
        plan.remoteStagingDirectory,
      ],
      { stdio: "inherit" },
    );
    execFile("rsync", plan.rsyncArgs, { stdio: "inherit" });
    execFile(
      "ssh",
      [...plan.sshBaseArgs, plan.sshDestination, buildRemoteScript(plan)],
      { stdio: "inherit" },
    );
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
