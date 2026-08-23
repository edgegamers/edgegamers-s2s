# Code Ownership and Release Governance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce team-based ownership, mandatory Changesets for explicitly public plugins, reviewed version pull requests on `dev`, and automatic Source2Script registry deployment from `main`.

**Architecture:** Workspace validation makes plugin publication state an explicit boolean invariant. Pull-request validation maps changed public plugins to pending Changesets, with one exact bot-authored version-PR exception. Changesets automation versions on `dev`; the existing protected `main` workflow deploys every eligible version and lets Source2Script skip private or already-published packages.

**Tech Stack:** Node.js 24, npm 11 workspaces, native `node:test`, Changesets CLI 2.x, `changesets/action@v1`, Source2Script CLI, GitHub Actions, GitHub CODEOWNERS.

**Spec:** `docs/superpowers/specs/2026-08-23-code-ownership-and-release-governance-design.md`

## Global Constraints

- Every plugin manifest contains exactly one explicit boolean publication marker: `"private": true` or `"private": false`.
- New plugins begin private; becoming public is a separate platform-reviewed manifest change.
- Any developer may author Changeset Markdown; `@edgegamers/s2s-maintainers` reviews normal code and Changesets.
- `@edgegamers/s2s-platform` owns critical workflow, manifest, ownership, workspace-policy, security, and release-policy files.
- Changesets accumulate and version packages on `dev`; only `main` deploys registry releases.
- Current plugins `@edgegamers/maul` and `@edgegamers/ttt` remain private fixtures.
- Use Changesets Action v1 because the repository pins `@changesets/cli` 2.31.1; do not upgrade to the Changesets v3/v2-action line in this change.
- Do not change development bundle delivery, GitLab server triggers, production server-selection behavior, or rollback ownership.
- Registry versions are immutable; recovery uses a new version or yank, never overwrite/delete.

---

### Task 1: Enforce Explicit Plugin Publication State

**Files:**
- Modify: `scripts/lib/workspace-layout.test.mjs`
- Modify: `scripts/lib/workspace-layout.mjs:102-130`
- Modify: `scripts/create-plugin.test.mjs`
- Modify: `scripts/create-plugin.mjs:76-129`
- Modify: `scripts/lib/workspace-boundary-policy.test.mjs`
- Modify: `scripts/lib/license-policy.test.mjs`
- Modify: `scripts/build-server-bundles.test.mjs`

**Interfaces:**
- Consumes: recursively discovered workspace entries from `walkManifests(rootDir)`.
- Produces: `requireValidWorkspaceLayout(rootDir)` guarantees every returned plugin has `manifest.private === true || manifest.private === false`.
- Produces: `createPlugin({ root, destination, ... })` always writes a generated plugin manifest with `private: true` before workspace validation.

- [ ] **Step 1: Install the pinned toolchain**

Run:

```powershell
npm.cmd ci
```

Expected: npm installs the lockfile exactly and exits 0.

- [ ] **Step 2: Add failing publication-state layout tests**

Add this test to `scripts/lib/workspace-layout.test.mjs`:

```js
test("requires explicit boolean publication state for plugins only", (t) => {
  const root = makeWorkspace(t, {
    "workspace-policy.json": BASE_POLICY,
    "plugins/global/private/package.json": {
      name: "@edgegamers/private",
      private: true,
    },
    "plugins/global/public/package.json": {
      name: "@edgegamers/public",
      private: false,
    },
    "plugins/global/missing/package.json": { name: "@edgegamers/missing" },
    "plugins/global/string/package.json": {
      name: "@edgegamers/string",
      private: "false",
    },
    "packages/global/shared/package.json": { name: "@edgegamers/shared" },
  });

  const result = inspectWorkspaceLayout(root);
  assert.deepEqual(result.errors, [
    "plugins/global/missing/package.json: plugin manifest requires an explicit boolean private field",
    "plugins/global/string/package.json: plugin manifest requires an explicit boolean private field",
  ]);
  assert.equal(result.byName.get("@edgegamers/private").manifest.private, true);
  assert.equal(result.byName.get("@edgegamers/public").manifest.private, false);
});
```

Make every pre-existing valid plugin fixture in that file explicit by adding `private: true`. Do not add `private` to `packages/**` fixtures. Invalid JSON and invalid path fixtures may stay unchanged when control flow rejects them before publication-state validation.

- [ ] **Step 3: Make plugin creation safety fail first**

Keep the `generatedPlugin` helper's generated manifest without a `private` field, then add this assertion to the successful global-plugin test in `scripts/create-plugin.test.mjs`:

```js
const manifest = JSON.parse(readFileSync(join(destination, "package.json"), "utf8"));
assert.equal(manifest.private, true);
```

Update existing/sentinel/invalid plugin fixtures outside `generatedPlugin` to include `private: true`, so only the generated output exercises normalization.

- [ ] **Step 4: Run the focused tests and confirm the invariant is absent**

Run:

```powershell
node --test scripts/lib/workspace-layout.test.mjs scripts/create-plugin.test.mjs
```

Expected: FAIL because omitted/non-boolean plugin state is not reported and generated output remains without `private: true`.

- [ ] **Step 5: Implement layout validation**

In `inspectWorkspaceLayout`, after validating the manifest name and before pushing the package item, add:

```js
if (entry.kind === "plugin" && typeof manifest.private !== "boolean") {
  errors.push(
    `${manifestLabel}: plugin manifest requires an explicit boolean private field`,
  );
}
```

Continue collecting the package record so error accumulation, duplicate-name detection, and deterministic sorting remain intact. `requireValidWorkspaceLayout` will reject the complete error list.

- [ ] **Step 6: Normalize new plugins to private**

Add a focused manifest rewriter beside `rewriteTsconfig` in `scripts/create-plugin.mjs`:

```js
function rewriteManifest({ destination }) {
  const manifestPath = join(destination, "package.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    throw new Error("Generated package manifest must be a JSON object");
  }
  manifest.private = true;
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}
```

Call it after copying generator output and before `rewriteTsconfig` and workspace validation:

```js
rewriteManifest({ destination: target });
rewriteTsconfig({ destination: target, root: workspaceRoot });
```

This intentionally overrides a generator default of public: creating a public plugin is a separate reviewed change.

- [ ] **Step 7: Make all valid plugin test fixtures explicit**

Apply these exact fixture rules:

- In `scripts/lib/workspace-boundary-policy.test.mjs`, have `packageFiles` add `private: true` when `directory.startsWith("plugins/")`; keep package fixtures without `private`. Add `private: true` to the three directly declared nested plugin manifests.
- In `scripts/lib/license-policy.test.mjs`, add `private: true` to both plugin manifests; leave the root and shared package unchanged.
- In `scripts/build-server-bundles.test.mjs`, add `private: true` to both plugin manifests.
- In `scripts/create-plugin.test.mjs`, add `private: true` to existing workspace plugin fixtures, but leave `generatedPlugin` without the field so normalization remains tested.
- In `scripts/lib/workspace-layout.test.mjs`, add `private: true` to every valid plugin fixture not intentionally testing missing or non-boolean state.

Use this `packageFiles` shape:

```js
function packageFiles({ directory, name, dependencies, source = "", extraManifest = {} }) {
  const publication = directory.startsWith("plugins/") ? { private: true } : {};
  return {
    [`${directory}/package.json`]: {
      name,
      ...publication,
      dependencies,
      ...extraManifest,
    },
    [`${directory}/src/index.ts`]: source,
  };
}
```

- [ ] **Step 8: Verify publication-state behavior**

Run:

```powershell
node --test scripts/lib/workspace-layout.test.mjs scripts/create-plugin.test.mjs scripts/lib/workspace-boundary-policy.test.mjs scripts/lib/license-policy.test.mjs scripts/build-server-bundles.test.mjs
npm.cmd test
```

Expected: all focused tests and the complete Node test suite PASS.

- [ ] **Step 9: Commit the invariant**

```powershell
git add scripts/lib/workspace-layout.mjs scripts/lib/workspace-layout.test.mjs scripts/create-plugin.mjs scripts/create-plugin.test.mjs scripts/lib/workspace-boundary-policy.test.mjs scripts/lib/license-policy.test.mjs scripts/build-server-bundles.test.mjs
git commit -m "feat: require explicit plugin publication state"
```

---

### Task 2: Harden Changeset Coverage and the Release-PR Exception

**Files:**
- Modify: `scripts/lib/changeset-policy.test.mjs`
- Modify: `scripts/lib/changeset-policy.mjs`
- Create: `scripts/check-changeset.test.mjs`
- Modify: `scripts/check-changeset.mjs`
- Modify: `.github/workflows/validate.yml:77-82`

**Interfaces:**
- Produces: `isTrustedVersionPullRequest({ eventName, baseRef, headRef, author }): boolean`.
- Produces: `evaluateChangesetCoverage(...)` treats only `manifest.private === false` plugins as publishable.
- Consumes: `CHANGESET_BASE_REF`, `GITHUB_EVENT_NAME`, `GITHUB_BASE_REF`, `GITHUB_HEAD_REF`, and workflow-provided `CHANGESET_PR_AUTHOR`.
- Removes: the generic `ALLOW_MISSING_CHANGESET` escape hatch.

- [ ] **Step 1: Add failing policy-unit tests**

Change the import in `scripts/lib/changeset-policy.test.mjs` and add tests for parsing, multiple-package coverage, and trust:

```js
import {
  evaluateChangesetCoverage,
  isTrustedVersionPullRequest,
  parseChangesetPackages,
} from "./changeset-policy.mjs";

test("parses covered packages and reports malformed release lines", () => {
  assert.deepEqual(parseChangesetPackages([{
    path: ".changeset/release.md",
    content: [
      "---",
      '"@edgegamers/one": patch',
      '"@edgegamers/two": minor',
      "---",
      "Release both plugins.",
      "",
    ].join("\n"),
  }]), new Set(["@edgegamers/one", "@edgegamers/two"]));

  assert.throws(() => parseChangesetPackages([{
    path: ".changeset/bad.md",
    content: "---\n\"@edgegamers/one\": huge\n---\nBad bump.\n",
  }]), /\.changeset\/bad\.md: invalid release line/u);
});

test("trusts only the exact bot-authored dev version pull request", () => {
  const expected = {
    eventName: "pull_request",
    baseRef: "dev",
    headRef: "changeset-release/dev",
    author: "github-actions[bot]",
  };
  assert.equal(isTrustedVersionPullRequest(expected), true);
  for (const [field, value] of [
    ["eventName", "workflow_dispatch"],
    ["baseRef", "main"],
    ["headRef", "changeset-release/lookalike"],
    ["author", "developer"],
  ]) {
    assert.equal(isTrustedVersionPullRequest({ ...expected, [field]: value }), false);
  }
});
```

Extend coverage with two public plugins in `changedFiles`, cover only one, and assert the other appears in `missingPackages`. Retain the prefix-collision and private-plugin cases.

- [ ] **Step 2: Add failing entry-point tests**

Create `scripts/check-changeset.test.mjs` with a helper that writes one explicit public plugin and injects deterministic git output:

```js
import assert from "node:assert/strict";
import test from "node:test";
import { main as checkChangeset } from "./check-changeset.mjs";
import { BASE_POLICY, makeWorkspace } from "./lib/test-workspace.mjs";

function runCheck(t, releaseContext) {
  const root = makeWorkspace(t, {
    "workspace-policy.json": BASE_POLICY,
    "plugins/global/public/package.json": {
      name: "@edgegamers/public",
      private: false,
    },
  });
  const output = [];
  const warnings = [];
  const errors = [];
  const exitCode = checkChangeset({
    root,
    baseRef: "origin/dev",
    releaseContext,
    git(args) {
      if (args[0] === "merge-base") return "base-sha";
      if (args[0] === "diff") return "plugins/global/public/src/plugin.ts";
      throw new Error(`Unexpected git call: ${args.join(" ")}`);
    },
    write: (line) => output.push(line),
    warn: (line) => warnings.push(line),
    error: (line) => errors.push(line),
  });
  return { exitCode, output, warnings, errors };
}

test("rejects ordinary public changes without a Changeset", (t) => {
  const result = runCheck(t, {
    eventName: "pull_request",
    baseRef: "dev",
    headRef: "feature/plugin",
    author: "developer",
  });
  assert.equal(result.exitCode, 1);
  assert.deepEqual(result.warnings, []);
  assert.deepEqual(result.errors, [
    "A Changeset is required for changed public plugins:",
    "- @edgegamers/public",
    "Run `npm run changeset` and commit the generated .changeset file.",
  ]);
});

test("allows only the trusted version pull request to consume Changesets", (t) => {
  const result = runCheck(t, {
    eventName: "pull_request",
    baseRef: "dev",
    headRef: "changeset-release/dev",
    author: "github-actions[bot]",
  });
  assert.equal(result.exitCode, 0);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.warnings, [
    "Trusted version pull request may consume Changesets for: @edgegamers/public",
  ]);
});
```

- [ ] **Step 3: Run the tests and verify trust is not implemented**

Run:

```powershell
node --test scripts/lib/changeset-policy.test.mjs scripts/check-changeset.test.mjs
```

Expected: FAIL because `isTrustedVersionPullRequest` and the `releaseContext` behavior do not exist.

- [ ] **Step 4: Implement strict public classification and bot trust**

In `scripts/lib/changeset-policy.mjs`, change publishable filtering to:

```js
const publishablePlugins = plugins.filter(
  (plugin) => plugin.manifest.private === false,
);
```

Add:

```js
export function isTrustedVersionPullRequest({
  eventName,
  baseRef,
  headRef,
  author,
}) {
  return eventName === "pull_request"
    && baseRef === "dev"
    && headRef === "changeset-release/dev"
    && author === "github-actions[bot]";
}
```

- [ ] **Step 5: Replace the generic override in the entry point**

Import `isTrustedVersionPullRequest` and replace `allowMissing` with this default argument:

```js
releaseContext = {
  eventName: process.env.GITHUB_EVENT_NAME,
  baseRef: process.env.GITHUB_BASE_REF,
  headRef: process.env.GITHUB_HEAD_REF,
  author: process.env.CHANGESET_PR_AUTHOR,
},
```

Compute trust inside `main`:

```js
const trustedVersionPullRequest = isTrustedVersionPullRequest(releaseContext);
```

Replace the override branch with:

```js
if (trustedVersionPullRequest) {
  warn(
    `Trusted version pull request may consume Changesets for: ${result.missingPackages.join(", ")}`,
  );
  return 0;
}
```

Change the failure copy to `changed public plugins` and append:

```js
error("Run `npm run changeset` and commit the generated .changeset file.");
```

Delete all `ALLOW_MISSING_CHANGESET` reads and messages.

- [ ] **Step 6: Pass trusted GitHub event identity from validation**

In `.github/workflows/validate.yml`, keep `CHANGESET_BASE_REF` and replace `ALLOW_MISSING_CHANGESET` with:

```yaml
CHANGESET_PR_AUTHOR: ${{ github.event.pull_request.user.login }}
```

`GITHUB_EVENT_NAME`, `GITHUB_BASE_REF`, and `GITHUB_HEAD_REF` are GitHub-provided runner variables; do not shadow them in step configuration.

- [ ] **Step 7: Verify Changeset enforcement**

Run:

```powershell
node --test scripts/lib/changeset-policy.test.mjs scripts/check-changeset.test.mjs
npm.cmd test
```

Expected: all tests PASS. The ordinary missing-Changeset case exits 1, and only the exact bot/dev/release branch context exits 0 with a warning.

- [ ] **Step 8: Commit Changeset enforcement**

```powershell
git add scripts/lib/changeset-policy.mjs scripts/lib/changeset-policy.test.mjs scripts/check-changeset.mjs scripts/check-changeset.test.mjs .github/workflows/validate.yml
git commit -m "feat: harden changeset release policy"
```

---

### Task 3: Add the Reviewed Version-PR and Main Registry Workflows

**Files:**
- Create: `.github/workflows/version-packages.yml`
- Modify: `.github/workflows/release.yml`
- Modify: `.changeset/config.json`
- Delete: `.changeset/spicy-lands-divide.md`

**Interfaces:**
- Consumes: pending Changeset Markdown merged into `dev`.
- Produces: bot-authored `changeset-release/dev` pull request targeting `dev`, generated by `npm run version`.
- Consumes: versioned public manifests on `main` plus protected `S2SCRIPT_TOKEN`.
- Produces: `npm run deploy -- --ci` attempt on every main release run; Source2Script decides which versions are new and eligible.

- [ ] **Step 1: Confirm the existing workflow gap**

Run:

```powershell
Select-String -Path .github/workflows/release.yml -Pattern "Detect pending Changesets|has-changesets|npm run deploy"
Select-String -Path .changeset/config.json -Pattern '"baseBranch": "main"|edgegamers-s2"'
```

Expected: the main workflow deploy is gated by pending Changeset files, the Changesets base is `main`, and the changelog repository name is missing the final `s`.

- [ ] **Step 2: Create the version-packages workflow**

Create `.github/workflows/version-packages.yml` with this complete content:

```yaml
name: Version Source2Script Packages

on:
  push:
    branches:
      - dev

permissions:
  contents: write
  pull-requests: write

concurrency:
  group: version-source2script-packages-dev
  cancel-in-progress: false

jobs:
  version:
    name: Open or update version packages PR
    runs-on: ubuntu-latest
    steps:
      - name: Check out repository
        uses: actions/checkout@v6
        with:
          fetch-depth: 0

      - name: Set up Node.js
        uses: actions/setup-node@v7
        with:
          node-version-file: .nvmrc
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Create or update version packages PR
        uses: changesets/action@v1
        with:
          version: npm run version
          commit: "chore: version Source2Script packages"
          title: "chore: version Source2Script packages"
          commitMode: github-api
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

Do not supply `publish`; this workflow versions only. Changesets v1 uses `changeset-release/dev` for a `dev` base. GitHub currently creates approval-required PR validation runs for pull requests opened or synchronized with the default token; a write-access reviewer must approve those runs.

- [ ] **Step 3: Correct Changesets configuration and remove invalid release intent**

In `.changeset/config.json`, set:

```json
"repo": "edgegamers/edgegamers-s2s"
```

and:

```json
"baseBranch": "dev"
```

Delete `.changeset/spicy-lands-divide.md`; both named plugins are explicitly private and the file cannot produce a registry release.

- [ ] **Step 4: Make main deployment version-driven instead of Changeset-file-driven**

In `.github/workflows/release.yml`:

- Remove the `outputs.has-changesets` job output.
- Remove `Detect pending Changesets`.
- Remove `Skip Source2Script deploy`.
- Remove the `if` condition from `Deploy Source2Script packages`.
- Keep `environment: production`, `S2SCRIPT_TOKEN`, and the exact command below.

The final deployment step must be:

```yaml
- name: Deploy Source2Script packages
  env:
    S2SCRIPT_TOKEN: ${{ secrets.S2SCRIPT_TOKEN }}
  run: npm run deploy -- --ci
```

Do not alter production bundle construction or GitHub release upload in this task.

- [ ] **Step 5: Review workflow safety mechanically**

Run:

```powershell
git diff --check
Select-String -Path .github/workflows/version-packages.yml -Pattern "branches:|dev|contents: write|pull-requests: write|changesets/action@v1|version: npm run version"
Select-String -Path .github/workflows/release.yml -Pattern "Detect pending Changesets|has-changesets|Skip Source2Script deploy"
Select-String -Path .github/workflows/release.yml -Pattern "environment: production|S2SCRIPT_TOKEN|npm run deploy -- --ci"
npm.cmd run changeset:status
```

Expected:

- diff check exits 0;
- the version workflow targets only `dev`, has only contents/PR write permissions, and invokes `changesets/action@v1` with `npm run version`;
- the removed main-workflow patterns return no matches;
- production protection, secret use, and unconditional deploy remain;
- Changesets status succeeds with no pending release for the private fixtures.

- [ ] **Step 6: Commit release automation**

```powershell
git add .github/workflows/version-packages.yml .github/workflows/release.yml .changeset/config.json .changeset/spicy-lands-divide.md
git commit -m "feat: automate reviewed plugin version releases"
```

---

### Task 4: Encode Team-Based Code Ownership

**Files:**
- Modify: `.github/CODEOWNERS`

**Interfaces:**
- Produces: default maintainer review for repository changes.
- Produces: platform review for critical files and every plugin manifest.
- Leaves: `.changeset/*.md` under the default maintainer owner so developers can author release intent without a platform-only gate.

- [ ] **Step 1: Replace CODEOWNERS with ordered ownership rules**

Use this complete content; order is significant because the last matching pattern wins:

```text
# Maintainers review ordinary code, tests, documentation, and Changesets.
*                                      @edgegamers/s2s-maintainers

# Platform owns repository security, ownership, and automation.
/.github/CODEOWNERS                    @edgegamers/s2s-platform
/.github/SECURITY.md                   @edgegamers/s2s-platform
/.github/workflows/                    @edgegamers/s2s-platform
/.changeset/config.json                @edgegamers/s2s-platform
/package.json                          @edgegamers/s2s-platform
/package-lock.json                     @edgegamers/s2s-platform
/workspace-policy.json                 @edgegamers/s2s-platform

# Platform owns release and workspace policy implementations.
/scripts/check-changeset.mjs           @edgegamers/s2s-platform
/scripts/check-changeset.test.mjs      @edgegamers/s2s-platform
/scripts/create-plugin.mjs             @edgegamers/s2s-platform
/scripts/create-plugin.test.mjs        @edgegamers/s2s-platform
/scripts/check-workspace-boundaries.mjs @edgegamers/s2s-platform
/scripts/lib/changeset-policy.mjs      @edgegamers/s2s-platform
/scripts/lib/changeset-policy.test.mjs @edgegamers/s2s-platform
/scripts/lib/workspace-layout.mjs      @edgegamers/s2s-platform
/scripts/lib/workspace-layout.test.mjs @edgegamers/s2s-platform
/scripts/lib/workspace-boundary-policy.mjs @edgegamers/s2s-platform
/scripts/lib/workspace-boundary-policy.test.mjs @edgegamers/s2s-platform

# Manifests control public identity, versions, dependencies, and interfaces.
/plugins/**/package.json               @edgegamers/s2s-platform
/packages/                             @edgegamers/s2s-platform
/licenses/                             @edgegamers/s2s-platform
```

Do not add `@edgegamers/s2s-developer` as an owner. Do not add a later `/.changeset/` pattern; Changeset Markdown must keep the default maintainer owner while only its configuration is platform-owned.

- [ ] **Step 2: Validate match precedence against representative paths**

Manually check the final file from top to bottom and record these expected owners in the pull-request description:

```text
plugins/cs2/ttt/src/plugin.ts                  -> s2s-maintainers
plugins/cs2/ttt/package.json                   -> s2s-platform
.changeset/example.md                          -> s2s-maintainers
.changeset/config.json                         -> s2s-platform
.github/workflows/release.yml                  -> s2s-platform
docs/releases.md                               -> s2s-maintainers
scripts/lib/changeset-policy.mjs               -> s2s-platform
```

Run:

```powershell
git diff --check
Get-Content .github/CODEOWNERS
```

Expected: no whitespace errors; the wildcard default appears before every more-specific platform rule.

- [ ] **Step 3: Commit ownership rules**

```powershell
git add .github/CODEOWNERS
git commit -m "chore: define team code ownership"
```

---

### Task 5: Write the Contributor and Administrator Release Guide

**Files:**
- Modify: `docs/releases.md`
- Modify: `docs/plugin-development.md`
- Modify: `.changeset/README.md`
- Modify: `.github/CONTRIBUTING.md`
- Modify: `.github/pull_request_template.md`
- Modify: `.github/MANUAL_SETUP.md`
- Modify: `.github/labels.yml`

**Interfaces:**
- Consumes: the implemented publication invariant, CODEOWNERS mapping, version workflow, main deployment workflow, and Source2Script publishing contract.
- Produces: one contributor flow in `docs/releases.md`, linked from shorter contributor/change-set entry points.
- Produces: an administrator checklist for teams, rulesets, workflow approval, production protection, and `S2SCRIPT_TOKEN`.

- [ ] **Step 1: Rewrite the release guide around the implemented flow**

Keep `docs/releases.md` as the canonical guide and organize it under these exact headings:

```markdown
# Changesets, ownership, and releases
## Team review responsibilities
## Private and public plugins
## When a Changeset is required
## Create and validate a Changeset
## Version-packages pull requests
## Promote and deploy
## Typed interface publication
## Failure recovery
## Server bundle boundary
```

Include all of the following concrete rules and commands:

```powershell
npm.cmd run changeset
npm.cmd run changeset:status
npm.cmd run changeset:check
npm.cmd run version
npm.cmd run deploy -- --ci
```

State explicitly:

- `private: true` is internal and exempt; `private: false` is public and enforced; omission is invalid.
- Developers author Changesets, maintainers review release intent, and platform reviews critical manifests/automation.
- Patch fixes compatibility, minor adds backward-compatible behavior, and major breaks behavior/config/interfaces.
- The bot PR is `changeset-release/dev` -> `dev`, runs `s2s version`, consumes Changesets, and never publishes.
- GitHub may show **Approve workflows to run** for the bot PR; a user with write access approves the run before required checks execute.
- `dev` -> `main` is the production promotion; `main` always invokes `s2s deploy --ci` with the production secret.
- Source2Script skips private and already-present versions.
- Registry documentation is linked as `[Publishing to the registry](https://www.s2script.com/docs/publishing)`.
- Missing token/types/version errors fail without partial overwrite; recovery is patch/minor/major follow-up or yank.
- No label or local environment variable bypasses public-plugin Changeset coverage.

- [ ] **Step 2: Correct typed-interface publication documentation**

Replace the outdated `publishes: "self"` example in `docs/plugin-development.md` with the registry shape and explicit public state:

```json
{
  "name": "@edgegamers/my-api",
  "version": "0.1.0",
  "private": false,
  "types": "api.d.ts",
  "s2script": {
    "apiVersion": "1.x",
    "publishes": {
      "@edgegamers/my-api": "0.1.0"
    }
  }
}
```

Explain that runtime-only public plugins omit `publishes` and `types`; interface publishers must keep the published interface version aligned through `s2s version` and must ship the referenced declaration file.

- [ ] **Step 3: Update contributor entry points and pull-request prompts**

In `.changeset/README.md`, link the canonical guide and state that any developer may add Changesets, but private plugins do not receive them.

In `.github/CONTRIBUTING.md`, add `npm.cmd run changeset:check` to the local validation sequence and link `docs/releases.md` before the licensing section.

Replace the pull-request release/deployment sections with:

```markdown
## Release intent

- [ ] No public plugin behavior or contract changed
- [ ] Added a patch, minor, or major Changeset for every affected public plugin
- [ ] Breaking behavior, configuration, and interfaces are documented
- [ ] Any `private: true` -> `private: false` transition is intentional

## Deployment

- [ ] No server deployment is required
- [ ] Development bundle testing is complete when applicable
- [ ] Registry publication will occur through the reviewed version PR and `main` promotion
```

- [ ] **Step 4: Update manual GitHub administration**

In `.github/MANUAL_SETUP.md`:

- List all three teams and describe `s2s-developer` as contributor access, `s2s-maintainers` as default review, and `s2s-platform` as critical ownership.
- Require both CODEOWNER teams to be visible and have explicit repository write access.
- Keep **Allow GitHub Actions to create and approve pull requests** enabled.
- Document that bot PR workflow runs enter approval-required state and a write-access user must choose **Approve workflows to run**.
- Assign the `production` environment reviewer responsibility to `s2s-platform`, restrict it to `main`, prevent self-review when team size permits, and store `S2SCRIPT_TOKEN` there.
- Keep `Source branch policy`, `Lint, typecheck, test, and build`, and `Changeset policy` required on both protected branches.
- Explain that the version PR targets `dev`, then normal promotion targets `main`.
- Remove language saying Source2Script deployment state or EdgeGamers transport is still a stub.

- [ ] **Step 5: Remove the misleading no-Changeset override label**

Delete the `no-changeset` entry from `.github/labels.yml` and remove it from the manual label list. Keep `release`, `release:hotfix`, `sync-required`, `breaking-change`, `plugin`, `shared-package`, `ci`, and `documentation`. State in the release guide that documentation/private-only changes pass because policy classifies them correctly, not because a label overrides CI.

- [ ] **Step 6: Review documentation against the actual files**

Run:

```powershell
rg -n "ALLOW_MISSING_CHANGESET|publishes.*self|intentionally stubbed|final Source2Script deployment state|no-changeset" docs .github .changeset
rg -n "private.*false|changeset-release/dev|Approve workflows to run|S2SCRIPT_TOKEN|s2script.com/docs/publishing" docs/releases.md .github/MANUAL_SETUP.md
git diff --check
```

Expected: the first search returns no stale policy/stub/override language; the second finds every required release concept; diff check exits 0.

- [ ] **Step 7: Commit the guide**

```powershell
git add docs/releases.md docs/plugin-development.md .changeset/README.md .github/CONTRIBUTING.md .github/pull_request_template.md .github/MANUAL_SETUP.md .github/labels.yml
git commit -m "docs: guide plugin ownership and releases"
```

---

### Task 6: Run Full Release-Governance Verification

**Files:**
- Verify only; modify earlier task files only when a failing check identifies a defect in this plan's implementation.

**Interfaces:**
- Consumes: all policy, workflow, ownership, and documentation deliverables from Tasks 1-5.
- Produces: a clean, reviewable branch with no pending stale Changeset and complete local verification evidence.

- [ ] **Step 1: Run the complete repository validation sequence**

Run:

```powershell
npm.cmd run workspace:check
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
npm.cmd run changeset:status
npm.cmd run changeset:check
```

Expected: every command exits 0. The final Changeset check reports no changed public plugins because the repository fixtures remain private.

- [ ] **Step 2: Recheck release and ownership invariants**

Run:

```powershell
rg -n '"private": (true|false)' plugins --glob package.json
rg --files-without-match '"private": (true|false)' plugins --glob package.json
rg -n "changesets/action@v1|version: npm run version|changeset-release/dev" .github docs scripts
rg -n "npm run deploy -- --ci|S2SCRIPT_TOKEN|environment: production" .github/workflows/release.yml docs/releases.md
git diff --check
git status --short
```

Expected:

- every plugin manifest is found by the first publication-state search;
- the missing-marker search returns no plugin manifest paths;
- version/deploy/trust strings agree across workflow, policy, and guide;
- diff check exits 0;
- status contains only intentional implementation files and no built `dist`, artifact, credential, or temporary files.

- [ ] **Step 3: Inspect the cumulative diff for scope and secret safety**

Run:

```powershell
git diff dev...HEAD --stat
git diff dev...HEAD -- .github/CODEOWNERS .github/workflows .changeset scripts docs .github/CONTRIBUTING.md .github/MANUAL_SETUP.md .github/pull_request_template.md .github/labels.yml
```

Confirm from the diff:

- no plugin is changed to `private: false`;
- no registry token or credential value appears;
- only the version workflow has `contents: write` plus `pull-requests: write`;
- the main deploy token is scoped to the protected production job;
- Changeset Markdown stays maintainer-owned;
- public manifest and critical workflow changes are platform-owned;
- development and server bundle behavior is unchanged.

- [ ] **Step 4: Commit any verification-only corrections**

If Step 1-3 required a correction, rerun the failed command and then commit only those corrections:

```powershell
git add -u
git diff --cached --check
git commit -m "fix: complete release governance validation"
```

If no correction was needed, do not create an empty commit.
