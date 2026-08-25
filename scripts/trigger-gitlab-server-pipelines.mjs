import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

function envKeyForServer(prefix, server) {
  return `${prefix}_${server.toUpperCase().replaceAll("-", "_")}`;
}

function normalizeHttpUrl(url) {
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//iu.test(url) ? url : `https://${url}`;
  return withScheme.replace(/\/+$/u, "");
}

function releaseAssetUrl({ githubServerUrl, repository, releaseTag, artifactName }) {
  const base = normalizeHttpUrl(githubServerUrl);
  return `${base}/${repository}/releases/download/${encodeURIComponent(releaseTag)}/${encodeURIComponent(`${artifactName}.zip`)}`;
}

export function buildGitLabTriggerRequests({ gitlabUrl, ref, releaseTag, bundles, env }) {
  const base = normalizeHttpUrl(gitlabUrl);
  const repository = env.GITHUB_REPOSITORY;
  if (!repository) throw new Error("GITHUB_REPOSITORY is required");
  if (!releaseTag) throw new Error("releaseTag is required");

  return bundles.map((bundle) => ({
    server: bundle.server,
    create() {
      const projectId = env[envKeyForServer("GITLAB_PROJECT_ID", bundle.server)];
      const token = env[envKeyForServer("GITLAB_TRIGGER_TOKEN", bundle.server)];
      if (!projectId) throw new Error(`Missing ${envKeyForServer("GITLAB_PROJECT_ID", bundle.server)}`);
      if (!token) throw new Error(`Missing ${envKeyForServer("GITLAB_TRIGGER_TOKEN", bundle.server)}`);
      return {
        server: bundle.server,
        url: `${base}/api/v4/projects/${encodeURIComponent(projectId)}/trigger/pipeline`,
        body: {
          token,
          ref,
          "variables[PLUGIN_BUNDLE_SERVER]": bundle.server,
          "variables[PLUGIN_BUNDLE_ENV]": bundle.environment,
          "variables[PLUGIN_BUNDLE_COMMIT]": env.GITHUB_SHA,
          "variables[PLUGIN_BUNDLE_URL]": releaseAssetUrl({
            githubServerUrl: env.GITHUB_SERVER_URL ?? "https://github.com",
            repository,
            releaseTag,
            artifactName: bundle.artifactName,
          }),
          "variables[PLUGIN_BUNDLE_ARTIFACT_NAME]": bundle.artifactName,
          "variables[PLUGIN_BUNDLE_SHA256]": bundle.sha256,
        },
      };
    },
  }));
}

function isTransientStatus(status) {
  return status === 408 || status === 429 || status >= 500;
}

function defaultSleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function triggerRequest({ request, fetchImpl, sleepImpl, maxAttempts, write }) {
  const resolvedRequest = typeof request.create === "function" ? request.create() : request;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetchImpl(resolvedRequest.url, {
        method: "POST",
        body: new URLSearchParams(resolvedRequest.body),
      });
      if (response.ok) {
        write(`Triggered ${resolvedRequest.server}`);
        return;
      }
      if (!isTransientStatus(response.status) || attempt === maxAttempts) {
        throw new Error(`GitLab trigger failed for ${resolvedRequest.server}: HTTP ${response.status}`);
      }
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("GitLab trigger failed")) {
        throw error;
      }
      if (attempt === maxAttempts) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(`GitLab trigger failed for ${resolvedRequest.server}: ${detail}`, { cause: error });
      }
    }
    await sleepImpl(250 * attempt);
  }
}

export function formatTriggerError(error) {
  const message = error instanceof Error ? error.message : String(error);
  if (!(error instanceof AggregateError)) return message;
  return [
    message,
    ...error.errors.map((cause) => `- ${cause instanceof Error ? cause.message : String(cause)}`),
  ].join("\n");
}

export async function triggerRequests({
  requests,
  fetchImpl = fetch,
  sleepImpl = defaultSleep,
  maxAttempts = 3,
  write = console.log,
}) {
  const results = await Promise.allSettled(requests.map((request) => triggerRequest({
    request,
    fetchImpl,
    sleepImpl,
    maxAttempts,
    write,
  })));
  const failures = results.flatMap((result, index) => result.status === "rejected"
    ? [{ server: requests[index].server, reason: result.reason }]
    : []);
  if (failures.length > 0) {
    throw new AggregateError(
      failures.map(({ reason }) => reason),
      `GitLab triggers failed for: ${failures.map(({ server }) => server).join(", ")}`,
    );
  }
}

function argValue(name, args) {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

export async function main({ root = process.cwd(), env = process.env, args = process.argv.slice(2) } = {}) {
  const environment = argValue("--environment", args) ?? env.PLUGIN_BUNDLE_ENV ?? "development";
  const ref = argValue("--ref", args) ?? (environment === "production" ? "main" : "dev");
  const releaseTag = argValue("--release-tag", args) ?? env.PLUGIN_BUNDLE_RELEASE_TAG ?? (environment === "production" ? "latest" : "dev-latest");
  const gitlabUrl = env.GITLAB_URL;
  if (!gitlabUrl) throw new Error("GITLAB_URL is required");
  const bundleIndex = JSON.parse(readFileSync(join(root, "artifacts", "server-bundles", "bundles.json"), "utf8"));
  const requests = buildGitLabTriggerRequests({
    gitlabUrl,
    ref,
    releaseTag,
    bundles: bundleIndex.bundles,
    env,
  });
  await triggerRequests({ requests });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(formatTriggerError(error));
    process.exitCode = 1;
  });
}
