# Minimal s2script plugin monorepo

Status: approved; includes the requested README and community guides.

## Intent

Maintain five edgegamers products in a small, functional repository, with one install and automatic registry releases. The recreated public repository is https://github.com/edgegamers/edgegamers-s2s. Start fresh: import current upstream source snapshots, never the old edgegamers monorepo or its Git history. Keep original attribution and licenses, and record each upstream URL and imported commit in one short `UPSTREAMS.md`.

## Products

| Directory | Upstream | Registry identity | Distribution |
| --- | --- | --- | --- |
| `plugins/ttt/` | `s2script/s2s-ttt` | `@edgegamers/ttt` | Public bundle; ten members |
| `plugins/surftimer/` | `s2script/s2s-surftimer` | `@edgegamers/surftimer` | New public bundle; core and HUD required |
| `plugins/jb/` | `s2script/s2s-jb` | `@edgegamers/jailbreak` | Public bundle; preserve optional gangperks |
| `plugins/hide/` | `ShookEagle/s2s-hide` | `@edgegamers/s2s-hide` | Public standalone plugin |
| `plugins/maul/` | `GabeHirakawa/s2s-maul` | `@edgegamers/s2s-maul` | Restricted standalone plugin |

SurfTimer's runtime members become `@edgegamers/surftimer-core` and `@edgegamers/surftimer-hud`. Update their source imports and declared interface dependencies consistently. Other publishable identities stay as upstream. MAUL source is public, while registry distribution uses `publishConfig.access: restricted`; it must remain publishable rather than `private: true`.

## Approach

Use npm and the native s2script multi-bundle workspace support, released in SDK 0.34.0. This directly follows the requested one-root structure. A nested workspace per product would require separate install/release configuration. A custom release dispatcher would duplicate native versioning, dependency ordering and publication behavior. Neither earns its maintenance cost here.

SDK 0.34.0 is available on npm. Pin the shared SDK/tool versions in the root lockfile; select compatible CS2 bindings and other development dependencies while verifying the imported source. Use Node 24 and a compatible pinned npm version. Keep Bun only if retained MAUL behavior tests require it.

## Structure and ownership

The root owns `package.json`, `package-lock.json`, `.changeset/`, and GitHub workflows. A single private root package declares npm workspaces for actual plugin/library packages and `s2script.workspace.plugins` for runtime plugins. `s2script.workspace.bundles` lists the three bundle containers.

Bundle container manifests retain identity, version, description, publication/access metadata, and native optional membership. They are not npm workspace packages and have no child workspace marker, lockfile, changeset directory or independent publisher. Their runtime members and shared libraries keep the source arrangement needed to work. Hide and MAUL are direct standalone plugin directories, with no extra wrapper package.

Keep shared libraries private and inlined where upstream does. Preserve gameplay, interfaces, configuration, translations and required assets. Move only what consolidating the workspace requires. Preserve useful upstream documentation beside its product and correct active instructions; remove superseded CI/release setup and generated/install/build outputs. Do not bring in old monorepo tooling, fixtures or policies.

Root scripts should remain direct commands: install with `npm ci`, build with `s2s build`, add changes with `changeset`, version with `s2s version` followed by lockfile refresh, and publish with `s2s deploy --ci`. A short test command may invoke retained product behavior suites. No generic repository framework, custom version planner, policy validator, or format/filename snapshot tests.

## Releases

Versions remain independent. Add changesets for changed runtime members or private libraries affecting shipped code. Native `s2s version` cascades declared dependencies and advances each affected bundle by the greatest bump among its own members. Preserve existing version baselines and add initial patch changesets for imported publishable plugins, so migration artifacts do not replace already published versions. The new SurfTimer bundle starts at 0.1.0 before its initial changeset is applied. Reconcile accessible registry metadata before finalizing these changesets; never upload during local verification.

One release workflow runs on `main` pushes and manual retry. It installs from the root lockfile, applies changesets, refreshes the lockfile, verifies the resulting build and essential tests, persists generated versions/changelogs/consumed changesets in a bot commit, and invokes `s2s deploy --ci`. The workflow uses `S2SCRIPT_TOKEN` for registry publication and GitHub's repository token for version commits. Keep the workflow small and use native publication retries: existing versions are skipped and members publish before their bundle. A failure leaves the committed release versions available for a manual retry without another version bump.

Serialize releases without canceling an active publish. Before persisting a version commit, check that `main` still matches the checked-out commit. If it advanced, stop this run and let the newer run prepare the release; never force-push. Do not require a commit-back when versioning produced no changes. Never let publishing from a stale source revision silently overwrite branch history. Configure pull-request checks to run the same essential build/tests without publishing. Workflow permissions and required token setup must be documented plainly in README.

Creating local release automation is in scope. A real registry publication is a separate final action after the completed repository and its checks are reviewable; this implementation performs no upload. GitHub labels may be added as part of the requested skill setup. The repository has no old history to preserve.

## Tests and verification

Temporary development tests and probes are allowed. Remove tests after use when they only fix a chosen implementation, folder layout, script wording, documentation text or other incidental structure. Retain tests only for essential behavior: gameplay rules, authentication/access decisions, data/configuration handling and release correctness where the repository owns custom behavior. Do not add tests that reimplement the native SDK's own guarantees.

Review inherited suites under the same rule. Keep meaningful behavioral coverage; remove incidental structural assertions rather than deleting a useful suite wholesale. Keep manual game-server smoke-test instructions for runtime behavior that cannot be demonstrated by a local build. Successful local builds/tests establish compile-time and tested behavior, not live CS2 operation.

Verify a clean root `npm ci`, all runtime plugin builds with the pinned native SDK, retained critical behavior tests, and a disposable-copy run of `s2s version` that demonstrates bundle/dependency changes and leaves the working release baselines intact. Check native deployment planning without uploading when registry access permits, and inspect MAUL's restricted access in the actual plan. Validate workflow syntax and commit-back/retry behavior with a disposable local Git repository if custom shell logic warrants it. Report missing credentials or live-only checks explicitly.

## Documentation and skills

Use a short `AGENTS.md`, one root `GLOSSARY.md`, and `docs/agents/{issue-tracker,triage-labels,domain}.md`. GitHub Issues in `edgegamers/edgegamers-s2s` is the tracker. Use default labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. Retain unrelated labels already present. Glossary terms distinguish plugin, bundle, bundle member, shared library, registry distribution and source visibility. Create ADRs only for consequential trade-offs that need enduring explanation; ordinary scaffolding does not require one.

Add a clean README using shieldcn badges, with the five products, install/build/check commands, Changesets usage and registry-token setup. Add a code of conduct, contributing guide and security policy. Keep them concise, actionable and aligned with the actual automation; do not invent reporting contacts or support commitments. Publish this agreed scope as a GitHub spec issue with `ready-for-agent` through the requested to-spec skill.

## Builder discretion

Exact source-compatible shared dependency pins, compact test invocation, small workflow mechanics, and necessary editor/build path corrections are implementation choices. Prefer existing native tooling and direct commands. Escalate only if preserving shipped behavior requires a product redesign, a source cannot be accessed, or the chosen native SDK cannot build it. No server rollout, Workshop publishing, automatic upstream synchronization, new gameplay features or old-monorepo migration work.
