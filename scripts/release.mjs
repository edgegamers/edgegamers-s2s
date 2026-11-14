#!/usr/bin/env node
// Release only what is not on the registry yet.
//
// `s2s deploy` already skips every plugin and bundle whose exact version is
// published, but only after it has built the whole workspace, and the release
// script used to run the full build and every test before that. This asks the
// registry first, the same way `s2s deploy` does (resolve name@version), and
// then builds, tests and deploys only the packages that will actually publish.
// When nothing is new it exits without building at all.
//
//   node scripts/release.mjs            build, test and deploy what is unpublished
//   node scripts/release.mjs --check    build and test it only (the version PR)
//   node scripts/release.mjs --plan     print the plan only
//
// A bundle's version only publishes when every member is in the deploy run, so
// a bundle that needs publishing brings all of its members along; the members
// that are already published are skipped by `s2s deploy` as usual. A registry
// error counts as "unpublished", so a flaky lookup costs a build, never a
// missed release.

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

const root = join(import.meta.dirname, "..");
const args = new Set(process.argv.slice(2));
const mode = args.has("--plan") ? "plan" : args.has("--check") ? "check" : "release";

const registry = (process.env.S2SCRIPT_REGISTRY_URL || "https://www.s2script.com").replace(/\/+$/, "");
// Restricted packages (MAUL, portal, ...) only resolve for their owner, so send
// the deploy token like `s2s deploy` does. Without it they look unpublished.
const token = process.env.S2SCRIPT_TOKEN || process.env.S2SCRIPT_DEPLOY_TOKEN;
const headers = token ? { Authorization: `Bearer ${token}` } : {};

function readPkg(dir) {
  const file = join(root, dir, "package.json");
  return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null;
}

// s2script.workspace globs are a directory or `<dir>/*`, like the root workspaces list.
function expand(patterns) {
  const dirs = [];
  for (const pattern of patterns) {
    if (pattern.endsWith("/*")) {
      const parent = pattern.slice(0, -2);
      for (const entry of readdirSync(join(root, parent), { withFileTypes: true })) {
        if (entry.isDirectory()) dirs.push(`${parent}/${entry.name}`);
      }
    } else if (pattern.includes("*")) {
      throw new Error(`unsupported workspace pattern ${JSON.stringify(pattern)}`);
    } else {
      dirs.push(pattern);
    }
  }
  return dirs.filter((dir) => readPkg(dir) !== null).sort();
}

const workspace = readPkg(".").s2script.workspace;
const plugins = expand(workspace.plugins).map((dir) => ({ dir, pkg: readPkg(dir) }));
const bundles = expand(workspace.bundles ?? []).map((dir) => {
  const pkg = readPkg(dir);
  const members = plugins.filter((p) => p.dir.startsWith(`${dir}/`));
  return { dir, pkg, members };
});

async function isPublished(name, version) {
  const url = new URL(`${registry}/api/v1/resolve`);
  url.searchParams.set("name", name);
  url.searchParams.set("range", version);
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(30_000) });
    if (res.status === 404) return false;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.json();
    return body.version === version;
  } catch (e) {
    console.warn(`could not check ${name}@${version} (${e.message}); treating it as unpublished`);
    return false;
  }
}

const [pluginState, bundleState] = await Promise.all([
  Promise.all(
    plugins.map(async (p) => (p.pkg.private ? "private" : (await isPublished(p.pkg.name, p.pkg.version)) ? "published" : "PUBLISH")),
  ),
  Promise.all(bundles.map(async (b) => ((await isPublished(b.pkg.name, b.pkg.version)) ? "published" : "PUBLISH"))),
]);

const selected = new Set();
plugins.forEach((p, i) => pluginState[i] === "PUBLISH" && selected.add(p.dir));
bundles.forEach((b, i) => bundleState[i] === "PUBLISH" && b.members.forEach((m) => selected.add(m.dir)));

const pad = Math.max(...[...plugins, ...bundles].map((x) => x.pkg.name.length));
console.log("release plan:");
plugins.forEach((p, i) => {
  const note = pluginState[i] !== "PUBLISH" && selected.has(p.dir) ? "published (built for its bundle)" : pluginState[i];
  console.log(`    ${p.pkg.name.padEnd(pad)} ${p.pkg.version.padEnd(8)} ${note}`);
});
bundles.forEach((b, i) => console.log(`    ${b.pkg.name.padEnd(pad)} ${b.pkg.version.padEnd(8)} ${bundleState[i]} (bundle)`));

const dirs = plugins.map((p) => p.dir).filter((dir) => selected.has(dir));
if (dirs.length === 0) {
  console.log("nothing to publish: every plugin and bundle is on the registry at its current version");
  process.exit(0);
}
if (mode === "plan") process.exit(0);

const filters = dirs.flatMap((dir) => ["--filter", dir]);
const run = (cmd, argv) => {
  console.log(`\n$ ${cmd} ${argv.join(" ")}`);
  execFileSync(cmd, argv, { cwd: root, stdio: "inherit" });
};
const s2s = join(root, "node_modules", ".bin", "s2s");

// Tests read the built archives, so build first.
run(s2s, ["build", ...filters]);
run("npm", ["test", "--if-present", ...dirs.flatMap((dir) => ["--workspace", dir])]);
if (mode === "release") run(s2s, ["deploy", "--ci", ...filters]);
