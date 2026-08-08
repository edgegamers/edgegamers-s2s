import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  evaluateChangesetCoverage,
  parseChangesetPackages,
  parsePluginMetadata,
} from "./lib/changeset-policy.mjs";

function defaultGit(root, args) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
  }).trim();
}

function readPlugins(root) {
  const pluginsDirectory = join(root, "plugins");
  if (!existsSync(pluginsDirectory)) return [];

  return readdirSync(pluginsDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const packagePath = join(pluginsDirectory, entry.name, "package.json");
      if (!existsSync(packagePath)) {
        throw new Error(`plugins/${entry.name}/package.json: file is missing`);
      }

      return parsePluginMetadata(entry.name, readFileSync(packagePath, "utf8"));
    });
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
  allowMissing = process.env.ALLOW_MISSING_CHANGESET === "true",
  git = (args) => defaultGit(root, args),
  write = console.log,
  warn = console.warn,
  error = console.error,
} = {}) {
  try {
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
      write("No server-affecting plugin changes detected.");
      return 0;
    }

    if (result.missingPackages.length === 0) {
      write(`Changesets cover: ${result.affectedPackages.join(", ")}`);
      return 0;
    }

    if (allowMissing) {
      warn(
        `Missing Changesets allowed by override for: ${result.missingPackages.join(", ")}`,
      );
      return 0;
    }

    error("A Changeset is required for changed server-affecting plugins:");
    for (const packageName of result.missingPackages) {
      error(`- ${packageName}`);
    }
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
