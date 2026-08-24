import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";
import { validateWorkspaceBoundaries } from "./lib/workspace-boundary-policy.mjs";
import { loadWorkspacePolicy } from "./lib/workspace-layout.mjs";

const SEGMENT_PATTERN = /^[a-z0-9][a-z0-9._-]*$/u;

export function parsePluginDestination(destination, policy) {
  if (typeof destination !== "string" || destination.length === 0) {
    throw new Error("plugin destination must be a non-empty relative path");
  }
  if (isAbsolute(destination)) {
    throw new Error("plugin destination must be relative");
  }

  const segments = destination.replaceAll("\\", "/").split("/");
  if (segments.some((segment) => !SEGMENT_PATTERN.test(segment))) {
    throw new Error("plugin destination contains an invalid path segment");
  }
  if (segments.length < 2) {
    throw new Error("plugin destination requires a scope and package name");
  }

  const scope = segments[0];
  if (scope !== "global" && !policy.games.has(scope)) {
    throw new Error(`unknown game scope ${scope}`);
  }
  return { scope, segments, name: segments.at(-1) };
}

export function defaultGenerateArgs({ root, name, game }) {
  const cli = join(root, "node_modules", "@s2script", "sdk", "dist", "cli.js");
  return [
    cli,
    "create",
    name,
    "--game",
    game ?? "none",
    "--no-install",
    "--yes",
  ];
}

function stageGeneratorWorkspace(temporaryRoot) {
  writeFileSync(join(temporaryRoot, "package.json"), `${JSON.stringify({
    private: true,
    workspaces: ["plugins/*"],
    s2script: { workspace: { plugins: ["plugins/*"] } },
  }, null, 2)}\n`);
  writeFileSync(join(temporaryRoot, "tsconfig.base.json"), `${JSON.stringify({
    compilerOptions: {},
  }, null, 2)}\n`);
}

export function defaultGenerate({ root, temporaryRoot, name, game, execFile = execFileSync }) {
  stageGeneratorWorkspace(temporaryRoot);
  const args = defaultGenerateArgs({ root, name, game });
  execFile(process.execPath, args, { cwd: temporaryRoot, stdio: "inherit" });
  renameSync(join(temporaryRoot, "plugins", name), join(temporaryRoot, name));
}

function rewriteManifest({ destination }) {
  const manifestPath = join(destination, "package.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    throw new Error("Generated package manifest must be a JSON object");
  }
  manifest.private = true;
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

function rewriteTsconfig({ destination, root }) {
  const tsconfigPath = join(destination, "tsconfig.json");
  const parsed = ts.parseConfigFileTextToJson(tsconfigPath, readFileSync(tsconfigPath, "utf8"));
  if (parsed.error) {
    throw new Error(`Unable to parse generated tsconfig: ${ts.flattenDiagnosticMessageText(parsed.error.messageText, "\n")}`);
  }
  if (!parsed.config || typeof parsed.config !== "object" || Array.isArray(parsed.config)) {
    throw new Error("Generated tsconfig must be a JSON object");
  }
  parsed.config.extends = relative(destination, join(root, "tsconfig.base.json")).replaceAll("\\", "/");
  writeFileSync(tsconfigPath, `${JSON.stringify(parsed.config, null, 2)}\n`);
}

export function createPlugin({ root, destination, generate = defaultGenerate, copy = cpSync }) {
  const workspaceRoot = resolve(root);
  const policy = loadWorkspacePolicy(workspaceRoot);
  const parsed = parsePluginDestination(destination, policy);
  const target = resolve(workspaceRoot, "plugins", ...parsed.segments);
  if (existsSync(target)) {
    throw new Error(`plugin destination already exists: ${destination}`);
  }

  let temporaryRoot;
  let destinationCreated = false;
  try {
    temporaryRoot = mkdtempSync(join(tmpdir(), "edgegamers-create-plugin-"));
    generate({
      root: workspaceRoot,
      temporaryRoot,
      name: parsed.name,
      game: parsed.scope === "global" ? undefined : parsed.scope,
    });

    const generatedRoot = join(temporaryRoot, parsed.name);
    if (!existsSync(join(generatedRoot, "package.json"))) {
      throw new Error(`generator did not create ${parsed.name}/package.json`);
    }

    mkdirSync(dirname(target), { recursive: true });
    mkdirSync(target);
    destinationCreated = true;
    for (const entry of readdirSync(generatedRoot)) {
      copy(join(generatedRoot, entry), join(target, entry), {
        recursive: true,
        errorOnExist: true,
        force: false,
      });
    }
    rewriteManifest({ destination: target });
    rewriteTsconfig({ destination: target, root: workspaceRoot });

    const errors = validateWorkspaceBoundaries(workspaceRoot);
    if (errors.length > 0) {
      throw new Error(`Workspace boundary validation failed:\n- ${errors.join("\n- ")}`);
    }
  } catch (error) {
    if (destinationCreated) rmSync(target, { recursive: true, force: true });
    throw error;
  } finally {
    if (temporaryRoot) rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

export function main({
  args = process.argv.slice(2),
  root = resolve(fileURLToPath(new URL("..", import.meta.url))),
  error = console.error,
} = {}) {
  try {
    if (args.length !== 1) throw new Error("exactly one plugin destination is required");
    createPlugin({ root, destination: args[0] });
    return 0;
  } catch (caught) {
    error(caught.message);
    error("Usage: npm run create:plugin -- <global-or-game>/<arbitrary folders>/<plugin-name>");
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main();
}
