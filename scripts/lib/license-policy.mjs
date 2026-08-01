import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

export const LICENSE_EXPRESSION = "MIT OR Apache-2.0";
export const COPYRIGHT_LINE = "Copyright (c) 2026 EdgeGamers, LLC";

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function discoverWorkspaceManifests(rootDir) {
  const rootPath = join(rootDir, "package.json");
  const rootManifest = readJson(rootPath);
  const found = [{ path: rootPath, manifest: rootManifest }];

  for (const pattern of rootManifest.workspaces ?? []) {
    const match = /^(.*)\/\*$/.exec(pattern.replaceAll("\\\\", "/"));
    if (!match) throw new Error(`Unsupported workspace pattern: ${pattern}`);
    const parent = join(rootDir, match[1]);
    if (!existsSync(parent)) continue;
    for (const entry of readdirSync(parent, { withFileTypes: true })) {
      const path = join(parent, entry.name, "package.json");
      if (entry.isDirectory() && existsSync(path)) {
        found.push({ path, manifest: readJson(path) });
      }
    }
  }

  return found.sort((left, right) => {
    if (left.path === rootPath) return -1;
    if (right.path === rootPath) return 1;
    return left.path.localeCompare(right.path);
  });
}

export function validateRepositoryLicensing(rootDir) {
  const errors = [];
  const required = [
    "LICENSE",
    "licenses/MIT.txt",
    "licenses/Apache-2.0.txt",
    "licenses/NOTICE",
    "licenses/README.md",
    ".github/CONTRIBUTING.md",
  ];
  for (const path of required) {
    if (!existsSync(join(rootDir, path))) errors.push(`${path}: required licensing file is missing`);
  }
  if (errors.length > 0) return errors;

  const mitText = readFileSync(join(rootDir, "licenses/MIT.txt"), "utf8").trim();
  const rootLicense = readFileSync(join(rootDir, "LICENSE"), "utf8");
  const contributing = readFileSync(join(rootDir, ".github/CONTRIBUTING.md"), "utf8");
  const markers = [COPYRIGHT_LINE, `SPDX-License-Identifier: ${LICENSE_EXPRESSION}`,
    "licenses/MIT.txt", "licenses/Apache-2.0.txt", "contribution intentionally submitted"];
  for (const marker of markers) {
    if (!rootLicense.includes(marker)) errors.push(`LICENSE: missing required marker ${JSON.stringify(marker)}`);
  }
  if (!contributing.includes(LICENSE_EXPRESSION) || !contributing.includes("authority to submit")) {
    errors.push(".github/CONTRIBUTING.md: missing inbound-license or submission-authority terms");
  }
  if (!mitText.startsWith(`MIT License\n\n${COPYRIGHT_LINE}`)) {
    errors.push("licenses/MIT.txt: copyright or canonical heading is incorrect");
  }

  const packages = discoverWorkspaceManifests(rootDir);
  const firstPartyNames = new Set(packages.map(({ manifest }) => manifest.name));

  for (const { path, manifest } of packages) {
    if (manifest.license !== LICENSE_EXPRESSION) {
      errors.push(`${relative(rootDir, path)}: license must be ${JSON.stringify(LICENSE_EXPRESSION)}`);
    }

    const normalized = relative(rootDir, path).replaceAll("\\", "/");
    if (!normalized.startsWith("plugins/")) continue;

    const packageDir = join(path, "..");
    const entry = manifest.s2script?.main ?? manifest.main;
    if (typeof entry === "string") {
      const entryPath = join(packageDir, entry);
      const source = existsSync(entryPath) ? readFileSync(entryPath, "utf8") : "";
      if (!source.includes(mitText)) {
        errors.push(`${relative(rootDir, entryPath).replaceAll("\\", "/")}: complete MIT notice is missing`);
      }
    }

    for (const name of Object.keys(manifest.s2script?.libraries ?? {})) {
      if (!firstPartyNames.has(name)) {
        errors.push(`${manifest.name} -> ${name}: bundled library is not a licensed workspace package; audit its terms and notices before distribution`);
      }
    }
  }
  return errors;
}
