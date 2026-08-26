import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import {
  collectModuleReferences,
  findSourceFiles,
  resolveRelativeSourceImport,
} from "./source-imports.mjs";
import {
  findOwningPackage,
  requireValidWorkspaceLayout,
} from "./workspace-layout.mjs";

export const LICENSE_EXPRESSION = "MIT OR Apache-2.0";
export const COPYRIGHT_LINE = "Copyright (c) 2026 EdgeGamers, LLC";

const CANONICAL_MIT_HASH = "bc3c16ce75979b0a1852ae5a6b8a8339c3ee5f7119206a92ad4b4eb9c04adf8a";
const CANONICAL_APACHE_HASH = "4af79ba903609ac7d04bd49a7d66f3338e7c6e19d4e95b3ed49d06b59cdfbf33";
const APPROVED_NOTICE = `edgegamers-s2s
Copyright 2026 EdgeGamers, LLC

This product includes software developed by EdgeGamers, LLC.
`;
const TEST_SOURCE_PATH = /(?:^|\/)(?:test|tests|__tests__)\//u;

function pluginRuntimeSourceFiles(packageDirectory) {
  return findSourceFiles(packageDirectory).filter((path) => {
    const normalizedPath = relative(packageDirectory, path).replaceAll("\\", "/");
    return !TEST_SOURCE_PATH.test(normalizedPath);
  });
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function normalizeText(contents) {
  return `${contents.replaceAll("\r\n", "\n").replaceAll("\r", "\n").replace(/\n*$/, "")}\n`;
}

export function discoverWorkspaceManifests(rootDir) {
  const rootPath = join(rootDir, "package.json");
  const rootManifest = readJson(rootPath);
  const { packages } = requireValidWorkspaceLayout(rootDir);
  return [
    { path: rootPath, manifest: rootManifest },
    ...packages.map(({ manifestPath: path, manifest }) => ({ path, manifest })),
  ];
}

export function discoverSource2ScriptPluginManifests(rootDir) {
  const { packages } = requireValidWorkspaceLayout(rootDir);
  return packages
    .filter(({ kind }) => kind === "plugin")
    .map(({ manifestPath: path, manifest }) => ({ path, manifest }));
}

function normalizedManifestPath(rootDir, path) {
  return relative(rootDir, path).replaceAll("\\", "/");
}

function dependencyAllows(specifier, names) {
  return names.some((name) => specifier === name || specifier.startsWith(`${name}/`));
}

function licensingRelativeImportError({ error, packages, sourcePath, specifier }) {
  if (error === "relative import must not enter node_modules or generated output") {
    return "relative runtime import must not enter node_modules or generated output";
  }
  if (error === "relative import does not resolve to a scanned source file") {
    const owner = findOwningPackage(
      packages,
      resolve(dirname(sourcePath), specifier),
    );
    if (!owner || owner.manifest.license !== LICENSE_EXPRESSION) {
      return "relative runtime import escapes all licensed first-party workspace packages";
    }
    return "relative runtime import does not resolve to a scanned source file in a licensed workspace package";
  }
  if (error === "relative import resolves ambiguously to multiple scanned source files") {
    return "relative runtime import resolves ambiguously to multiple scanned source files";
  }
  return error;
}

function validatePluginSourceImports({
  errors,
  firstPartyNames,
  licensedSourceFiles,
  manifest,
  packageDir,
  rootDir,
  workspacePackages,
}) {
  const pluginDependencies = [
    ...Object.keys(manifest.s2script?.pluginDependencies ?? {}),
    ...Object.keys(manifest.s2script?.optionalPluginDependencies ?? {}),
  ];
  const bundledLibraries = Object.keys(manifest.s2script?.libraries ?? {})
    .filter((name) => firstPartyNames.has(name));

  for (const path of pluginRuntimeSourceFiles(packageDir)) {
    const normalizedPath = relative(rootDir, path).replaceAll("\\", "/");
    const { hasNonliteralPackageLoad, references } = collectModuleReferences(path);
    if (hasNonliteralPackageLoad) {
      errors.push(`${normalizedPath}: package-loading call must use a string literal so licensing can be validated`);
    }
    const runtimeSpecifiers = references
      .filter(({ runtime }) => runtime === true)
      .map(({ specifier }) => specifier);
    for (const specifier of new Set(runtimeSpecifiers)) {
      if (specifier.startsWith(".")) {
        const result = resolveRelativeSourceImport({
          sourcePath: path,
          sourceFiles: licensedSourceFiles,
          specifier,
        });
        if (result.error) {
          errors.push(`${normalizedPath} -> ${specifier}: ${licensingRelativeImportError({
            error: result.error,
            packages: workspacePackages,
            sourcePath: path,
            specifier,
          })}`);
        }
        continue;
      }
      if (specifier.startsWith("@s2script/")
        || dependencyAllows(specifier, pluginDependencies)
        || dependencyAllows(specifier, bundledLibraries)) continue;
      errors.push(`${normalizedPath} -> ${specifier}: bare runtime import is not an approved plugin dependency or licensed first-party bundled library`);
    }
  }
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

  const mitText = normalizeText(readFileSync(join(rootDir, "licenses/MIT.txt"), "utf8"));
  const apacheText = normalizeText(readFileSync(join(rootDir, "licenses/Apache-2.0.txt"), "utf8"));
  const notice = normalizeText(readFileSync(join(rootDir, "licenses/NOTICE"), "utf8"));
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
  if (createHash("sha256").update(mitText).digest("hex") !== CANONICAL_MIT_HASH) {
    errors.push("licenses/MIT.txt: content must match the approved canonical MIT text");
  }
  if (createHash("sha256").update(apacheText).digest("hex") !== CANONICAL_APACHE_HASH) {
    errors.push("licenses/Apache-2.0.txt: content must match the approved Apache 2.0 text and EdgeGamers application notice");
  }
  if (notice !== APPROVED_NOTICE) {
    errors.push("licenses/NOTICE: content must match the approved attribution-only notice");
  }

  const packages = discoverWorkspaceManifests(rootDir);
  const source2ScriptPlugins = discoverSource2ScriptPluginManifests(rootDir);
  const { packages: workspacePackages } = requireValidWorkspaceLayout(rootDir);
  const npmManifestPaths = new Set(packages.map(({ path }) => normalizedManifestPath(rootDir, path)));
  const npmPluginPaths = new Set([...npmManifestPaths].filter((path) => path.startsWith("plugins/")));
  const source2ScriptPluginPaths = new Set(
    source2ScriptPlugins.map(({ path }) => normalizedManifestPath(rootDir, path)),
  );
  for (const path of npmPluginPaths) {
    if (!source2ScriptPluginPaths.has(path)) {
      errors.push(`${path}: npm workspace plugin is not selected by s2script.workspace.plugins`);
    }
  }
  for (const path of source2ScriptPluginPaths) {
    if (!npmManifestPaths.has(path)) {
      errors.push(`${path}: Source2Script plugin is not selected by npm workspaces`);
    }
  }

  const firstPartyNames = new Set(packages.map(({ manifest }) => manifest.name));
  const licensedWorkspacePackages = workspacePackages
    .filter(({ manifest }) => manifest.license === LICENSE_EXPRESSION);
  const licensedSourceFiles = new Set(licensedWorkspacePackages
    .flatMap(({ absoluteDirectory }) => pluginRuntimeSourceFiles(absoluteDirectory)));
  const validationPackages = new Map(packages.map((item) => [normalizedManifestPath(rootDir, item.path), item]));
  for (const item of source2ScriptPlugins) {
    validationPackages.set(normalizedManifestPath(rootDir, item.path), item);
  }

  for (const { path, manifest } of validationPackages.values()) {
    if (manifest.license !== LICENSE_EXPRESSION) {
      errors.push(`${relative(rootDir, path)}: license must be ${JSON.stringify(LICENSE_EXPRESSION)}`);
    }

    const normalized = relative(rootDir, path).replaceAll("\\", "/");
    if (!normalized.startsWith("plugins/") && !source2ScriptPluginPaths.has(normalized)) continue;

    const packageDir = dirname(path);
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
    validatePluginSourceImports({
      errors,
      firstPartyNames,
      licensedSourceFiles,
      manifest,
      packageDir,
      rootDir,
      workspacePackages,
    });
  }
  return errors;
}
