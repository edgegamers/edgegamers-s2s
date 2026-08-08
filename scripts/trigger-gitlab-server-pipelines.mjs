import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

function envKeyForServer(prefix, server) {
  return `${prefix}_${server.toUpperCase().replaceAll("-", "_")}`;
}

export function buildGitLabTriggerRequests({ gitlabUrl, ref, bundles, env }) {
  const base = gitlabUrl.replace(/\/+$/u, "");
  return bundles.map((bundle) => {
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
        "variables[PLUGIN_BUNDLE_GITHUB_REPOSITORY]": env.GITHUB_REPOSITORY,
        "variables[PLUGIN_BUNDLE_GITHUB_RUN_ID]": env.GITHUB_RUN_ID,
        "variables[PLUGIN_BUNDLE_ACTIONS_ARTIFACT_NAME]": `server-bundles-${env.GITHUB_SHA}`,
        "variables[PLUGIN_BUNDLE_ARTIFACT_NAME]": bundle.artifactName,
        "variables[PLUGIN_BUNDLE_SHA256]": bundle.sha256,
      },
    };
  });
}

export async function triggerRequests({ requests, fetchImpl = fetch, write = console.log }) {
  for (const request of requests) {
    const body = new URLSearchParams(request.body);
    const response = await fetchImpl(request.url, { method: "POST", body });
    if (!response.ok) {
      throw new Error(`GitLab trigger failed for ${request.server}: HTTP ${response.status}`);
    }
    write(`Triggered ${request.server}`);
  }
}

function argValue(name, args) {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

export async function main({ root = process.cwd(), env = process.env, args = process.argv.slice(2) } = {}) {
  const environment = argValue("--environment", args) ?? env.PLUGIN_BUNDLE_ENV ?? "development";
  const ref = argValue("--ref", args) ?? (environment === "production" ? "main" : "dev");
  const gitlabUrl = env.GITLAB_URL;
  if (!gitlabUrl) throw new Error("GITLAB_URL is required");
  const bundleIndex = JSON.parse(readFileSync(join(root, "artifacts", "server-bundles", "bundles.json"), "utf8"));
  const requests = buildGitLabTriggerRequests({
    gitlabUrl,
    ref,
    bundles: bundleIndex.bundles,
    env,
  });
  await triggerRequests({ requests });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
