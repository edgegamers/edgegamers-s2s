#!/usr/bin/env node
// Publish a pull request's development snapshot.
//
// Run after `s2s version --snapshot <id> --output <report>` in a throwaway CI
// checkout. Builds and deploys only what the snapshot versioned: its plugins,
// plus every member of a snapshotted bundle (a bundle publishes only when all
// of its members are in the deploy run; the ones already on the registry are
// skipped as usual). Nothing at a stable version is selected on its own, so a
// pull request never publishes a stable release.
//
//   node scripts/snapshot.mjs <report.json>          build and deploy
//   node scripts/snapshot.mjs <report.json> --plan   print what would publish
//
// Writes the install commands to $GITHUB_STEP_SUMMARY when it is set.

import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const [reportPath, ...rest] = process.argv.slice(2);
if (!reportPath) {
  console.error("usage: node scripts/snapshot.mjs <report.json> [--plan]");
  process.exit(2);
}
const plan = rest.includes("--plan");
const report = JSON.parse(readFileSync(reportPath, "utf8"));
const snaps = report.packages.filter((p) => !p.private);

// s2script.workspace globs are a directory or `<dir>/*`, like the root workspaces list.
function expand(patterns) {
  const dirs = [];
  for (const pattern of patterns) {
    if (pattern.endsWith("/*")) {
      const parent = pattern.slice(0, -2);
      for (const entry of readdirSync(join(root, parent), { withFileTypes: true })) {
        if (entry.isDirectory()) dirs.push(`${parent}/${entry.name}`);
      }
    } else {
      dirs.push(pattern);
    }
  }
  return dirs.filter((dir) => existsSync(join(root, dir, "package.json")));
}
const workspacePlugins = expand(JSON.parse(readFileSync(join(root, "package.json"), "utf8")).s2script.workspace.plugins);

const selected = new Set(snaps.filter((p) => p.kind === "plugin").map((p) => p.path));
for (const bundle of snaps.filter((p) => p.kind === "bundle")) {
  const prefix = bundle.path === "." ? "" : `${bundle.path}/`;
  for (const dir of workspacePlugins) if (dir.startsWith(prefix)) selected.add(dir);
}

console.log(`snapshot ${report.id} from ${report.source}`);
for (const p of snaps) console.log(`    ${p.name.padEnd(36)} ${p.version} (${p.kind})`);
const dirs = [...selected].sort();
if (dirs.length === 0) {
  console.log("nothing to publish: this change touches no published package");
} else if (!plan) {
  const filters = dirs.flatMap((dir) => ["--filter", dir]);
  const s2s = join(root, "node_modules", ".bin", "s2s");
  for (const argv of [["build", ...filters], ["deploy", "--ci", ...filters]]) {
    console.log(`\n$ s2s ${argv.join(" ")}`);
    execFileSync(s2s, argv, { cwd: root, stdio: "inherit" });
  }
}

const summary = process.env.GITHUB_STEP_SUMMARY;
if (summary && !plan) {
  const lines = [`## Dev snapshot \`${report.id}\``, ""];
  if (snaps.length === 0) {
    lines.push("No published package changed, so nothing was released.");
  } else {
    lines.push("These never become latest and auto-update ignores them. Install one by its exact version:", "", "```");
    for (const p of snaps) lines.push(`s2s install ${p.name}@${p.version}`);
    lines.push("```");
  }
  appendFileSync(summary, `${lines.join("\n")}\n`);
}
