# Batch dev releases

## Agreement

The user selected feature branches into `dev`, automatic dev-server testing, then one `dev` to `main` promotion of all accumulated work. Builds and behavior tests cover the workspace; new versions belong only to affected plugins, necessary dependents, and their bundles. CODEOWNERS and branch-review policy are a later conversation. The user requested implementation and specified restart webhooks rather than direct Pelican API control.

## Approaches

Batch promotion was selected for its single feature PR and simple release decision. Individual feature promotion requires two PRs, retained feature branches, dependency tracking, and more conflict handling; it was explicitly declined. Republishing every package on every push would avoid change selection but unnecessarily versions and reloads unrelated products; it was also declined.

## Constraints

- Keep one root npm/s2s workspace and one lockfile. Native s2s owns version calculation, builds, dependency ordering, bundles, and registry uploads.
- Keep MAUL registry distribution restricted. Preserve existing bundle members and optional members.
- Keep prerelease edits and temporary changesets in CI only. Stable changesets remain on `dev` for promotion into `main`.
- Successful dev publication precedes restart webhooks. A failed publication cannot restart servers or advance the successful source baseline.
- Webhook URLs are GitHub secrets. This repository supplies the caller; creating the actual Pelican restart receivers remains external setup.
- Production installation remains an operator action. Stable publication does not restart production.

## Branches and promotion

Feature branches start from `dev` and target `dev`. PR checks run for `dev` and `main`. A manual Promote dev workflow opens or reuses a `dev` to `main` PR. That PR is the batch review boundary and uses a merge commit. The release workflow publishes stable versions as today, then merges the resulting `main` into `dev`. A conflict or rejected push fails without force pushing or silently resolving code. An existing ahead `dev` is preserved. If `dev` does not yet exist, initialization creates it from the successful stable head.

GitHub's ordinary workflow token does not trigger follow-on workflows for its own pushes. The synchronization path therefore explicitly dispatches dev validation/release after a successful branch update, or uses a configured automation token when required by repository policy. Feature PRs may squash; promotions and back-merges preserve ancestry.

## Dev releases

Release jobs serialize with stable publication and operate on a specific checked-out commit. They compare source changes with the last successfully published dev baseline, including changes accumulated through failed runs. Root build/runtime tooling changes can invalidate all plugins; documentation-only changes create no plugin release. Private shared libraries invalidate their consumers. Changesets record stable release intent, while CI supplies automatic dev change selection to the native command.

The user authorized including native snapshot support upstream. SDK 0.35.0 does not supply that complete operation; a snapshot-capable SDK release and a root dependency update are required before activation. The repository must not emulate the native version planner, patch bundled installed CLI output, publish stable-numbered dev bundles, or silently advertise prerelease flags that the installed SDK ignores.

Dev jobs retain source identity and publication results for reproducible retries. A retry of the same source uses the same dev versions. Snapshot IDs use the source's Git commit count and hash, so failed uploads are deterministic even before a successful checkpoint exists. Native snapshots use `0.0.0-dev…`, sort below stable versions and retain authored interface versions. Each affected bundle pins exact member versions, including unchanged preceding snapshots. Dev server ranges explicitly select prereleases; a real registry/server startup update remains an activation check.

## Restart hooks

After an entire dev release succeeds, POST a JSON event containing the source SHA, repository, workflow run URL, and released package versions to the configured HTTPS restart endpoints. Reject malformed configuration before sending anything, do not follow redirects with secret URLs, bound request duration, and report failures without printing URLs or response bodies. Atomically preserve each published event in an immutable `dev-release/<source>` tag alongside the leased successful-source checkpoint. The manual Restart dev workflow can replay that event after later no-op commits without rebuilding or publishing. With no endpoints configured, report publication as complete and restart integration as unconfigured. Servers update on startup through the native `plugins.json`/lock machinery supplied by s2script and preserved by the egg.

## Verification

Keep behavior tests for Git history safety, retry behavior, stable/dev separation, affected package selection, bundle versions, publication ordering, and hook request/error behavior. Use disposable Git repositories and injected HTTP/command boundaries rather than real releases or server restarts. Run the root build and retained suites. Report required secrets, unverified live registry/server behavior, and any upstream release prerequisite explicitly.
