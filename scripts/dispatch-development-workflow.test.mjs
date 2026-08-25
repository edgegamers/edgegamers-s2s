import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import test from "node:test";

test("dispatches the development artifact workflow on dev", async (t) => {
  let received;
  const server = createServer((request, response) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      received = {
        method: request.method,
        url: request.url,
        authorization: request.headers.authorization,
        contentType: request.headers["content-type"],
        body: Buffer.concat(chunks).toString("utf8"),
      };
      response.writeHead(204).end();
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const address = server.address();

  const result = await new Promise((resolve) => {
    const child = spawn(process.execPath, ["scripts/dispatch-development-workflow.mjs"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        GITHUB_API_URL: `http://127.0.0.1:${address.port}`,
        GITHUB_REPOSITORY: "edgegamers/edgegamers-s2s",
        GITHUB_TOKEN: "test-token",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (code) => resolve({ code, stderr }));
  });

  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(received, {
    method: "POST",
    url: "/repos/edgegamers/edgegamers-s2s/actions/workflows/deploy-dev.yml/dispatches",
    authorization: "Bearer test-token",
    contentType: "application/json",
    body: '{"ref":"dev"}',
  });
});
