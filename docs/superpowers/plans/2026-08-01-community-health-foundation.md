# Community Health Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish the repository's `dev` integration branch and add GitHub-discoverable security, conduct, and support policies with regression coverage.

**Architecture:** `main` remains the production branch while `dev` becomes the integration base for ordinary work and Changeset comparison. Three focused Markdown files under `.github/` own security reporting, community conduct, and support routing; a Vitest policy test protects their canonical locations, confidential reporting URL, and cross-links.

**Tech Stack:** Git and GitHub branches, Markdown community health files, Contributor Covenant 2.1, Node.js 24, Vitest 4.1.10, PowerShell verification commands.

## Global Constraints

- Preserve `main` as the production and release branch.
- Use `dev` as the integration branch for ordinary development.
- Create `dev` from the current `main` so both branches begin from the same verified foundation.
- Put `SECURITY.md`, `CODE_OF_CONDUCT.md`, and `SUPPORT.md` under `.github/`.
- Use `https://www.edgegamers.com/forums/list/contact-leadership/post-thread` as the only direct confidential reporting channel.
- Never direct security or conduct reports to public issues, discussions, forum threads, or chat channels.
- Do not claim GitHub private vulnerability reporting is enabled.
- Do not invent maintainer email addresses, release schedules, supported version numbers, or response-time guarantees.
- Keep GitHub Actions, rulesets, CODEOWNERS, issue templates, pull request templates, deployment automation, governance, and RFCs out of this milestone.
- Preserve the existing contributor setup, validation, and licensing guidance.
- Follow red-green-refactor for every executable validation change.

---

## File map

- Create `.github/SECURITY.md`: supported-version boundary, confidential vulnerability reporting, requested report details, remediation, and disclosure expectations.
- Create `.github/CODE_OF_CONDUCT.md`: Contributor Covenant 2.1 adapted only at its enforcement contact, with required attribution.
- Create `.github/SUPPORT.md`: routing for documentation, repository issues, EdgeGamers help, upstream Source2Script help, vulnerabilities, and conduct incidents.
- Modify `.github/CONTRIBUTING.md`: add concise links to the three community policies without changing contribution licensing.
- Create `scripts/test/community-health.test.mjs`: verify canonical file locations, reporting routes, policy boundaries, attribution, and contributor links.

---

### Task 1: Establish and publish the development branch

**Files:**

- No repository files are created or modified.

**Interfaces:**

- Consumes: current `main` at approved design commit `6021aef` or a direct descendant containing that design.
- Produces: local `dev`, remote `origin/dev`, and upstream tracking from local `dev` to `origin/dev`.

- [ ] **Step 1: Verify the branch starting point and clean worktree**

Run:

```powershell
git status --short --branch
git branch --show-current
git rev-parse HEAD
git rev-parse main
```

Expected: the current branch is `main`; `HEAD` and `main` resolve to the same commit; no staged or unstaged files are listed.

- [ ] **Step 2: Confirm that `dev` does not already exist**

Run:

```powershell
git show-ref --verify --quiet refs/heads/dev
git ls-remote --exit-code --heads origin dev
```

Expected: both commands exit nonzero because the audit found no local or remote `dev`. If either branch exists, stop and compare its commit to `main` before changing branch state; do not overwrite an existing branch.

- [ ] **Step 3: Create local `dev` from the verified `main` commit**

Run:

```powershell
git switch -c dev main
```

Expected: Git reports a new branch named `dev` and checks it out.

- [ ] **Step 4: Verify that `dev` and `main` share the exact starting commit**

Run:

```powershell
git rev-parse dev
git rev-parse main
git diff --exit-code main...dev
```

Expected: both revisions are identical and the diff exits 0 with no output.

- [ ] **Step 5: Publish `dev` and establish upstream tracking**

Run:

```powershell
git push -u origin dev
```

Expected: Git creates `origin/dev` and reports that local `dev` tracks it.

- [ ] **Step 6: Verify the local and remote branch boundary**

Run:

```powershell
git status --short --branch
git rev-parse dev
git rev-parse origin/dev
```

Expected: status begins with `## dev...origin/dev`; both revisions are identical; the worktree is clean.

---

### Task 2: Add the confidential security policy

**Files:**

- Create: `.github/SECURITY.md`
- Create: `scripts/test/community-health.test.mjs`

**Interfaces:**

- Consumes: canonical leadership URL from the approved design.
- Produces: a GitHub-recognized security policy and reusable `readProjectFile(relativePath)` test helper.

- [ ] **Step 1: Write the failing security-policy test**

Create `scripts/test/community-health.test.mjs`:

```js
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "..", "..");
const LEADERSHIP_URL =
  "https://www.edgegamers.com/forums/list/contact-leadership/post-thread";

function readProjectFile(relativePath) {
  return readFileSync(resolve(ROOT, relativePath), "utf8");
}

describe("community health policies", () => {
  it("routes vulnerability reports through the confidential leadership form", () => {
    const security = readProjectFile(".github/SECURITY.md");

    expect(security).toContain("# Security Policy");
    expect(security).toContain("## Supported versions");
    expect(security).toContain("## Reporting a vulnerability");
    expect(security).toContain(LEADERSHIP_URL);
    expect(security).toMatch(/do not (open|report).*public GitHub issue/iu);
    expect(security).toContain("no guaranteed response or resolution time");
  });
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run:

```powershell
npm.cmd test -- scripts/test/community-health.test.mjs
```

Expected: FAIL with `ENOENT` for `.github/SECURITY.md`.

- [ ] **Step 3: Write the security policy**

Create `.github/SECURITY.md`:

```markdown
# Security Policy

## Supported versions

Security fixes are made against the latest state of `main` and, once public
plugin releases exist, the latest published version of each affected plugin.
Older commits and releases may not receive security updates.

| Version | Supported |
| --- | --- |
| Latest `main` | Yes |
| Latest published plugin release, when available | Yes |
| Older commits and releases | No |

## Reporting a vulnerability

Please report suspected vulnerabilities confidentially through the
[EdgeGamers Contact Leadership form](https://www.edgegamers.com/forums/list/contact-leadership/post-thread).

Do not open a public GitHub issue, discussion, forum thread, or chat message
for a suspected vulnerability. Public disclosure before a fix is available
can put servers and players at risk.

Include as much of the following information as you can:

- the affected plugin, package, script, or component;
- the affected release, commit, or branch;
- steps or proof of concept that reproduce the issue;
- the security impact and who could be affected;
- any known workarounds or mitigations; and
- how maintainers can contact you for follow-up.

## What to expect

Project maintainers and EdgeGamers leadership will review the report, validate
the impact, and coordinate remediation with the reporter when practical. This
community-maintained project has no guaranteed response or resolution time.

Please keep the vulnerability confidential while maintainers investigate it.
When public disclosure is appropriate, maintainers will coordinate its timing
and contents with the reporter when practical.
```

- [ ] **Step 4: Run the focused test to verify it passes**

Run:

```powershell
npm.cmd test -- scripts/test/community-health.test.mjs
```

Expected: one test passes.

- [ ] **Step 5: Commit the security policy and its regression test**

Run:

```powershell
git add .github/SECURITY.md scripts/test/community-health.test.mjs
git commit -m "docs: add confidential security policy"
```

Expected: one commit containing only the policy and its test.

---

### Task 3: Adopt Contributor Covenant 2.1

**Files:**

- Create: `.github/CODE_OF_CONDUCT.md`
- Modify: `scripts/test/community-health.test.mjs`

**Interfaces:**

- Consumes: `LEADERSHIP_URL` and `readProjectFile(relativePath)` from Task 2.
- Produces: a GitHub-recognized Contributor Covenant 2.1 policy with confidential enforcement reporting.

- [ ] **Step 1: Add the failing code-of-conduct test**

Append this test inside the existing `describe` block in `scripts/test/community-health.test.mjs`:

```js
  it("adopts Contributor Covenant 2.1 with confidential enforcement", () => {
    const conduct = readProjectFile(".github/CODE_OF_CONDUCT.md");

    expect(conduct).toContain("# Contributor Covenant Code of Conduct");
    expect(conduct).toContain("## Our Pledge");
    expect(conduct).toContain("## Enforcement Guidelines");
    expect(conduct).toContain(LEADERSHIP_URL);
    expect(conduct).toContain("Contributor Covenant, version 2.1");
    expect(conduct).toContain(
      "https://www.contributor-covenant.org/version/2/1/code_of_conduct.html",
    );
  });
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run:

```powershell
npm.cmd test -- scripts/test/community-health.test.mjs
```

Expected: the security test passes and the new test fails with `ENOENT` for `.github/CODE_OF_CONDUCT.md`.

- [ ] **Step 3: Create the code of conduct**

Create `.github/CODE_OF_CONDUCT.md` with this complete Contributor Covenant 2.1 text and the approved enforcement contact:

```markdown
# Contributor Covenant Code of Conduct

## Our Pledge

We as members, contributors, and leaders pledge to make participation in our
community a harassment-free experience for everyone, regardless of age, body
size, visible or invisible disability, ethnicity, sex characteristics, gender
identity and expression, level of experience, education, socio-economic
status, nationality, personal appearance, race, caste, color, religion, or
sexual identity and orientation.

We pledge to act and interact in ways that contribute to an open, welcoming,
diverse, inclusive, and healthy community.

## Our Standards

Examples of behavior that contributes to a positive environment for our
community include:

- Demonstrating empathy and kindness toward other people
- Being respectful of differing opinions, viewpoints, and experiences
- Giving and gracefully accepting constructive feedback
- Accepting responsibility and apologizing to those affected by our mistakes,
  and learning from the experience
- Focusing on what is best not just for us as individuals, but for the overall
  community

Examples of unacceptable behavior include:

- The use of sexualized language or imagery, and sexual attention or advances
  of any kind
- Trolling, insulting or derogatory comments, and personal or political attacks
- Public or private harassment
- Publishing others' private information, such as a physical or email address,
  without their explicit permission
- Other conduct which could reasonably be considered inappropriate in a
  professional setting

## Enforcement Responsibilities

Community leaders are responsible for clarifying and enforcing our standards
of acceptable behavior and will take appropriate and fair corrective action in
response to any behavior that they deem inappropriate, threatening, offensive,
or harmful.

Community leaders have the right and responsibility to remove, edit, or reject
comments, commits, code, wiki edits, issues, and other contributions that are
not aligned to this Code of Conduct, and will communicate reasons for
moderation decisions when appropriate.

## Scope

This Code of Conduct applies within all community spaces, and also applies when
an individual is officially representing the community in public spaces.
Examples of representing our community include using an official email address,
posting via an official social media account, or acting as an appointed
representative at an online or offline event.

## Enforcement

Instances of abusive, harassing, or otherwise unacceptable behavior may be
reported confidentially through the
[EdgeGamers Contact Leadership form](https://www.edgegamers.com/forums/list/contact-leadership/post-thread).
Do not report conduct incidents through a public GitHub issue, discussion,
forum thread, or chat message. All complaints will be reviewed and
investigated fairly, with privacy and security appropriate to the report.

All community leaders are obligated to respect the privacy and security of the
reporter of any incident.

## Enforcement Guidelines

Community leaders will follow these Community Impact Guidelines in determining
the consequences for any action they deem in violation of this Code of Conduct:

### 1. Correction

**Community Impact**: Use of inappropriate language or other behavior deemed
unprofessional or unwelcome in the community.

**Consequence**: A private, written warning from community leaders, providing
clarity around the nature of the violation and an explanation of why the
behavior was inappropriate. A public apology may be requested.

### 2. Warning

**Community Impact**: A violation through a single incident or series of
actions.

**Consequence**: A warning with consequences for continued behavior. No
interaction with the people involved, including unsolicited interaction with
those enforcing the Code of Conduct, for a specified period of time. This
includes avoiding interactions in community spaces as well as external
channels like social media. Violating these terms may lead to a temporary or
permanent ban.

### 3. Temporary Ban

**Community Impact**: A serious violation of community standards, including
sustained inappropriate behavior.

**Consequence**: A temporary ban from any sort of interaction or public
communication with the community for a specified period of time. No public or
private interaction with the people involved, including unsolicited
interaction with those enforcing the Code of Conduct, is allowed during this
period. Violating these terms may lead to a permanent ban.

### 4. Permanent Ban

**Community Impact**: Demonstrating a pattern of violation of community
standards, including sustained inappropriate behavior, harassment of an
individual, or aggression toward or disparagement of classes of individuals.

**Consequence**: A permanent ban from any sort of public interaction within the
community.

## Attribution

This Code of Conduct is adapted from the [Contributor Covenant](https://www.contributor-covenant.org),
version 2.1, available at
[https://www.contributor-covenant.org/version/2/1/code_of_conduct.html](https://www.contributor-covenant.org/version/2/1/code_of_conduct.html).

Community Impact Guidelines were inspired by
[Mozilla's code of conduct enforcement ladder](https://github.com/mozilla/diversity).

For answers to common questions about this code of conduct, see the FAQ at
[https://www.contributor-covenant.org/faq](https://www.contributor-covenant.org/faq).
Translations are available at
[https://www.contributor-covenant.org/translations](https://www.contributor-covenant.org/translations).
```

- [ ] **Step 4: Compare the policy with the official Contributor Covenant source**

Open:

```text
https://www.contributor-covenant.org/version/2/1/code_of_conduct/
```

Expected: every pledge, standards, responsibility, scope, impact, consequence, and attribution paragraph matches version 2.1; only the enforcement contact paragraph is repository-specific.

- [ ] **Step 5: Run the focused test to verify it passes**

Run:

```powershell
npm.cmd test -- scripts/test/community-health.test.mjs
```

Expected: two tests pass.

- [ ] **Step 6: Commit the conduct policy and test extension**

Run:

```powershell
git add .github/CODE_OF_CONDUCT.md scripts/test/community-health.test.mjs
git commit -m "docs: adopt project code of conduct"
```

Expected: one commit containing the conduct policy and its focused assertions.

---

### Task 4: Add support routing and contributor policy links

**Files:**

- Create: `.github/SUPPORT.md`
- Modify: `.github/CONTRIBUTING.md`
- Modify: `scripts/test/community-health.test.mjs`

**Interfaces:**

- Consumes: `.github/SECURITY.md` and `.github/CODE_OF_CONDUCT.md` from Tasks 2 and 3.
- Produces: support routing plus discoverable contributor links to all community policies.

- [ ] **Step 1: Add the failing support and contributor-link tests**

Append these tests inside the existing `describe` block in `scripts/test/community-health.test.mjs`:

```js
  it("routes support requests without duplicating confidential instructions", () => {
    const support = readProjectFile(".github/SUPPORT.md");

    expect(support).toContain("# Support");
    expect(support).toContain("../docs/navigation.md");
    expect(support).toContain("./SECURITY.md");
    expect(support).toContain("./CODE_OF_CONDUCT.md");
    expect(support).toContain("https://www.edgegamers.com/forums/");
    expect(support).toContain("https://s2script.com");
    expect(support).not.toContain(LEADERSHIP_URL);
    expect(support).toContain("no guaranteed response or resolution time");
  });

  it("links every community policy from the contributor guide", () => {
    const contributing = readProjectFile(".github/CONTRIBUTING.md");

    expect(contributing).toContain("./SECURITY.md");
    expect(contributing).toContain("./CODE_OF_CONDUCT.md");
    expect(contributing).toContain("./SUPPORT.md");
  });
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run:

```powershell
npm.cmd test -- scripts/test/community-health.test.mjs
```

Expected: the first two tests pass; support fails with `ENOENT`; contributor-link assertions fail because the links do not yet exist.

- [ ] **Step 3: Create the support policy**

Create `.github/SUPPORT.md`:

```markdown
# Support

EdgeGamers maintains this repository as a community project. Choose the route
below that best matches what you need.

## Repository documentation

Start with the [documentation navigator](../docs/navigation.md) for setup,
architecture, plugin development, validation, and release guidance. Include
the command you ran and its complete error output when asking for help.

## Repository bugs and feature requests

Use GitHub issues for reproducible bugs in this repository and focused feature
requests. Search existing issues first and include the affected plugin or
component, your Node and npm versions, reproduction steps, expected behavior,
and actual behavior.

Issue forms and templates will be added in a later repository milestone.

## EdgeGamers and Source2Script help

- For general EdgeGamers community or game-server help, use the
  [EdgeGamers forums](https://www.edgegamers.com/forums/).
- For behavior owned by the Source2Script SDK or runtime, consult the
  [Source2Script documentation](https://s2script.com) and its official support
  resources.

## Sensitive reports

- Report suspected vulnerabilities according to the
  [security policy](./SECURITY.md).
- Report harassment or other conduct incidents according to the
  [code of conduct](./CODE_OF_CONDUCT.md).

Do not disclose sensitive reports through public issues, discussions, forum
threads, or chat channels.

## Response expectations

Support is provided by community maintainers as availability permits. There
is no guaranteed response or resolution time.
```

- [ ] **Step 4: Link the policies from the contributor guide**

Insert this section in `.github/CONTRIBUTING.md` immediately before `## Contribution licensing`:

```markdown
## Community policies

Before participating, review the [code of conduct](./CODE_OF_CONDUCT.md).
Use the [support guide](./SUPPORT.md) for help, repository bugs, and feature
requests. Report suspected vulnerabilities privately by following the
[security policy](./SECURITY.md).
```

Do not alter the existing validation commands or contribution-licensing text.

- [ ] **Step 5: Run the focused tests to verify they pass**

Run:

```powershell
npm.cmd test -- scripts/test/community-health.test.mjs
```

Expected: four tests pass.

- [ ] **Step 6: Verify every relative link target exists**

Run:

```powershell
@(
  '.github/SECURITY.md',
  '.github/CODE_OF_CONDUCT.md',
  '.github/SUPPORT.md',
  '.github/CONTRIBUTING.md',
  'docs/navigation.md'
) | ForEach-Object {
  if (-not (Test-Path -LiteralPath $_)) {
    throw "Missing policy link target: $_"
  }
}
```

Expected: exit 0 with no output.

- [ ] **Step 7: Commit support routing and contributor links**

Run:

```powershell
git add .github/SUPPORT.md .github/CONTRIBUTING.md scripts/test/community-health.test.mjs
git commit -m "docs: add project support routes"
```

Expected: one commit containing the support policy, contributor links, and test extensions.

---

### Task 5: Verify the complete community health milestone

**Files:**

- Modify only files required to correct a demonstrated verification failure.

**Interfaces:**

- Consumes: branch state and every policy/test contract from Tasks 1 through 4.
- Produces: fresh evidence that the approved design is complete without unrelated changes.

- [ ] **Step 1: Check formatting and scan for placeholders or invented contacts**

Run:

```powershell
git diff --check origin/dev...HEAD
rg -n "T[B]D|T[O]DO|F[I]XME|CHANGE[M]E|example\.com|INSERT CONTACT METHO[D]" .github scripts/test/community-health.test.mjs
rg -n "@[A-Za-z0-9.-]+\.[A-Za-z]{2,}" .github/SECURITY.md .github/CODE_OF_CONDUCT.md .github/SUPPORT.md
```

Expected: `git diff --check` exits 0. Both `rg` scans exit 1 with no matches because the files contain no placeholders or invented email contacts.

- [ ] **Step 2: Verify sensitive and public routing boundaries**

Run:

```powershell
rg -n "https://www.edgegamers.com/forums/list/contact-leadership/post-thread" .github/SECURITY.md .github/CODE_OF_CONDUCT.md
rg -n "public GitHub issue|public issues|public issue" .github/SECURITY.md .github/CODE_OF_CONDUCT.md .github/SUPPORT.md
rg -n "\.\/SECURITY\.md|\.\/CODE_OF_CONDUCT\.md|\.\/SUPPORT\.md" .github/CONTRIBUTING.md .github/SUPPORT.md
```

Expected: the leadership URL appears in security and conduct policies; every policy rejects public sensitive reports; support and contributing contain their intended relative links.

- [ ] **Step 3: Run the complete automated quality gate**

Run each command separately:

```powershell
npm.cmd run lint
```

```powershell
npm.cmd run typecheck
```

```powershell
npm.cmd test
```

Expected: lint and type checking exit 0; all pre-existing tests plus four community-health tests pass.

- [ ] **Step 4: Verify Source2Script build and artifact licensing**

Run:

```powershell
npm.cmd run build
```

Expected: both reference plugins build in dependency order; repository and artifact licensing checks pass. If Windows reports a transient `EBUSY` on an ignored `.s2sp` artifact, verify no Node process remains, wait for the external file handle to clear, and rerun the identical command without modifying source.

- [ ] **Step 5: Verify the development manifest**

Run:

```powershell
npm.cmd run manifest:dev
Get-Content -Raw artifacts/development-manifest.json
```

Expected: the manifest lists both reference artifacts once with `dev.<short-sha>` revisions and 64-character SHA-256 digests. The generated manifest remains ignored.

- [ ] **Step 6: Verify Changeset comparison against the published development base**

Run:

```powershell
npm.cmd run changeset:check
```

Expected: exit 0 with `No publishable plugin changes detected.` because this milestone changes repository policies and tests, not a publishable plugin.

- [ ] **Step 7: Audit branch state and unintended changes**

Run:

```powershell
git branch --show-current
git status --short --branch
git log --oneline --decorate origin/dev..HEAD
git diff --stat origin/dev...HEAD
git check-ignore -v artifacts/development-manifest.json plugins/reference-api/dist/_edgegamers_reference-api.s2sp plugins/reference-consumer/dist/_edgegamers_reference-consumer.s2sp
```

Expected: current branch is `dev`; only the three intentional implementation commits appear above `origin/dev`; the diff contains the three policies, contributor guide, and community-health test; generated artifacts are ignored; no staged or unstaged files remain.

- [ ] **Step 8: Record the verified handoff**

Do not create an empty verification commit. Report:

```text
Branch: dev (tracking origin/dev)
Policies: SECURITY.md, CODE_OF_CONDUCT.md, SUPPORT.md
Confidential route: EdgeGamers Contact Leadership
Verification: lint, typecheck, tests, build, manifest, Changeset policy
Deferred: GitHub Actions, rulesets, CODEOWNERS, templates, deployment automation
```

Leave the verified implementation commits local on `dev` unless the user explicitly asks to push them or open a pull request.
