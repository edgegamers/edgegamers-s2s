import { readFileSync, readdirSync } from "node:fs";
import { dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import ts from "typescript";

const SOURCE_EXTENSIONS = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"];
const DECLARATION_EXTENSIONS = [".d.ts", ".d.mts", ".d.cts"];
const EXCLUDED_DIRECTORIES = new Set([".s2script", "dist", "node_modules"]);

function isDeclarationFile(path) {
  return DECLARATION_EXTENSIONS.some((extension) => path.endsWith(extension));
}

function isSourceFile(path) {
  return SOURCE_EXTENSIONS.some((extension) => path.endsWith(extension));
}

export function findSourceFiles(packageDirectory, { includeDeclarations = false } = {}) {
  const files = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!EXCLUDED_DIRECTORIES.has(entry.name)) visit(path);
      } else if (entry.isFile() && isSourceFile(path)
        && (includeDeclarations || !isDeclarationFile(path))) {
        files.push(path);
      }
    }
  };
  visit(packageDirectory);
  return files.sort((left, right) => left.localeCompare(right));
}

function isTypeOnlyImport(node) {
  const clause = node.importClause;
  if (!clause) return false;
  if (clause.isTypeOnly) return true;
  return !clause.name
    && ts.isNamedImports(clause.namedBindings)
    && clause.namedBindings.elements.length > 0
    && clause.namedBindings.elements.every((element) => element.isTypeOnly);
}

function isTypeOnlyExport(node) {
  if (node.isTypeOnly) return true;
  return node.exportClause
    && ts.isNamedExports(node.exportClause)
    && node.exportClause.elements.length > 0
    && node.exportClause.elements.every((element) => element.isTypeOnly);
}

function location(source, node) {
  const position = ts.getLineAndCharacterOfPosition(source, node.getStart(source));
  return { line: position.line + 1, column: position.character + 1 };
}

function scanModuleReferences(sourcePath) {
  const source = ts.createSourceFile(
    sourcePath,
    readFileSync(sourcePath, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  const references = [];
  let hasNonliteralPackageLoad = false;
  const nonliteralPackageLoadLocations = [];

  const addLiteral = (node, runtime, locationNode = node) => {
    if (node && ts.isStringLiteralLike(node)) {
      references.push({ specifier: node.text, runtime, ...location(source, locationNode) });
    } else {
      hasNonliteralPackageLoad = true;
      nonliteralPackageLoadLocations.push(location(source, locationNode));
    }
  };

  const visit = (node) => {
    if (ts.isImportDeclaration(node)) {
      addLiteral(node.moduleSpecifier, !isTypeOnlyImport(node), node);
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
      addLiteral(node.moduleSpecifier, !isTypeOnlyExport(node), node);
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      addLiteral(node.moduleReference.expression, !node.isTypeOnly, node);
    } else if (ts.isImportTypeNode(node)) {
      const argument = node.argument;
      addLiteral(ts.isLiteralTypeNode(argument) ? argument.literal : undefined, false, node);
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      if (node.arguments.length >= 1) addLiteral(node.arguments[0], true, node);
      else {
        hasNonliteralPackageLoad = true;
        nonliteralPackageLoadLocations.push(location(source, node));
      }
    } else if (ts.isCallExpression(node)
      && ts.isIdentifier(node.expression) && node.expression.text === "require") {
      if (node.arguments.length === 1) addLiteral(node.arguments[0], true, node);
      else {
        hasNonliteralPackageLoad = true;
        nonliteralPackageLoadLocations.push(location(source, node));
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return { references, hasNonliteralPackageLoad, nonliteralPackageLoadLocations };
}

export function collectModuleReferences(sourcePath) {
  const { references, hasNonliteralPackageLoad } = scanModuleReferences(sourcePath);
  return { references, hasNonliteralPackageLoad };
}

export function collectModuleReferenceDetails(sourcePath) {
  return scanModuleReferences(sourcePath);
}

function normalizedPathKey(path) {
  const normalized = resolve(path);
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function relativeModuleCandidates(basePath) {
  const extension = extname(basePath).toLowerCase();
  const stem = extension ? basePath.slice(0, -extension.length) : basePath;
  const substitutions = {
    ".cjs": [".cts", ".d.cts", ".cjs"],
    ".js": [".ts", ".tsx", ".d.ts", ".js", ".jsx"],
    ".jsx": [".tsx", ".d.ts", ".jsx"],
    ".mjs": [".mts", ".d.mts", ".mjs"],
  };
  if (substitutions[extension]) {
    return substitutions[extension].map((candidateExtension) => `${stem}${candidateExtension}`);
  }
  if (SOURCE_EXTENSIONS.includes(extension)) return [basePath];
  if (extension) return [basePath];
  const candidates = [...SOURCE_EXTENSIONS, ...DECLARATION_EXTENSIONS];
  return [
    ...candidates.map((candidateExtension) => `${basePath}${candidateExtension}`),
    ...candidates.map((candidateExtension) => join(basePath, `index${candidateExtension}`)),
  ];
}

function entersExcludedDirectory(path) {
  return path.replaceAll("\\", "/").split("/").some((segment) => EXCLUDED_DIRECTORIES.has(segment));
}

export function resolveRelativeSourceImport({ sourcePath, specifier, sourceFiles }) {
  const basePath = resolve(dirname(sourcePath), specifier);
  if (entersExcludedDirectory(basePath)) {
    return { error: "relative import must not enter node_modules or generated output" };
  }
  const sourcesByKey = new Map();
  for (const sourceFile of sourceFiles) {
    const key = normalizedPathKey(sourceFile);
    sourcesByKey.set(key, sourceFile);
  }
  const matches = [...new Set(relativeModuleCandidates(basePath).map(normalizedPathKey))]
    .filter((candidate) => sourcesByKey.has(candidate));
  if (matches.length === 0) {
    return { error: "relative import does not resolve to a scanned source file" };
  }
  if (matches.length > 1) {
    return { error: "relative import resolves ambiguously to multiple scanned source files" };
  }
  return { target: sourcesByKey.get(matches[0]) };
}

export function isSourcePathWithin(path, root) {
  const fromRoot = relative(root, path);
  return fromRoot === "" || (!fromRoot.startsWith("..") && !isAbsolute(fromRoot));
}
