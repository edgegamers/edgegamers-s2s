import { createHash } from "node:crypto";

export function stablePluginFileName(packageName) {
  const segment = packageName.split("/").pop();
  if (!segment || segment.includes("/") || segment.includes("\\")) {
    throw new Error(`Invalid plugin package name: ${packageName}`);
  }
  return `${segment}.s2sp`;
}

export function createServerBundlePlan({
  server,
  environment,
  commit,
  generatedAt,
  selectedPackages,
  workspacePlugins,
  artifactFiles,
}) {
  const workspaceByPackage = new Map(
    workspacePlugins.map((plugin) => [plugin.packageName, plugin]),
  );
  const artifactByPackage = new Map(
    artifactFiles.map((artifact) => [artifact.packageName, artifact]),
  );
  const seenFileNames = new Set();

  const plugins = selectedPackages.map((packageName) => {
    if (!workspaceByPackage.has(packageName)) {
      throw new Error(`server-bundles/${server}.txt references unknown workspace package ${packageName}`);
    }

    const artifact = artifactByPackage.get(packageName);
    if (!artifact) {
      throw new Error(`Missing built .s2sp artifact for ${packageName}`);
    }

    const fileName = stablePluginFileName(packageName);
    if (seenFileNames.has(fileName)) {
      throw new Error(`Duplicate bundle plugin file name: ${fileName}`);
    }
    seenFileNames.add(fileName);

    return {
      packageName,
      fileName,
      sha256: createHash("sha256").update(artifact.bytes).digest("hex"),
    };
  });

  plugins.sort((left, right) => left.packageName.localeCompare(right.packageName));

  return {
    manifest: {
      schemaVersion: 1,
      managedBy: "edgegamers-s2s",
      server,
      environment,
      commit,
      generatedAt,
      plugins,
    },
    files: plugins.map((plugin) => ({
      sourcePath: artifactByPackage.get(plugin.packageName).path.replaceAll("\\", "/"),
      zipPath: `plugins/${plugin.fileName}`,
    })),
  };
}
