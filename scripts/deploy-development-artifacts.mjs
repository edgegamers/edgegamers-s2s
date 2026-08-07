import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  quotePosix,
  validateRemotePluginDirectory,
} from "./lib/development-reconcile.mjs";
import {
  readServerDefinition,
  resolveServerPlugins,
} from "./lib/server-plugin-resolver.mjs";

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
  const portArgs = port ? ["-p", String(port)] : [];
  const rsyncPortArgs = port ? ` -p ${port}` : "";
  const sshBaseArgs = [
    "-i",
    keyPath,
    ...portArgs,
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
      `ssh -i ${keyPath}${rsyncPortArgs} -o StrictHostKeyChecking=accept-new`,
      `${localArtifactDirectory.replaceAll("\\", "/")}/`,
      `${sshDestination}:${remoteStagingDirectory}/`,
    ],
  };
}

export function buildRemoteScript({
  remoteStagingDirectory,
  remotePluginDirectory,
  selectedFileNames = [],
}) {
  const staging = quotePosix(remoteStagingDirectory);
  const pluginDir = quotePosix(remotePluginDirectory);
  const manifest = quotePosix(remoteManifestPath(remotePluginDirectory));
  const selectedFileNamesJson = JSON.stringify(selectedFileNames);

  return `set -euo pipefail
staging=${staging}
plugin_dir=${pluginDir}
manifest_path=${manifest}
test -d "$staging"
test -f "$staging/development-manifest.json"
mkdir -p "$plugin_dir"
cd "$staging"
previous="$(mktemp)"
if [ -f "$manifest_path" ]; then cp "$manifest_path" "$previous"; else printf '{"schemaVersion":1,"managedBy":"edgegamers-s2s","plugins":[]}' > "$previous"; fi
node - "$previous" "$staging/development-manifest.json" "$staging" "$plugin_dir" "$manifest_path" <<'NODE'
const { createHash } = require("node:crypto");
const { cpSync, readFileSync, rmSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");
const [previousPath, nextPath, staging, pluginDir, manifestPath] = process.argv.slice(2);
const previous = JSON.parse(readFileSync(previousPath, "utf8"));
const next = JSON.parse(readFileSync(nextPath, "utf8"));
const selectedFileNames = new Set(${selectedFileNamesJson});
function listManagedFileNames(manifest) {
  if (manifest.schemaVersion !== 1 || manifest.managedBy !== "edgegamers-s2s" || !Array.isArray(manifest.plugins)) {
    throw new Error("unsupported manifest");
  }
  const fileNames = manifest.plugins.map((plugin) => {
    if (!plugin || typeof plugin.fileName !== "string" || !plugin.fileName.endsWith(".s2sp") || plugin.fileName.includes("/") || plugin.fileName.includes("\\\\")) {
      throw new Error("unsafe plugin file name");
    }
    return plugin.fileName;
  });
  return [...new Set(fileNames)].sort();
}
const selectedPlugins = next.plugins.filter((plugin) => selectedFileNames.size === 0 || selectedFileNames.has(plugin.fileName));
const filteredManifest = { ...next, plugins: selectedPlugins };
const previousFileNames = listManagedFileNames(previous);
const nextFileNames = listManagedFileNames(filteredManifest);
const nextNames = new Set(nextFileNames);
for (const plugin of selectedPlugins) {
  const digest = createHash("sha256").update(readFileSync(join(staging, plugin.fileName))).digest("hex");
  if (digest !== plugin.sha256) throw new Error("digest mismatch for " + plugin.fileName);
}
for (const fileName of previousFileNames) {
  if (!nextNames.has(fileName)) rmSync(join(pluginDir, fileName), { force: true });
}
for (const fileName of nextFileNames) {
  cpSync(join(staging, fileName), join(pluginDir, fileName), { force: true });
}
writeFileSync(manifestPath, \`\${JSON.stringify(filteredManifest, null, 2)}\\n\`);
NODE
rm -f "$previous"
`;
}

function parseDeploymentTargetConfig(value) {
  if (!value) return undefined;
  const parsed = JSON.parse(value);
  if (!Array.isArray(parsed)) {
    throw new Error("DEV_SERVER_TARGETS must be a JSON array");
  }
  return parsed;
}

function readDeploymentServer({ root, game, serverName, targetLabel }) {
  if (!game || !serverName) {
    throw new Error(`${targetLabel} requires game and server`);
  }
  return readServerDefinition({
    rootDir: root,
    game,
    serverName,
  });
}

function remotePluginDirectoryForServer({ server, targetLabel }) {
  const remotePluginDirectory = server.developmentPluginDirectory;
  if (!remotePluginDirectory) {
    throw new Error(
      `${targetLabel} (${server.game}/${server.name}) requires development.pluginDirectory in server.json`,
    );
  }
  return remotePluginDirectory;
}

function selectedFileNamesForServer({ server, manifest }) {
  return resolveServerPlugins({
    server,
    manifest,
  }).fileNames;
}

export function resolveDeploymentTargets({ root, manifest, env }) {
  const shared = {
    host: env.DEV_SSH_HOST,
    user: env.DEV_SSH_USER,
  };
  const configuredTargets = parseDeploymentTargetConfig(env.DEV_SERVER_TARGETS);

  if (configuredTargets) {
    if (configuredTargets.length === 0) {
      throw new Error("DEV_SERVER_TARGETS must contain at least one target");
    }
    return configuredTargets.map((target, index) => {
      const game = target.game;
      const serverName = target.serverName ?? target.server;
      const targetLabel = `DEV_SERVER_TARGETS[${index}]`;
      const server = readDeploymentServer({ root, game, serverName, targetLabel });
      const remotePluginDirectory = remotePluginDirectoryForServer({
        server,
        targetLabel,
      });
      return {
        game,
        serverName,
        host: target.host ?? shared.host,
        ...(target.port ? { port: String(target.port) } : {}),
        user: target.user ?? shared.user,
        remotePluginDirectory,
        selectedFileNames: selectedFileNamesForServer({
          server,
          manifest,
        }),
      };
    });
  }

  const singleServer = readDeploymentServer({
    root,
    game: env.DEV_SERVER_GAME,
    serverName: env.DEV_SERVER_NAME,
    targetLabel: "development deploy target",
  });

  return [{
    game: env.DEV_SERVER_GAME,
    serverName: env.DEV_SERVER_NAME,
    host: shared.host,
    user: shared.user,
    remotePluginDirectory: remotePluginDirectoryForServer({
      server: singleServer,
      targetLabel: "development deploy target",
    }),
    selectedFileNames: selectedFileNamesForServer({
      server: singleServer,
      manifest,
    }),
  }];
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
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const targets = resolveDeploymentTargets({
    root: process.cwd(),
    manifest,
    env,
  });

  for (const [index, target] of targets.entries()) {
    const plan = buildDeployPlan({
      host: target.host,
      port: target.port,
      user: target.user,
      keyPath,
      localArtifactDirectory: artifactDirectory,
      remotePluginDirectory: target.remotePluginDirectory,
      runId: `${env.GITHUB_RUN_ID || Date.now()}-${index + 1}`,
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
      [
        ...plan.sshBaseArgs,
        plan.sshDestination,
        buildRemoteScript({
          ...plan,
          selectedFileNames: target.selectedFileNames,
        }),
      ],
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
