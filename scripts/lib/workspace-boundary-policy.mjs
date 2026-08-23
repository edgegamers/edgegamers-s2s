import { relative } from "node:path";
import {
  collectModuleReferenceDetails,
  findSourceFiles,
  resolveRelativeSourceImport,
} from "./source-imports.mjs";
import { findOwningPackage, inspectWorkspaceLayout, scopeAllows } from "./workspace-layout.mjs";

const MANIFEST_DEPENDENCY_FIELDS = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
];
const S2SCRIPT_DEPENDENCY_FIELDS = [
  "pluginDependencies",
  "optionalPluginDependencies",
  "libraries",
];

function repositoryPath(rootDir, path) {
  return relative(rootDir, path).replaceAll("\\", "/");
}

function packageNameFromSpecifier(specifier) {
  const segments = specifier.split("/");
  return specifier.startsWith("@") ? segments.slice(0, 2).join("/") : segments[0];
}

function classifyPackage(name, layout) {
  const workspacePackage = layout.byName.get(name);
  if (workspacePackage) return { name, scope: workspacePackage.scope };
  const externalScope = layout.policy.externalScopes.get(name);
  if (externalScope) return { name, scope: externalScope };
  if (name.startsWith("@s2script/")) {
    return {
      name,
      error: `unclassified Source2Script package ${name}; add it to workspace-policy.json`,
    };
  }
  return undefined;
}

function addRecord(records, message, { path = "", line = 0, column = 0, target = "" } = {}) {
  records.push({ message, path, line, column, target });
}

function addBoundaryDiagnostic(records, { sourcePackage, path, line, column, targetName, targetScope }) {
  if (!scopeAllows(sourcePackage.scope, targetScope)) {
    addRecord(records,
      `${path}${line ? `:${line}${column ? `:${column}` : ""}` : ""} -> ${targetName}: ${sourcePackage.scope} code cannot reference ${targetScope}-scoped package ${targetName}`,
      { path, line, column, target: targetName });
  }
}

function validatePackageReference(records, { sourcePackage, layout, path, line, column, specifier }) {
  const name = packageNameFromSpecifier(specifier);
  const target = classifyPackage(name, layout);
  if (!target) return;
  if (target.error) {
    addRecord(records,
      `${path}${line ? `:${line}${column ? `:${column}` : ""}` : ""} -> ${name}: ${target.error}`,
      { path, line, column, target: name });
    return;
  }
  addBoundaryDiagnostic(records, {
    sourcePackage,
    path,
    line,
    column,
    targetName: target.name,
    targetScope: target.scope,
  });
}

function manifestDependencyNames(manifest) {
  const names = [];
  for (const field of MANIFEST_DEPENDENCY_FIELDS) {
    if (manifest[field] && typeof manifest[field] === "object" && !Array.isArray(manifest[field])) {
      names.push(...Object.keys(manifest[field]));
    }
  }
  const s2script = manifest.s2script;
  if (s2script && typeof s2script === "object" && !Array.isArray(s2script)) {
    for (const field of S2SCRIPT_DEPENDENCY_FIELDS) {
      if (s2script[field] && typeof s2script[field] === "object" && !Array.isArray(s2script[field])) {
        names.push(...Object.keys(s2script[field]));
      }
    }
  }
  return [...new Set(names)].sort((left, right) => left.localeCompare(right));
}

function validateManifestReferences({ sourcePackage, layout, records, rootDir }) {
  const path = repositoryPath(rootDir, sourcePackage.manifestPath);
  for (const specifier of manifestDependencyNames(sourcePackage.manifest)) {
    validatePackageReference(records, { sourcePackage, layout, path, specifier });
  }
}

function validateSourceReferences({ sourcePackage, sourceFiles, layout, records, rootDir }) {
  for (const sourcePath of findSourceFiles(sourcePackage.absoluteDirectory, { includeDeclarations: true })) {
    const path = repositoryPath(rootDir, sourcePath);
    const result = collectModuleReferenceDetails(sourcePath);
    for (const { line } of result.nonliteralPackageLoadLocations) {
      addRecord(records,
        `${path}:${line}: package-loading call must use a string literal so workspace boundaries can be validated`,
        { path, line });
    }
    for (const reference of result.references) {
      if (reference.specifier.startsWith(".")) {
        const resolved = resolveRelativeSourceImport({
          sourcePath,
          specifier: reference.specifier,
          sourceFiles,
        });
        if (resolved.error) {
          addRecord(records,
            `${path}:${reference.line}:${reference.column} -> ${reference.specifier}: ${resolved.error}`,
            { path, line: reference.line, column: reference.column, target: reference.specifier });
          continue;
        }
        const owner = findOwningPackage(layout.packages, resolved.target);
        if (!owner) {
          addRecord(records,
            `${path}:${reference.line}:${reference.column} -> ${reference.specifier}: relative import target is not owned by a workspace package`,
            { path, line: reference.line, column: reference.column, target: reference.specifier });
          continue;
        }
        addBoundaryDiagnostic(records, {
          sourcePackage,
          path,
          line: reference.line,
          column: reference.column,
          targetName: owner.name,
          targetScope: owner.scope,
        });
      } else {
        validatePackageReference(records, {
          sourcePackage,
          layout,
          path,
          line: reference.line,
          column: reference.column,
          specifier: reference.specifier,
        });
      }
    }
  }
}

function compareDiagnostics(left, right) {
  return left.path.localeCompare(right.path)
    || left.line - right.line
    || left.column - right.column
    || left.target.localeCompare(right.target)
    || left.message.localeCompare(right.message);
}

export function validateWorkspaceBoundaries(rootDir) {
  const layout = inspectWorkspaceLayout(rootDir);
  const records = layout.errors.map((message) => ({ message, path: message.split(":")[0] }));
  const sourceFiles = new Set(layout.packages.flatMap(({ absoluteDirectory }) =>
    findSourceFiles(absoluteDirectory, { includeDeclarations: true })));

  for (const sourcePackage of layout.packages) {
    validateManifestReferences({ sourcePackage, layout, records, rootDir });
    validateSourceReferences({ sourcePackage, sourceFiles, layout, records, rootDir });
  }
  const unique = new Map(records.map((record) => [record.message, record]));
  return [...unique.values()].sort(compareDiagnostics).map(({ message }) => message);
}
