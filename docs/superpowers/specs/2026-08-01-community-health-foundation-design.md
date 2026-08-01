# EdgeGamers community health foundation design

**Status:** Approved for implementation planning

**Date:** 2026-08-01

**Milestone:** Development branch and community health policies

## Goal

Preserve the intended `dev` to `main` promotion model and give contributors
clear, GitHub-discoverable policies for security reports, community conduct,
and project support.

This milestone establishes the missing development branch and adds three
focused community health files under `.github/`. It also connects those files
to the existing contributor guide. GitHub Actions, branch protection rules,
issue forms, pull request templates, deployment automation, and broader
governance remain later milestones.

## Constraints

- Preserve `main` as the production and release branch.
- Use `dev` as the integration branch for ordinary development.
- Create `dev` from the current `main` so both branches begin from the same
  verified foundation.
- Put repository-specific community health files under `.github/`, a location
  recognized by GitHub for `SECURITY.md`, `CODE_OF_CONDUCT.md`, and
  `SUPPORT.md`.
- Route confidential security and conduct reports through the EdgeGamers
  [Contact Leadership form](https://www.edgegamers.com/forums/list/contact-leadership/post-thread).
- Never direct sensitive reports to a public GitHub issue, discussion, forum
  thread, or chat channel.
- Do not publish a response-time service-level agreement that maintainers may
  be unable to meet.
- Keep support boundaries honest: repository maintainers can address this
  project's source, build, and documentation, but cannot promise support for
  unrelated Source2Script, game-server, or EdgeGamers infrastructure issues.

## Branch model

The repository uses a two-stage promotion flow:

1. Feature and maintenance branches target `dev`.
2. Validation runs before changes enter `dev`.
3. Release-ready changes are promoted from `dev` to `main`.
4. Production versioning and deployment originate from `main`.
5. Urgent fixes made from `main` must be synchronized back into `dev`.

This milestone creates and publishes `dev`; configuring GitHub rulesets and
automation for the flow is intentionally deferred. Once `origin/dev` exists,
the existing Changeset coverage CLI can use its intended default base
reference.

## Community health files

### Security policy

`.github/SECURITY.md` will:

- define currently supported code as the latest state of `main` and the latest
  published plugin versions, once public releases exist;
- state that older code may not receive security fixes;
- direct reporters to the confidential Contact Leadership form;
- explicitly prohibit public vulnerability reports;
- request actionable information such as the affected plugin or component,
  version or commit, reproduction steps, impact, and any known mitigation;
- explain that maintainers will validate the report, coordinate remediation,
  and agree on public disclosure with the reporter when disclosure is
  appropriate; and
- avoid guarantees about acknowledgment or resolution times.

### Code of conduct

`.github/CODE_OF_CONDUCT.md` will adopt Contributor Covenant version 2.1 with
its required attribution. It will:

- apply to repository discussions, issues, pull requests, reviews, and other
  project spaces;
- describe expected and unacceptable behavior;
- assign enforcement to project and EdgeGamers community leadership;
- direct confidential incident reports to the Contact Leadership form; and
- state that reports will be reviewed fairly and with appropriate privacy.

The policy will not invent a public enforcement email address or expose report
details through ordinary GitHub issues.

### Support policy

`.github/SUPPORT.md` will route requests by type:

- setup, architecture, plugin-development, and release questions first go to
  the repository documentation;
- reproducible repository bugs and focused feature requests may use GitHub
  issues; structured issue templates remain a later milestone;
- general EdgeGamers community or server help goes to the EdgeGamers forums;
- upstream Source2Script behavior goes to the official Source2Script resources;
- vulnerabilities and conduct incidents go only to the confidential Contact
  Leadership form.

The file will set expectations that support is community-maintained and does
not carry guaranteed response or resolution times.

## Contributor guide integration

`.github/CONTRIBUTING.md` will receive a short policy section linking to the
security policy, code of conduct, and support policy. The existing setup,
validation, and contribution-licensing guidance remains intact.

The three files must also link to one another where routing could otherwise be
ambiguous. For example, the support policy sends vulnerabilities to the
security policy instead of duplicating disclosure instructions.

## Error prevention and content boundaries

- All internal repository links use relative paths so they work in forks and
  local clones.
- The leadership form uses the canonical HTTPS URL supplied by EdgeGamers.
- Public reporting routes are clearly separated from confidential routes.
- No policy claims that GitHub private vulnerability reporting is enabled.
- No unsupported version number, release cadence, maintainer email, or response
  deadline is invented.
- Contributor Covenant text and attribution remain faithful to version 2.1.

## Verification

The milestone is complete when fresh evidence demonstrates that:

- local `dev` starts at the current `main` commit and `origin/dev` exists;
- `.github/SECURITY.md`, `.github/CODE_OF_CONDUCT.md`, and
  `.github/SUPPORT.md` exist with the canonical names GitHub recognizes;
- every confidential-reporting link targets the Contact Leadership form;
- the security policy does not direct vulnerabilities to public issues;
- the contributor guide links to all three policies;
- Markdown contains no placeholders, invented contacts, or broken relative
  links;
- repository linting, type checking, tests, and Source2Script build still pass;
  and
- the working tree contains no unintended changes.

## Deferred work

- GitHub Actions validation, development artifact, release, and hotfix
  workflows;
- `dev` and `main` branch protection or rulesets;
- CODEOWNERS;
- issue and pull request templates;
- GitHub environments, secrets, and deployment approvals;
- development artifact upload, rollout, reconciliation, and rollback;
- production release automation; and
- formal governance and RFC processes.

## References

- [GitHub: Creating a default community health file](https://docs.github.com/en/communities/setting-up-your-project-for-healthy-contributions/creating-a-default-community-health-file)
- [GitHub: Adding a security policy](https://docs.github.com/en/code-security/how-tos/report-and-fix-vulnerabilities/configure-vulnerability-reporting/add-security-policy)
- [GitHub: Adding support resources](https://docs.github.com/en/communities/setting-up-your-project-for-healthy-contributions/adding-support-resources-to-your-project)
- [GitHub: Adding a code of conduct](https://docs.github.com/en/communities/setting-up-your-project-for-healthy-contributions/adding-a-code-of-conduct-to-your-project)
- [Contributor Covenant 2.1](https://www.contributor-covenant.org/version/2/1/code_of_conduct/)
