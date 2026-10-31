import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

test("load-window bindings compile against current SDK and reject unsupported surfaces", () => {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const result = spawnSync(process.execPath, [
    fileURLToPath(import.meta.resolve("typescript/bin/tsc")), "--project", "test/api-bindings/tsconfig.json", "--pretty", "false",
  ], { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
