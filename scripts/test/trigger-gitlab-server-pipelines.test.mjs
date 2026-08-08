import { describe, expect, it } from "vitest";
import { buildGitLabTriggerRequests } from "../trigger-gitlab-server-pipelines.mjs";

describe("buildGitLabTriggerRequests", () => {
  it("creates one GitLab trigger request per configured server bundle", () => {
    const requests = buildGitLabTriggerRequests({
      gitlabUrl: "https://gitlab.example.test",
      ref: "dev",
      bundles: [
        {
          server: "ttt-s2s",
          environment: "development",
          artifactName: "ttt-s2s-development",
          sha256: "a".repeat(64),
        },
      ],
      env: {
        GITHUB_REPOSITORY: "edgegamers/edgegamers-s2s",
        GITHUB_RUN_ID: "12345",
        GITHUB_SHA: "abcdef",
        GITLAB_PROJECT_ID_TTT_S2S: "42",
        GITLAB_TRIGGER_TOKEN_TTT_S2S: "secret",
      },
    });

    expect(requests).toEqual([
      {
        server: "ttt-s2s",
        url: "https://gitlab.example.test/api/v4/projects/42/trigger/pipeline",
        body: {
          token: "secret",
          ref: "dev",
          "variables[PLUGIN_BUNDLE_SERVER]": "ttt-s2s",
          "variables[PLUGIN_BUNDLE_ENV]": "development",
          "variables[PLUGIN_BUNDLE_COMMIT]": "abcdef",
          "variables[PLUGIN_BUNDLE_GITHUB_REPOSITORY]": "edgegamers/edgegamers-s2s",
          "variables[PLUGIN_BUNDLE_GITHUB_RUN_ID]": "12345",
          "variables[PLUGIN_BUNDLE_ACTIONS_ARTIFACT_NAME]": "server-bundles-abcdef",
          "variables[PLUGIN_BUNDLE_ARTIFACT_NAME]": "ttt-s2s-development",
          "variables[PLUGIN_BUNDLE_SHA256]": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        },
      },
    ]);
  });
});
