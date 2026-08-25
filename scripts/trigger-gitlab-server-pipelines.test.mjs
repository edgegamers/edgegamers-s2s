import assert from "node:assert/strict";
import test from "node:test";
import {
  buildGitLabTriggerRequests,
  formatTriggerError,
  triggerRequests,
} from "./trigger-gitlab-server-pipelines.mjs";

function request(server) {
  return {
    server,
    url: `https://gitlab.example/api/v4/projects/${server}/trigger/pipeline`,
    body: { token: `${server}-token`, ref: "dev" },
  };
}

test("retries transient GitLab failures up to three attempts", async () => {
  const statuses = [503, 503, 201];
  const attempts = [];

  await triggerRequests({
    requests: [request("empty-s2s")],
    fetchImpl: async (url) => {
      attempts.push(url);
      const status = statuses.shift();
      return { ok: status >= 200 && status < 300, status };
    },
    sleepImpl: async () => {},
    write: () => {},
  });

  assert.deepEqual(attempts, [
    "https://gitlab.example/api/v4/projects/empty-s2s/trigger/pipeline",
    "https://gitlab.example/api/v4/projects/empty-s2s/trigger/pipeline",
    "https://gitlab.example/api/v4/projects/empty-s2s/trigger/pipeline",
  ]);
});

test("attempts every server when one GitLab trigger fails permanently", async () => {
  const attemptedServers = [];

  await assert.rejects(
    triggerRequests({
      requests: [request("empty-s2s"), request("ttt-s2s")],
      fetchImpl: async (url) => {
        const server = url.includes("empty-s2s") ? "empty-s2s" : "ttt-s2s";
        attemptedServers.push(server);
        return server === "empty-s2s"
          ? { ok: false, status: 400 }
          : { ok: true, status: 201 };
      },
      sleepImpl: async () => {},
      write: () => {},
    }),
    (error) => error instanceof AggregateError
      && error.message === "GitLab triggers failed for: empty-s2s",
  );

  assert.deepEqual(attemptedServers.sort(), ["empty-s2s", "ttt-s2s"]);
});

test("triggers configured servers when another server is missing credentials", async () => {
  const requests = buildGitLabTriggerRequests({
    gitlabUrl: "https://gitlab.example",
    ref: "dev",
    releaseTag: "dev-latest",
    bundles: [
      { server: "empty-s2s", environment: "development", artifactName: "empty", sha256: "aaa" },
      { server: "ttt-s2s", environment: "development", artifactName: "ttt", sha256: "bbb" },
    ],
    env: {
      GITHUB_REPOSITORY: "edgegamers/edgegamers-s2s",
      GITHUB_SHA: "abc123",
      GITLAB_PROJECT_ID_TTT_S2S: "42",
      GITLAB_TRIGGER_TOKEN_TTT_S2S: "ttt-token",
    },
  });
  const attemptedUrls = [];

  await assert.rejects(
    triggerRequests({
      requests,
      fetchImpl: async (url) => {
        attemptedUrls.push(url);
        return { ok: true, status: 201 };
      },
      sleepImpl: async () => {},
      write: () => {},
    }),
    (error) => error instanceof AggregateError
      && error.message === "GitLab triggers failed for: empty-s2s"
      && error.errors[0].message === "Missing GITLAB_PROJECT_ID_EMPTY_S2S",
  );

  assert.deepEqual(attemptedUrls, [
    "https://gitlab.example/api/v4/projects/42/trigger/pipeline",
  ]);
});

for (const status of [408, 429]) {
  test(`retries transient HTTP ${status} responses`, async () => {
    let attempts = 0;
    await triggerRequests({
      requests: [request("empty-s2s")],
      fetchImpl: async () => {
        attempts += 1;
        return attempts === 1 ? { ok: false, status } : { ok: true, status: 201 };
      },
      sleepImpl: async () => {},
      write: () => {},
    });
    assert.equal(attempts, 2);
  });
}

test("retries network exceptions", async () => {
  let attempts = 0;
  await triggerRequests({
    requests: [request("empty-s2s")],
    fetchImpl: async () => {
      attempts += 1;
      if (attempts === 1) throw new TypeError("network unavailable");
      return { ok: true, status: 201 };
    },
    sleepImpl: async () => {},
    write: () => {},
  });
  assert.equal(attempts, 2);
});

test("reports exhausted transient failures with every server-specific cause", async () => {
  await assert.rejects(
    triggerRequests({
      requests: [request("empty-s2s"), request("ttt-s2s")],
      fetchImpl: async (url) => ({
        ok: false,
        status: url.includes("empty-s2s") ? 503 : 429,
      }),
      sleepImpl: async () => {},
      write: () => {},
    }),
    (error) => error instanceof AggregateError
      && error.errors.length === 2
      && error.errors[0].message === "GitLab trigger failed for empty-s2s: HTTP 503"
      && error.errors[1].message === "GitLab trigger failed for ttt-s2s: HTTP 429",
  );
});

test("starts all server requests before any response resolves", async () => {
  const started = [];
  let releaseResponses;
  const responseGate = new Promise((resolve) => { releaseResponses = resolve; });
  const triggering = triggerRequests({
    requests: [request("empty-s2s"), request("ttt-s2s")],
    fetchImpl: async (url) => {
      started.push(url);
      await responseGate;
      return { ok: true, status: 201 };
    },
    sleepImpl: async () => {},
    write: () => {},
  });

  await Promise.resolve();
  assert.equal(started.length, 2);
  releaseResponses();
  await triggering;
});

test("formats aggregate failures with their causes", () => {
  const error = new AggregateError(
    [new Error("Missing GITLAB_PROJECT_ID_EMPTY_S2S"), new Error("GitLab trigger failed for ttt-s2s: HTTP 503")],
    "GitLab triggers failed for: empty-s2s, ttt-s2s",
  );

  assert.equal(formatTriggerError(error), [
    "GitLab triggers failed for: empty-s2s, ttt-s2s",
    "- Missing GITLAB_PROJECT_ID_EMPTY_S2S",
    "- GitLab trigger failed for ttt-s2s: HTTP 503",
  ].join("\n"));
});
