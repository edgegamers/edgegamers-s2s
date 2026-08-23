import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  evaluateChangesetCoverage,
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

function readChangesets(root) {
  const changesetDirectory = join(root, ".changeset");
  if (!existsSync(changesetDirectory)) return [];

  return readdirSync(changesetDirectory)
    .filter((file) => file.endsWith(".md") && file !== "README.md")
    .sort()
    .map((file) => ({
      path: `.changeset/${file}`,
      content: readFileSync(join(changesetDirectory, file), "utf8"),
    }));
}

export function main({
  root = process.cwd(),
  baseRef = process.env.CHANGESET_BASE_REF ?? "origin/dev",
  releaseContext = {
    eventName: process.env.GITHUB_EVENT_NAME,
    baseRef: process.env.GITHUB_BASE_REF,
    headRef: process.env.GITHUB_HEAD_REF,
    author: process.env.CHANGESET_PR_AUTHOR,
  },
  git = (args) => defaultGit(root, args),
  write = console.log,
  warn = console.warn,
  error = console.error,
} = {}) {
  try {
    const trustedVersionPullRequest = isTrustedVersionPullRequest(releaseContext);
    const mergeBase = git(["merge-base", "HEAD", baseRef]);
    const changedOutput = git([
      "diff",
      "--name-only",
      `${mergeBase}...HEAD`,
    ]);
    const changedFiles = changedOutput
      ? changedOutput.split(/\r?\n/u).filter(Boolean)
      : [];
    const plugins = readPlugins(root);
    const coveredPackages = parseChangesetPackages(readChangesets(root));
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
