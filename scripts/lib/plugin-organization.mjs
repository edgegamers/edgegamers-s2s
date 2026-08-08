import { readdirSync, readFileSync } from "node:fs";
import { extname, join, relative } from "node:path";
import ts from "typescript";
import { readPluginPackages } from "./plugin-workspace.mjs";

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".cts"]);

function sourceFiles(directory) {
  const result = [];
  const excluded = new Set([".s2script", "dist", "node_modules"]);

  function visit(path) {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      if (entry.isDirectory() && excluded.has(entry.name)) continue;

      const child = join(path, entry.name);
      if (entry.isDirectory()) {
        visit(child);
      } else if (entry.isFile() && SOURCE_EXTENSIONS.has(extname(entry.name))) {
        result.push(child);
      }
    }
  }

  visit(directory);
  return result.sort();
}

function importSpecifiers(path) {
  const source = ts.createSourceFile(
    path,
    readFileSync(path, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  const specifiers = [];

  function add(node) {
    if (node && ts.isStringLiteralLike(node)) specifiers.push(node.text);
  }

  function visit(node) {
    if (ts.isImportDeclaration(node)) {
      add(node.moduleSpecifier);
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
      add(node.moduleSpecifier);
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference)
    ) {
      add(node.moduleReference.expression);
    } else if (
      ts.isCallExpression(node) &&
      node.arguments.length === 1 &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === "require"))
    ) {
      add(node.arguments[0]);
    }
    ts.forEachChild(node, visit);
  }

  visit(source);
  return specifiers;
}

function edgegamersPackage(specifier) {
  const match = /^(@edgegamers\/[^/]+)/u.exec(specifier);
  return match?.[1];
}

function dependencyNames(packageJson) {
  return [
    ...Object.keys(packageJson.s2script?.pluginDependencies ?? {}),
    ...Object.keys(packageJson.s2script?.optionalPluginDependencies ?? {}),
    ...Object.keys(packageJson.dependencies ?? {}).filter((name) =>
      name.startsWith("@edgegamers/"),
    ),
    ...Object.keys(packageJson.devDependencies ?? {}).filter((name) =>
      name.startsWith("@edgegamers/"),
    ),
  ];
}

function canReference(sourceScope, targetScope) {
  return targetScope === "global" || sourceScope === targetScope;
}

export function validatePluginOrganization(root) {
  const plugins = readPluginPackages(root);
  const pluginByPackage = new Map(
    plugins.map((plugin) => [plugin.packageJson.name, plugin]),
  );
  const errors = [];

  for (const plugin of plugins) {
    if (plugin.scope !== "global" && plugin.scope.length < 2) {
      errors.push(`${plugin.relativePackagePath}: plugin scope must be global or a game key`);
    }

    const referenced = new Set(dependencyNames(plugin.packageJson));
    const packageDirectory = join(root, "plugins", plugin.directory);
    for (const file of sourceFiles(packageDirectory)) {
      for (const specifier of importSpecifiers(file)) {
        const packageName = edgegamersPackage(specifier);
        if (packageName && packageName !== plugin.packageJson.name) {
          referenced.add(packageName);
        }
      }
    }

    for (const packageName of referenced) {
      const target = pluginByPackage.get(packageName);
      if (!target) {
        errors.push(
          `${plugin.relativePackagePath}: references unknown EdgeGamers package ${packageName}`,
        );
        continue;
      }
      if (!canReference(plugin.scope, target.scope)) {
        errors.push(
          `${plugin.relativePackagePath}: ${plugin.scope} plugin cannot reference ${target.scope} package ${packageName}`,
        );
      }
    }
  }

  return errors.sort();
}

export function formatPluginOrganizationErrors(errors) {
  if (errors.length === 0) return "Plugin organization check passed.";
  return [
    "Plugin organization check failed:",
    ...errors.map((error) => `- ${error}`),
  ].join("\n");
}
