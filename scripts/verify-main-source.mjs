import { pathToFileURL } from "node:url";
import { evaluateMainSourcePolicy } from "./lib/main-source-policy.mjs";

export function main({
  baseRef = process.env.GITHUB_BASE_REF,
  headRef = process.env.GITHUB_HEAD_REF,
  allowHotfix = process.env.ALLOW_HOTFIX === "true",
  write = console.log,
  error = console.error,
} = {}) {
  const result = evaluateMainSourcePolicy({ baseRef, headRef, allowHotfix });

  if (result.allowed) {
    write(result.message);
    return 0;
  }

  error(result.message);
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main();
}
