const RELEASE_LINE = /^(["'])(.+)\1:\s+(patch|minor|major)$/u;

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
  const publishablePlugins = plugins.filter(
    (plugin) => plugin.manifest.private === false,
  );
  const affected = new Set();

  for (const changedFile of changedFiles) {
    const normalized = changedFile.replaceAll("\\", "/");
    const packageName = publishablePlugins
      .filter(({ directory }) => normalized === directory
        || normalized.startsWith(`${directory}/`))
      .sort((left, right) => right.directory.length - left.directory.length)[0]?.name;

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

export function isTrustedVersionPullRequest({
  eventName,
  baseRef,
  headRef,
  author,
}) {
  return eventName === "pull_request"
    && baseRef === "dev"
    && headRef === "changeset-release/dev"
    && author === "github-actions[bot]";
}
