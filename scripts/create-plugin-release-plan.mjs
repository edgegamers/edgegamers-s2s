import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import {
  parseChangesetPackages,
  parsePluginMetadata,
} from "./lib/changeset-policy.mjs";
import { createPluginReleasePlan } from "./lib/plugin-release-plan.mjs";
import { readPluginPackages } from "./lib/plugin-workspace.mjs";

export function writePluginReleasePlan({
  root = process.cwd(),
  generatedAt = new Date().toISOString(),
} = {}) {
  const pendingPackages = readPendingChangesetPackages(root);
  const plugins = readPluginPackages(root)
    .map((pluginPackage) => {
      const packageContent = readFileSync(pluginPackage.packagePath, "utf8");
      const metadata = parsePluginMetadata(
        pluginPackage.directory,
        packageContent,
        pluginPackage.relativePackagePath,
      );
      const packageJson = JSON.parse(packageContent);

      return {
        ...metadata,
        packageDirectory: dirname(pluginPackage.packagePath),
        version: packageJson.version,
      };
    })
    .filter((plugin) => pendingPackages.has(plugin.name));
  const artifacts = plugins.map((plugin) => {
    const directory = join(plugin.packageDirectory, "dist");
    const artifactNames = readdirSync(directory).filter((name) =>
      name.endsWith(".s2sp"),
    );

    if (artifactNames.length !== 1) {
      throw new Error(`Expected one .s2sp artifact for ${plugin.name}`);
    }

    const artifactPath = join(directory, artifactNames[0]);
    return {
      packageName: plugin.name,
      path: relative(root, artifactPath),
      bytes: readFileSync(artifactPath),
    };
  });
  const plan = createPluginReleasePlan({ generatedAt, plugins, artifacts });
  const outputDirectory = join(root, "artifacts");
  const outputPath = join(outputDirectory, "plugin-release-plan.json");
  const temporaryPath = `${outputPath}.tmp`;

  mkdirSync(outputDirectory, { recursive: true });

  try {
    writeFileSync(temporaryPath, `${JSON.stringify(plan, null, 2)}\n`);
    renameSync(temporaryPath, outputPath);
  } finally {
    if (existsSync(temporaryPath)) unlinkSync(temporaryPath);
  }

  return { plan, outputPath };
}

export function readPendingChangesetPackages(root) {
  const changesetDirectory = join(root, ".changeset");
  if (!existsSync(changesetDirectory)) return new Set();

  const changesets = readdirSync(changesetDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .filter((entry) => entry.name.endsWith(".md") && entry.name !== "README.md")
    .map((entry) => ({
      path: `.changeset/${entry.name}`,
      content: readFileSync(join(changesetDirectory, entry.name), "utf8"),
    }));

  if (changesets.length === 0) return new Set();
  return parseChangesetPackages(changesets);
}

export function main({ root = process.cwd(), write = console.log, error = console.error } = {}) {
  try {
    const result = writePluginReleasePlan({ root });
    write(
      `Wrote ${relative(root, result.outputPath).replaceAll("\\", "/")} with ${result.plan.releases.length} plugin releases.`,
    );
    return 0;
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught);
    error(`Plugin release plan failed: ${message}`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main();
}
