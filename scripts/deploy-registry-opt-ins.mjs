import { execFileSync } from "node:child_process";
import {
  existsSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export function deployRegistryOptIns({
  root = process.cwd(),
  execFile = execFileSync,
  write = console.log,
} = {}) {
  const plan = JSON.parse(
    readFileSync(join(root, "artifacts", "plugin-release-plan.json"), "utf8"),
  );
  if (plan.schemaVersion !== 1) {
    throw new Error("Unsupported plugin release plan schema");
  }

  const optInPackageNames = plan.releases
    .filter((release) => release.publishToRegistry === true)
    .map((release) => release.packageName);

  if (optInPackageNames.length === 0) {
    write(
      "No plugin releases opted into Source2Script registry publishing; skipping deploy.",
    );
    return 0;
  }

  const pluginDirectoryByPackage = readPluginDirectoryByPackage(root);
  const selectedPluginDirectories = optInPackageNames.map((packageName) => {
    const directory = pluginDirectoryByPackage.get(packageName);
    if (!directory) {
      throw new Error(`Release plan references unknown plugin ${packageName}`);
    }
    return directory;
  });

  const packageJsonPath = join(root, "package.json");
  const originalPackageJson = readFileSync(packageJsonPath, "utf8");
  const nextPackageJson = JSON.parse(originalPackageJson);

  if (!nextPackageJson.s2script?.workspace) {
    throw new Error("Root package.json has no s2script.workspace config");
  }

  nextPackageJson.s2script.workspace.plugins = selectedPluginDirectories;

  try {
    writeFileSync(
      packageJsonPath,
      `${JSON.stringify(nextPackageJson, null, 2)}\n`,
    );
    execFile(
      process.execPath,
      [join(root, "node_modules", "@s2script", "sdk", "dist", "cli.js"), "deploy", "--ci"],
      { cwd: root, stdio: "inherit" },
    );
    return 0;
  } finally {
    writeFileSync(packageJsonPath, originalPackageJson);
  }
}

function readPluginDirectoryByPackage(root) {
  const pluginsRoot = join(root, "plugins");
  const result = new Map();

  for (const entry of readdirSync(pluginsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;

    const packageJsonPath = join(pluginsRoot, entry.name, "package.json");
    if (!existsSync(packageJsonPath)) continue;

    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
    if (typeof packageJson.name === "string" && packageJson.name) {
      result.set(packageJson.name, `plugins/${entry.name}`);
    }
  }

  return result;
}

export function main({
  root = process.cwd(),
  execFile = execFileSync,
  write = console.log,
  error = console.error,
} = {}) {
  try {
    return deployRegistryOptIns({ root, execFile, write });
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught);
    error(`Source2Script registry deploy failed: ${message}`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main();
}
