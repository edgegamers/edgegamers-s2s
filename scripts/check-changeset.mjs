import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  evaluateChangesetCoverage,
  findUnsupportedPublicRetirements,
  isTrustedVersionPullRequest,
  parseChangesetPackages,
} from "./lib/changeset-policy.mjs";
import { requireValidWorkspaceLayout } from "./lib/workspace-layout.mjs";

function defaultGit(root, args) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
  }).trim();
}

function readPlugins(root) {
  return requireValidWorkspaceLayout(root).packages
    .filter(({ kind }) => kind === "plugin");
}

function parseChangedFiles(output) {
  if (!output) return [];
  return output.split(/\r?\n/u).filter(Boolean).flatMap((line) => {
    const [status, ...paths] = line.split("\t");
    return paths.map((path) => ({ status, path }));
  });
}

function readPullRequestChangesets(root, changes) {
  return changes
    .filter(({ status, path }) => (status === "A" || status === "M")
      && /^\.changeset\/[^/]+\.md$/iu.test(path)
      && !/^\.changeset\/readme\.md$/iu.test(path))
    .sort((left, right) => left.path.localeCompare(right.path))
    .map(({ path }) => {
      const absolutePath = join(root, ...path.split("/"));
      if (!existsSync(absolutePath)) {
        throw new Error(`${path}: changed Changeset is missing from HEAD`);
      }
      return { path, content: readFileSync(absolutePath, "utf8") };
    });
}

function readPluginsAtRevision(git, revision) {
  const manifestOutput = git([
    "ls-tree",
    "-r",
    "--name-only",
    revision,
    "--",
    "plugins",
  ]);
  const manifestPaths = manifestOutput
    ? manifestOutput.split(/\r?\n/u).filter((path) => path.endsWith("/package.json"))
    : [];

  return manifestPaths.map((manifestPath) => {
    let manifest;
    try {
      manifest = JSON.parse(git(["show", `${revision}:${manifestPath}`]));
    } catch (error) {
      throw new Error(`Unable to read ${manifestPath} at ${revision}: ${error.message}`, {
        cause: error,
      });
    }
    return {
      directory: manifestPath.slice(0, -"/package.json".length),
      name: manifest.name,
      manifest,
    };
  });
}

export function main({
  root = process.cwd(),
  baseRef = process.env.CHANGESET_BASE_REF ?? "origin/dev",
  releaseContext = {
    eventName: process.env.GITHUB_EVENT_NAME,
    baseRef: process.env.GITHUB_BASE_REF,
    headRef: process.env.GITHUB_HEAD_REF,
    author: process.env.CHANGESET_PR_AUTHOR,
    actor: process.env.GITHUB_ACTOR,
    headRepository: process.env.CHANGESET_HEAD_REPOSITORY,
    repository: process.env.GITHUB_REPOSITORY,
  },
  git = (args) => defaultGit(root, args),
  write = console.log,
  warn = console.warn,
  error = console.error,
} = {}) {
  try {
    const mergeBase = git(["merge-base", "HEAD", baseRef]);
    const changedOutput = git([
      "diff",
      "--name-status",
      "--find-renames",
      `${mergeBase}...HEAD`,
    ]);
    const changes = parseChangedFiles(changedOutput);
    const changedFiles = changes.map(({ path }) => path);
    const plugins = readPlugins(root);
    const basePlugins = readPluginsAtRevision(git, mergeBase);
    const retirements = findUnsupportedPublicRetirements({
      basePlugins,
      headPlugins: plugins,
    });
    if (retirements.length > 0) {
      error("Direct deletion or de-publication of public plugins is not supported:");
      for (const retirement of retirements) {
        error(`- ${retirement.name} (${retirement.directory}): ${retirement.reason}`);
      }
      error(
        "Publish a deprecation release, then request a platform-reviewed registry yank before deleting or privatizing the plugin.",
      );
      return 1;
    }

    const pluginDirectories = new Set([
      ...basePlugins.map(({ directory }) => directory),
      ...plugins.map(({ directory }) => directory),
    ]);
    const trustedVersionPullRequest = isTrustedVersionPullRequest({
      ...releaseContext,
      changes,
      pluginDirectories,
    });
    const trustedProductionPromotion = releaseContext.eventName === "pull_request"
      && releaseContext.baseRef === "main"
      && releaseContext.headRef === "dev"
      && releaseContext.headRepository === releaseContext.repository
      && typeof releaseContext.repository === "string"
      && releaseContext.repository.length > 0;
    const coveredPackages = parseChangesetPackages(
      readPullRequestChangesets(root, changes),
    );
    const result = evaluateChangesetCoverage({
      changedFiles,
      plugins,
      coveredPackages,
    });

    if (result.affectedPackages.length === 0) {
      write("No publishable plugin changes detected.");
      return 0;
    }

    if (result.missingPackages.length === 0) {
      write(`Changesets cover: ${result.affectedPackages.join(", ")}`);
      return 0;
    }

    if (trustedVersionPullRequest) {
      warn(
        `Trusted version pull request may consume Changesets for: ${result.missingPackages.join(", ")}`,
      );
      return 0;
    }

    if (trustedProductionPromotion) {
      warn(
        `Production promotion from dev may contain already-versioned public changes for: ${result.missingPackages.join(", ")}`,
      );
      return 0;
    }

    error("A Changeset is required for changed public plugins:");
    for (const packageName of result.missingPackages) {
      error(`- ${packageName}`);
    }
    error("Run `npm run changeset` and commit the generated .changeset file.");
    return 1;
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught);
    error(`Changeset check failed: ${message}`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main();
}
