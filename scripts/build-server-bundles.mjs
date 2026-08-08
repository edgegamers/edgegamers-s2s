import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { zipSync } from "fflate";
import { parseServerBundleList } from "./lib/server-bundle-list.mjs";
import { createServerBundlePlan } from "./lib/server-bundle-plan.mjs";

function normalize(path) {
  return path.replaceAll("\\", "/");
}

export function discoverWorkspacePlugins(root) {
  const pluginsRoot = join(root, "plugins");
  if (!existsSync(pluginsRoot)) return [];

  return readdirSync(pluginsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const directory = join("plugins", entry.name);
      const manifest = JSON.parse(readFileSync(join(root, directory, "package.json"), "utf8"));
      return { packageName: manifest.name, directory: normalize(directory) };
    })
    .sort((left, right) => left.packageName.localeCompare(right.packageName));
}

export function discoverArtifactFiles({ root, workspacePlugins }) {
  return workspacePlugins.map((plugin) => {
    const dist = join(root, plugin.directory, "dist");
    const artifactNames = existsSync(dist)
      ? readdirSync(dist, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith(".s2sp"))
        .map((entry) => entry.name)
        .sort((left, right) => left.localeCompare(right))
      : [];
    if (artifactNames.length !== 1) {
      throw new Error(`Missing built .s2sp artifact for ${plugin.packageName}`);
    }
    const absolutePath = join(dist, artifactNames[0]);
    return {
      packageName: plugin.packageName,
      path: normalize(relative(root, absolutePath)),
      bytes: readFileSync(absolutePath),
    };
  });
}

export function writeServerBundles({
  root = process.cwd(),
  environment,
  commit,
  generatedAt,
} = {}) {
  if (!environment || !/^(development|production)$/u.test(environment)) {
    throw new Error("environment must be development or production");
  }
  if (!commit) throw new Error("commit is required");

  const listRoot = join(root, "server-bundles");
  const workspacePlugins = discoverWorkspacePlugins(root);
  const artifactFiles = discoverArtifactFiles({ root, workspacePlugins });
  const outputRoot = join(root, "artifacts", "server-bundles");
  const bundles = [];

  rmSync(outputRoot, { recursive: true, force: true });

  for (const entry of readdirSync(listRoot, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".txt")) continue;

    const server = entry.name.replace(/\.txt$/u, "");
    const selectedPackages = parseServerBundleList(
      readFileSync(join(listRoot, entry.name), "utf8"),
    );
    const plan = createServerBundlePlan({
      server,
      environment,
      commit,
      generatedAt,
      selectedPackages,
      workspacePlugins,
      artifactFiles,
    });
    const artifactName = `${server}-${environment}`;
    const bundleDirectory = join(outputRoot, server, environment);
    const zipPath = join(bundleDirectory, `${artifactName}.zip`);
    const sha256Path = `${zipPath}.sha256`;
    const files = {
      "plugin-bundle.json": Buffer.from(`${JSON.stringify(plan.manifest, null, 2)}\n`),
    };

    for (const file of plan.files) {
      files[file.zipPath] = readFileSync(join(root, file.sourcePath));
    }

    mkdirSync(dirname(zipPath), { recursive: true });
    const zipBytes = zipSync(files);
    const sha256 = createHash("sha256").update(zipBytes).digest("hex");
    writeFileSync(zipPath, zipBytes);
    writeFileSync(sha256Path, `${sha256}  ${basename(zipPath)}\n`);
    bundles.push({
      server,
      environment,
      artifactName,
      zipPath: normalize(relative(root, zipPath)),
      sha256Path: normalize(relative(root, sha256Path)),
      sha256,
    });
  }

  bundles.sort((left, right) => left.server.localeCompare(right.server));
  writeFileSync(
    join(outputRoot, "bundles.json"),
    `${JSON.stringify({ schemaVersion: 1, bundles }, null, 2)}\n`,
  );
  return { bundles };
}

function argValue(name, args) {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

export function main({ root = process.cwd(), env = process.env, args = process.argv.slice(2), write = console.log } = {}) {
  const environment = argValue("--environment", args) ?? env.PLUGIN_BUNDLE_ENV ?? "development";
  const commit = env.GITHUB_SHA ?? env.CI_COMMIT_SHA ?? "local";
  const result = writeServerBundles({
    root,
    environment,
    commit,
    generatedAt: new Date().toISOString(),
  });
  for (const bundle of result.bundles) {
    write(`Wrote ${bundle.zipPath} (${bundle.sha256})`);
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
