import { createHash } from "node:crypto";

export function stablePluginFileName(packageName) {
  const segment = packageName.split("/").pop();
  if (!segment || segment.includes("\\") || segment.includes("/")) {
    throw new Error(`Invalid plugin package name: ${packageName}`);
  }
  return `${segment}.s2sp`;
}

export function pluginReleaseTag({ packageName, version }) {
  if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/u.test(version)) {
    throw new Error(`Invalid plugin version: ${version}`);
  }
  return `plugin/${stablePluginFileName(packageName).replace(/\.s2sp$/u, "")}/v${version}`;
}

export function createPluginReleasePlan({ generatedAt, plugins, artifacts }) {
  const artifactByPackage = new Map(
    artifacts.map((artifact) => [artifact.packageName, artifact]),
  );
  const seenAssets = new Set();

  const releases = plugins.map((plugin) => {
    const artifact = artifactByPackage.get(plugin.name);
    if (!artifact) throw new Error(`Missing .s2sp artifact for ${plugin.name}`);

    const assetName = stablePluginFileName(plugin.name);
    if (seenAssets.has(assetName)) {
      throw new Error(`Duplicate plugin asset name: ${assetName}`);
    }
    seenAssets.add(assetName);

    return {
      packageName: plugin.name,
      version: plugin.version,
      releaseTag: pluginReleaseTag({
        packageName: plugin.name,
        version: plugin.version,
      }),
      assetName,
      artifactPath: artifact.path.replaceAll("\\", "/"),
      sha256: createHash("sha256").update(artifact.bytes).digest("hex"),
      publishToRegistry: plugin.publishToRegistry === true,
    };
  });

  releases.sort((left, right) => left.packageName.localeCompare(right.packageName));

  return {
    schemaVersion: 1,
    generatedAt,
    releases,
  };
}
