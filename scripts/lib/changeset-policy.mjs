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
    const plugin = publishablePlugins
      .filter(({ directory }) => normalized === directory
        || normalized.startsWith(`${directory}/`))
      .sort((left, right) => right.directory.length - left.directory.length)[0];

    if (plugin && isReleaseAffectingPluginPath(normalized, plugin.directory)) {
      affected.add(plugin.name);
    }
  }

  const affectedPackages = [...affected].sort();

  return {
    affectedPackages,
    missingPackages: affectedPackages.filter(
      (name) => !coveredPackages.has(name),
    ),
  };
}

function isReleaseAffectingPluginPath(path, pluginDirectory) {
  const relativePath = path.slice(pluginDirectory.length + 1);
  if (/^readme(?:\..+)?$/iu.test(relativePath)) return false;
  if (/^(?:docs|test|tests)\//iu.test(relativePath)) return false;
  if (/^(?:\.github|\.gitlab|\.circleci)\//u.test(relativePath)) return false;
  if (/^\.gitlab-ci\.yml$/u.test(relativePath)) return false;
  return !/(?:^|\/)[^/]+\.(?:test|spec)\.[^/]+$/iu.test(relativePath);
}

export function findUnsupportedPublicRetirements({ basePlugins, headPlugins }) {
  const headByDirectory = new Map(headPlugins.map((plugin) => [
    plugin.directory,
    plugin,
  ]));

  return basePlugins
    .filter((plugin) => plugin.manifest.private === false)
    .flatMap((plugin) => {
      const headPlugin = headByDirectory.get(plugin.directory);
      if (!headPlugin) {
        return [{
          directory: plugin.directory,
          name: plugin.name,
          reason: "deleted",
        }];
      }
      if (headPlugin.manifest.private !== false) {
        return [{
          directory: plugin.directory,
          name: plugin.name,
          reason: "changed to private",
        }];
      }
      return [];
    })
    .sort((left, right) => left.directory.localeCompare(right.directory));
}

function isGeneratedVersionChange(change, pluginDirectories) {
  const path = change.path.replaceAll("\\", "/");
  if (change.status === "D"
    && /^\.changeset\/[^/]+\.md$/iu.test(path)
    && !/^\.changeset\/readme\.md$/iu.test(path)) {
    return true;
  }

  for (const directory of pluginDirectories) {
    if (change.status === "M" && path === `${directory}/package.json`) return true;
    if ((change.status === "A" || change.status === "M")
      && path === `${directory}/CHANGELOG.md`) return true;
  }
  return false;
}

export function isTrustedVersionPullRequest({
  eventName,
  baseRef,
  headRef,
  author,
  actor,
  headRepository,
  repository,
  changes = [],
  pluginDirectories = new Set(),
}) {
  return eventName === "pull_request"
    && baseRef === "dev"
    && headRef === "changeset-release/dev"
    && author === "github-actions[bot]"
    && actor === "github-actions[bot]"
    && headRepository === repository
    && typeof repository === "string"
    && repository.length > 0
    && changes.every((change) => isGeneratedVersionChange(
      change,
      pluginDirectories,
    ));
}
