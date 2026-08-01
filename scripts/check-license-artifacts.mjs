import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateBuiltArtifacts } from "./lib/license-artifacts.mjs";

const rootDir = resolve(fileURLToPath(new URL("..", import.meta.url)));
const errors = validateBuiltArtifacts({ rootDir });

if (errors.length > 0) {
  for (const error of errors) console.error(`FAIL: ${error}`);
  process.exitCode = 1;
} else {
  console.log("PASS: built Source2Script artifacts contain the complete MIT notice");
}
