import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import ts from "typescript";

export const LICENSE_EXPRESSION = "MIT OR Apache-2.0";
export const COPYRIGHT_LINE = "Copyright (c) 2026 EdgeGamers, LLC";

const CANONICAL_MIT_HASH = "bc3c16ce75979b0a1852ae5a6b8a8339c3ee5f7119206a92ad4b4eb9c04adf8a";
const CANONICAL_APACHE_HASH = "4af79ba903609ac7d04bd49a7d66f3338e7c6e19d4e95b3ed49d06b59cdfbf33";
const SOURCE_EXTENSIONS = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"];
const APPROVED_NOTICE = `EdgeGamers Source2Script Plugins
Copyright 2026 EdgeGamers, LLC

This product includes software developed by EdgeGamers, LLC.
`;

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function normalizeText(contents) {
  return `${contents.replaceAll("\r\n", "\n").replaceAll("\r", "\n").replace(/\n*$/, "")}\n`;
}

function discoverPatternManifests(rootDir, patterns, label) {
  const found = new Map();
  for (const pattern of patterns ?? []) {
    const match = /^(.*)\/\*$/.exec(pattern.replaceAll("\\", "/"));
    if (!match || /[*?]/u.test(match[1])) throw new Error(`Unsupported ${label} pattern: ${pattern}`);
    const parent = join(rootDir, match[1]);
    if (!existsSync(parent)) continue;
    for (const entry of readdirSync(parent, { withFileTypes: true })) {
      const path = join(parent, entry.name, "package.json");
      if (entry.isDirectory() && existsSync(path)) {
        found.set(path, { path, manifest: readJson(path) });
      }
    }
  }
  return [...found.values()].sort((left, right) => left.path.localeCompare(right.path));
}

export function discoverWorkspaceManifests(rootDir) {
  const rootPath = join(rootDir, "package.json");
  const rootManifest = readJson(rootPath);
  const found = [
    { path: rootPath, manifest: rootManifest },
    ...discoverPatternManifests(rootDir, rootManifest.workspaces, "workspace"),
  ];

  return found.sort((left, right) => {
    if (left.path === rootPath) return -1;
    if (right.path === rootPath) return 1;
    return left.path.localeCompare(right.path);
  });
}

export function discoverSource2ScriptPluginManifests(rootDir) {
  const rootManifest = readJson(join(rootDir, "package.json"));
  return discoverPatternManifests(
    rootDir,
    rootManifest.s2script?.workspace?.plugins,
    "Source2Script plugin",
  );
}

function normalizedManifestPath(rootDir, path) {
  return relative(rootDir, path).replaceAll("\\", "/");
}

function findPluginSourceFiles(packageDir) {
  const files = [];
  const excludedDirectories = new Set([".s2script", "dist", "node_modules"]);

  function visit(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory() && excludedDirectories.has(entry.name)) continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(path);
      } else if (entry.isFile()
        && /\.(?:[cm]?[jt]s|[jt]sx)$/u.test(entry.name)
        && !/\.d\.[cm]?ts$/u.test(entry.name)) {
        files.push(path);
      }
    }
  }

  visit(packageDir);
  return files.sort();
}

function isTypeOnlyImport(node) {
  const clause = node.importClause;
  if (!clause) return false;
  if (clause.isTypeOnly) return true;
  return !clause.name
    && ts.isNamedImports(clause.namedBindings)
    && clause.namedBindings.elements.every((element) => element.isTypeOnly);
}

function isTypeOnlyExport(node) {
  if (node.isTypeOnly) return true;
  return node.exportClause
    && ts.isNamedExports(node.exportClause)
    && node.exportClause.elements.every((element) => element.isTypeOnly);
}

function collectRuntimeSpecifiers(path) {
  const source = ts.createSourceFile(
    path,
    readFileSync(path, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  const specifiers = [];
  let hasNonliteralPackageLoad = false;

  function addLiteral(node) {
    if (node && ts.isStringLiteralLike(node)) specifiers.push(node.text);
    else hasNonliteralPackageLoad = true;
  }

  function visit(node) {
    if (ts.isImportDeclaration(node) && !isTypeOnlyImport(node)) {
      addLiteral(node.moduleSpecifier);
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && !isTypeOnlyExport(node)) {
      addLiteral(node.moduleSpecifier);
    } else if (ts.isImportEqualsDeclaration(node)
      && !node.isTypeOnly
      && ts.isExternalModuleReference(node.moduleReference)) {
      addLiteral(node.moduleReference.expression);
    } else if (ts.isCallExpression(node)
      && (node.expression.kind === ts.SyntaxKind.ImportKeyword
        || (ts.isIdentifier(node.expression) && node.expression.text === "require"))) {
      if (node.arguments.length === 1) addLiteral(node.arguments[0]);
      else hasNonliteralPackageLoad = true;
    }
    ts.forEachChild(node, visit);
  }

  visit(source);
  return { hasNonliteralPackageLoad, specifiers };
}

function dependencyAllows(specifier, names) {
  return names.some((name) => specifier === name || specifier.startsWith(`${name}/`));
}

function normalizedPathKey(path) {
  const normalized = resolve(path);
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function isWithin(path, root) {
  const fromRoot = relative(root, path);
  return fromRoot === "" || (!fromRoot.startsWith("..") && !isAbsolute(fromRoot));
}

function relativeModuleCandidates(basePath) {
  const extension = extname(basePath).toLowerCase();
  const stem = extension ? basePath.slice(0, -extension.length) : basePath;
  const substitutions = {
    ".cjs": [".cts", ".cjs"],
    ".js": [".ts", ".tsx", ".js", ".jsx"],
    ".jsx": [".tsx", ".jsx"],
    ".mjs": [".mts", ".mjs"],
  };
  if (substitutions[extension]) {
    return substitutions[extension].map((candidateExtension) => `${stem}${candidateExtension}`);
  }
  if (SOURCE_EXTENSIONS.includes(extension)) return [basePath];
  if (extension) return [basePath];
  return [
    ...SOURCE_EXTENSIONS.map((candidateExtension) => `${basePath}${candidateExtension}`),
    ...SOURCE_EXTENSIONS.map((candidateExtension) => join(basePath, `index${candidateExtension}`)),
  ];
}

function resolveRelativeRuntimeImport({ licensedRoots, licensedSourceFiles, sourcePath, specifier }) {
  const basePath = resolve(dirname(sourcePath), specifier);
  const segments = basePath.replaceAll("\\", "/").split("/");
  if (segments.some((segment) => [".s2script", "dist", "node_modules"].includes(segment))) {
    return { error: "relative runtime import must not enter node_modules or generated output" };
  }
  if (!licensedRoots.some((root) => isWithin(basePath, root))) {
    return { error: "relative runtime import escapes all licensed first-party workspace packages" };
  }

  const matches = [...new Set(relativeModuleCandidates(basePath).map(normalizedPathKey))]
    .filter((candidate) => licensedSourceFiles.has(candidate));
  if (matches.length === 0) {
    return { error: "relative runtime import does not resolve to a scanned source file in a licensed workspace package" };
  }
  if (matches.length > 1) {
    return { error: "relative runtime import resolves ambiguously to multiple scanned source files" };
  }
  return { target: matches[0] };
}

function validatePluginSourceImports({
  errors,
  firstPartyNames,
  licensedRoots,
  licensedSourceFiles,
  manifest,
  packageDir,
  rootDir,
}) {
  const pluginDependencies = [
    ...Object.keys(manifest.s2script?.pluginDependencies ?? {}),
    ...Object.keys(manifest.s2script?.optionalPluginDependencies ?? {}),
  ];
  const bundledLibraries = Object.keys(manifest.s2script?.libraries ?? {})
    .filter((name) => firstPartyNames.has(name));

  for (const path of findPluginSourceFiles(packageDir)) {
    const normalizedPath = relative(rootDir, path).replaceAll("\\", "/");
    const { hasNonliteralPackageLoad, specifiers } = collectRuntimeSpecifiers(path);
    if (hasNonliteralPackageLoad) {
      errors.push(`${normalizedPath}: package-loading call must use a string literal so licensing can be validated`);
    }
    for (const specifier of new Set(specifiers)) {
      if (specifier.startsWith(".")) {
        const result = resolveRelativeRuntimeImport({
          licensedRoots,
          licensedSourceFiles,
          sourcePath: path,
          specifier,
        });
        if (result.error) errors.push(`${normalizedPath} -> ${specifier}: ${result.error}`);
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
  const licensedWorkspacePackages = packages.slice(1)
    .filter(({ manifest }) => manifest.license === LICENSE_EXPRESSION);
  const licensedRoots = licensedWorkspacePackages.map(({ path }) => dirname(path));
  const licensedSourceFiles = new Set(licensedRoots
    .flatMap((packageDir) => findPluginSourceFiles(packageDir))
    .map(normalizedPathKey));
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
      licensedRoots,
      licensedSourceFiles,
      manifest,
      packageDir,
      rootDir,
    });
  }
  return errors;
}
