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
//   node scripts/snapshot.mjs <report.json> --build  pin and build, but do not deploy
//
// Writes the install commands to $GITHUB_STEP_SUMMARY when it is set.

import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const [reportPath, ...rest] = process.argv.slice(2);
if (!reportPath) {
  console.error("usage: node scripts/snapshot.mjs <report.json> [--plan]");
  process.exit(2);
}
const plan = rest.includes("--plan");
const buildOnly = rest.includes("--build");
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

// Plugin dependency ranges name a provider's INTERFACE, checked against its `publishes` version
// at build and load, but the server's install planner also resolves them against PACKAGE versions.
// `s2s version --snapshot` keeps both as authored (core still publishes 2.3.0 and consumers still
// ask for ^2.3.0), so the planner can never pick a 0.0.0-dev… core. It does not accept `a || b`
// ranges either. So inside each snapshotted BUNDLE, which installs as one unit, move the members'
// interfaces onto the snapshot version and pin the members' ranges on each other to it.
// Ranges on anything outside the bundle (Decluttr, say) stay as authored, so a dev bundle still
// attaches to the stable plugins next to it. Only the throwaway checkout is edited.
function pinSnapshot() {
  const read = (dir) => JSON.parse(readFileSync(join(root, dir, "package.json"), "utf8"));
  const write = (dir, pkg) => writeFileSync(join(root, dir, "package.json"), `${JSON.stringify(pkg, null, 2)}\n`);
  const snapshotPlugins = new Map(report.packages.filter((p) => p.kind === "plugin").map((p) => [p.path, p.version]));
  let moved = 0, pinned = 0;
  for (const bundle of report.packages.filter((p) => p.kind === "bundle")) {
    const prefix = bundle.path === "." ? "" : `${bundle.path}/`;
    const members = workspacePlugins.filter((dir) => dir.startsWith(prefix) && snapshotPlugins.has(dir));
    const interfaces = new Map();
    for (const dir of members) {
      const pkg = read(dir);
      const version = snapshotPlugins.get(dir);
      let publishes = pkg.s2script?.publishes;
      if (publishes === undefined || publishes === null) continue;
      if (publishes === "self") publishes = { [pkg.name]: version };
      for (const name of Object.keys(publishes)) {
        publishes[name] = version;
        interfaces.set(name, version);
        moved++;
      }
      pkg.s2script.publishes = publishes;
      write(dir, pkg);
    }
    for (const dir of members) {
      const pkg = read(dir);
      let changed = false;
      for (const field of ["pluginDependencies", "optionalPluginDependencies"]) {
        const deps = pkg.s2script?.[field];
        if (!deps) continue;
        for (const name of Object.keys(deps)) {
          const version = interfaces.get(name);
          if (version === undefined || deps[name] === version) continue;
          deps[name] = version;
          changed = true;
          pinned++;
        }
      }
      if (changed) write(dir, pkg);
    }
  }
  return { interfaces: moved, pinned };
}

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
  const { interfaces, pinned } = pinSnapshot();
  console.log(`moved ${interfaces} interface(s) and ${pinned} dependency range(s) onto the snapshot version inside bundles`);
  const filters = dirs.flatMap((dir) => ["--filter", dir]);
  const s2s = join(root, "node_modules", ".bin", "s2s");
  for (const argv of buildOnly ? [["build", ...filters]] : [["build", ...filters], ["deploy", "--ci", ...filters]]) {
    console.log(`\n$ s2s ${argv.join(" ")}`);
    execFileSync(s2s, argv, { cwd: root, stdio: "inherit" });
  }
}

const summary = process.env.GITHUB_STEP_SUMMARY;
if (summary && !plan && !buildOnly) {
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
