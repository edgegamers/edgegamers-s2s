import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export function makeWorkspace(t, files) {
  const root = mkdtempSync(join(tmpdir(), "edgegamers-layout-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const [relativePath, value] of Object.entries(files)) {
    const path = join(root, relativePath);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, typeof value === "string"
      ? value
      : `${JSON.stringify(value, null, 2)}\n`);
  }
  return root;
}

export const BASE_POLICY = {
  games: ["cs2"],
  externalScopes: {
    "@s2script/sdk": "global",
    "@s2script/cs2": "cs2",
  },
};
