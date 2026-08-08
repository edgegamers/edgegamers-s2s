import { pathToFileURL } from "node:url";
import {
  formatPluginOrganizationErrors,
  validatePluginOrganization,
} from "./lib/plugin-organization.mjs";

export function main({
  root = process.cwd(),
  write = console.log,
  error = console.error,
} = {}) {
  const errors = validatePluginOrganization(root);
  const message = formatPluginOrganizationErrors(errors);
  if (errors.length === 0) {
    write(message);
    return 0;
  }

  error(message);
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main();
}
