import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  quotePosix,
  validateRemotePluginDirectory,
} from "./lib/development-reconcile.mjs";

const MANIFEST_FILE = ".edgegamers-development-manifest.json";

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
} = {}) {
  const manifestPath = join(artifactDirectory, "development-manifest.json");
  if (!existsSync(manifestPath)) {
    throw new Error(
      `Missing ${manifestPath}. Run npm run artifacts:local first.`,
    );
  }

  const keyPath = env.DEV_SSH_KEY_PATH;
  const plan = buildDeployPlan({
    host: env.DEV_SSH_HOST,
    port: env.DEV_SSH_PORT || "22",
    user: env.DEV_SSH_USER,
    keyPath,
    localArtifactDirectory: artifactDirectory,
    remotePluginDirectory: env.DEV_S2SCRIPT_PLUGIN_DIR,
    runId: env.GITHUB_RUN_ID || String(Date.now()),
  });

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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
