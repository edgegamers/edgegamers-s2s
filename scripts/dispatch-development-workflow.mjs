import { pathToFileURL } from "node:url";

export async function dispatchDevelopmentWorkflow({
  env = process.env,
  fetchImpl = fetch,
  write = console.log,
} = {}) {
  const repository = env.GITHUB_REPOSITORY;
  const token = env.GITHUB_TOKEN;
  if (!repository || !/^[^/]+\/[^/]+$/u.test(repository)) {
    throw new Error("GITHUB_REPOSITORY must be an owner/name pair");
  }
  if (!token) throw new Error("GITHUB_TOKEN is required");

  const apiUrl = (env.GITHUB_API_URL ?? "https://api.github.com").replace(/\/+$/u, "");
  const response = await fetchImpl(
    `${apiUrl}/repos/${repository}/actions/workflows/deploy-dev.yml/dispatches`,
    {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({ ref: "dev" }),
    },
  );
  if (!response.ok) {
    throw new Error(`Development workflow dispatch failed: HTTP ${response.status}`);
  }
  write("Dispatched deploy-dev.yml on dev.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  dispatchDevelopmentWorkflow().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
