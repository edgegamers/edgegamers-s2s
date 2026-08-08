const RELEASE_LINE = /^(["'])(.+)\1:\s+(patch|minor|major)$/u;

export function parsePluginMetadata(directory, content) {
  const source = `plugins/${directory}/package.json`;
  let packageJson;

  try {
    packageJson = JSON.parse(content);
  } catch (error) {
    throw new Error(`${source}: invalid JSON`, { cause: error });
  }

  if (typeof packageJson.name !== "string" || !packageJson.name) {
    throw new Error(`${source}: name must be a non-empty string`);
  }

  return {
    directory,
    name: packageJson.name,
    private: packageJson.private === true,
    publishToRegistry:
      packageJson.edgegamers?.release?.publishToRegistry === true,
  };
}

export function parseChangesetPackages(changesets) {
  const packages = new Set();

  for (const changeset of changesets) {
    const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u.exec(changeset.content);
    if (!match) {
      throw new Error(`${changeset.path}: missing Changeset frontmatter`);
    }

    for (const rawLine of match[1].split(/\r?\n/u)) {
      const line = rawLine.trim();
      if (!line) continue;

      const release = RELEASE_LINE.exec(line);
      if (!release) {
        throw new Error(
          `${changeset.path}: invalid release line ${JSON.stringify(line)}`,
        );
      }

      packages.add(release[2]);
    }
  }

  return packages;
}

export function evaluateChangesetCoverage({
  changedFiles,
  plugins,
  coveredPackages,
}) {
  const packageByDirectory = new Map(
    plugins.map((plugin) => [plugin.directory, plugin.name]),
  );
  const affected = new Set();

  for (const changedFile of changedFiles) {
    const normalized = changedFile.replaceAll("\\", "/");
    const match = /^plugins\/([^/]+)\//u.exec(normalized);
    const packageName = match ? packageByDirectory.get(match[1]) : undefined;

    if (packageName) affected.add(packageName);
  }

  const affectedPackages = [...affected].sort();

  return {
    affectedPackages,
    missingPackages: affectedPackages.filter(
      (name) => !coveredPackages.has(name),
    ),
  };
}
