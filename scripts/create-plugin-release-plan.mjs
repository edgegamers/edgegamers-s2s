import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { parsePluginMetadata } from "./lib/changeset-policy.mjs";
import { createPluginReleasePlan } from "./lib/plugin-release-plan.mjs";

export function writePluginReleasePlan({
  root = process.cwd(),
  generatedAt = new Date().toISOString(),
} = {}) {
  const pluginsDirectory = join(root, "plugins");
  const plugins = readdirSync(pluginsDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const packagePath = join(pluginsDirectory, entry.name, "package.json");
      const packageContent = readFileSync(packagePath, "utf8");
      const metadata = parsePluginMetadata(entry.name, packageContent);
      const packageJson = JSON.parse(packageContent);

      return { ...metadata, version: packageJson.version };
    });
  const artifacts = plugins.map((plugin) => {
    const directory = join(pluginsDirectory, plugin.directory, "dist");
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
