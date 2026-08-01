import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateRepositoryLicensing } from "./lib/license-policy.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const errors = validateRepositoryLicensing(root);

if (errors.length > 0) {
  for (const error of errors) console.error(`FAIL: ${error}`);
  process.exitCode = 1;
} else {
  console.log("PASS: repository licensing metadata and notices are consistent");
}
