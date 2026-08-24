import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { validateWorkspaceBoundaries } from "./lib/workspace-boundary-policy.mjs";

export function main({
  root = resolve(fileURLToPath(new URL("..", import.meta.url))),
  write = console.log,
  error = console.error,
} = {}) {
  let errors;
  try {
    errors = validateWorkspaceBoundaries(root);
  } catch (exception) {
    errors = [exception instanceof Error ? exception.message : String(exception)];
  }
  if (errors.length === 0) {
    write("Workspace boundaries are valid.");
    return 0;
  }
  error("Workspace boundary check failed:");
  for (const diagnostic of errors) error(`- ${diagnostic}`);
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main();
}
