import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateRepositoryPolicy } from "./lib/repository-policy.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const errors = validateRepositoryPolicy(root);

if (errors.length > 0) {
  for (const error of errors) console.error(`FAIL: ${error}`);
  process.exitCode = 1;
} else {
  console.log("PASS: repository plugin/server policy is consistent");
}
