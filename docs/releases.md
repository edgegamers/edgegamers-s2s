# Feature to production

Feature branches go into `dev`. Successful dev releases contain the changes since the last successful publication and update the test servers through restart webhooks. A `dev` to `main` PR promotes all accumulated work together. Only affected plugins, necessary dependents and bundles receive new versions.

## Make a change

From the repository root:

```bash
git switch dev
git pull --ff-only
git switch -c codex/my-change
npm ci
# Make the change.
npm run check
npm run changeset
git add <changed-files> .changeset
git commit -m "fix: describe the change"
git push -u origin codex/my-change
gh pr create --base dev
```

Select the affected runtime plugins or shared libraries in Changesets. Use patch for compatible fixes, minor for compatible additions and major for breaking changes. Bundle descriptors follow their members through native s2s versioning. Documentation-only changes normally need no changeset. Keep the changeset on the feature branch; CI creates temporary dev versions while preserving that stable release intent.

After checks and review, merge the feature PR into `dev`. Feature PRs may squash. Watch **Actions → Dev release** for the build, publication and restart result. Test the resulting behavior on the dev servers. Further fixes follow the same feature-PR flow.

## Promote tested work

In GitHub, select **Actions → Promote dev → Run workflow**, using `main`. The CLI equivalent is:

```bash
gh workflow run promote.yml --ref main
```

The workflow opens a `dev` to `main` PR or reuses the one already open. It explicitly requests checks of the PR's merged result, including when GitHub's workflow token created the PR. Review the dev-server test results and the complete batch, then use **Create a merge commit**. Keep the long-lived `dev` branch.

The **Release** workflow applies stable changesets, builds and tests, commits the resulting versions and root lockfile, and publishes through `s2s deploy --ci`. MAUL stays restricted. Once publication succeeds, the workflow merges the published `main` into `dev` and dispatches dev checks explicitly. This carries stable versions and consumed changesets back into the integration branch while preserving unreleased dev work.

Production rollout is separate. Install the published stable plugin or bundle version through the production server's Pelican console, for example:

```text
sm plugins install @edgegamers/s2s-hide@1.3.6
```

Use the version printed by the actual release. Installing a bundle selects the member versions pinned by that release.

## Retry a failure

Use **Actions → Dev release → Run workflow**, choosing `dev`, or:

```bash
gh workflow run dev-release.yml --ref dev
```

The source commit and its position in Git history determine the dev version. Retrying the same source keeps its version, including after a partial publication. Native deployment skips versions already published. The successful source checkpoint advances only after all required uploads succeed. Restart-hook failure leaves that checkpoint intact; a retry can deliver the restart event again. Receivers should deduplicate events by source commit if repeated restarts are undesirable.

To retry only restart delivery, use **Actions → Restart dev**, choosing `main`, and enter the full source commit from the published dev run. This works even after newer documentation-only commits or releases: each published event has an immutable `dev-release/<source>` tag. It does not rebuild or publish anything. The restart causes servers to select their newest allowed dev versions; it is not a rollback to the event's original artifacts.

For stable publication or synchronization failure, rerun **Release** on `main`:

```bash
gh workflow run release.yml --ref main
```

Existing committed stable versions are reused. A sync conflict or rejected push fails visibly. Resolve a conflict in a `main` to `dev` PR using a merge commit, then rerun Release. The automation never force-pushes either source branch.

## Initial activation

The workflows are implemented, but dev publication is disabled until the native snapshot prerequisite is released. SDK 0.35.0 lacks the required `s2s version --snapshot … --snapshot-state … --output …` operation; its ordinary version command cannot produce coherent dev bundle releases. The preparation helper checks actual CLI support and refuses an unsupported SDK before editing versions.

1. Release the native SDK snapshot support, then update the single root SDK dependency and lockfile to that released version. Verify `npm run check` and a disposable snapshot build.
2. Ensure repository Actions can create pull requests and write contents, and that branch rules permit the release bot's version and synchronization commits. CODEOWNERS/review policy is configured separately.
3. Set the repository secret `S2SCRIPT_TOKEN` to a deploy token authorized for the EdgeGamers packages, including restricted MAUL.
4. Configure dev servers with the native manifest below, the plugins/bundles each server uses, and a read-only registry token for restricted packages. Keep production manifests on stable versions/ranges.
5. Create the restart webhook receivers and set `DEV_RESTART_WEBHOOKS` to a JSON array of their secret HTTPS URLs. Each receiver receives the released package list and decides which server(s) to restart. A missing secret leaves publication functional and reports that no restart was requested.
6. Set the repository variable `DEV_RELEASES_ENABLED` to `true`. Run Dev release on `dev` and verify publication and a real startup update before relying on it.

Merging this system into `main` and completing its stable Release workflow initializes `dev` if absent. Until publication is enabled, Dev release runs the full workspace checks.

### Dev server manifest

The egg preserves `game/csgo/addons/s2script/plugins.json` and `plugins-lock.json` and delegates registry updates to the runtime. Select dev packages explicitly, for example:

```json
{
  "name": "ttt-dev",
  "dependencies": {
    "@edgegamers/ttt": ">=0.0.0-dev.0 <0.0.0",
    "@edgegamers/s2s-maul": ">=0.0.0-dev.0 <0.0.0"
  },
  "autoUpdate": true
}
```

Snapshots use `0.0.0-dev.<sequence>.g<commit>`. The explicit range selects dev snapshots and excludes stable releases. The sequence increases along dev history; unchanged packages retain their preceding snapshot or stable version. Production stable releases sort above these snapshots. The egg's `S2SCRIPT_CHANNEL` selects framework releases independently of these plugin dependencies.

### Restart webhook contract

`DEV_RESTART_WEBHOOKS` contains an array such as `["https://restart.example/secret-route"]`. The caller sends an HTTPS POST with JSON after the complete dev publication succeeds:

```json
{
  "event": "s2script.dev-release",
  "source": "<full source commit>",
  "repository": "edgegamers/edgegamers-s2s",
  "runUrl": "https://github.com/edgegamers/edgegamers-s2s/actions/runs/<run>",
  "packages": [
    { "name": "@edgegamers/ttt", "version": "0.0.0-dev.42.g0123456789ab", "path": "plugins/ttt", "kind": "bundle", "private": false }
  ]
}
```

Additional snapshot state fields may accompany the event. Return a successful HTTP status once the restart has been accepted. Treat the endpoint URL as a credential, validate the event and target only dev servers. Requests time out after 15 seconds, redirects are refused, and failures never print endpoint URLs or response bodies. Documentation-only/no-release runs do not request restarts.

The mutable annotated `dev-release-state` tag stores publication metadata and points to its successful source commit. It is a checkpoint, not a source branch. The caller atomically records it and the immutable published event, using a Git lease so it cannot overwrite a concurrent checkpoint. Preserve these tags; if deliberately resetting dev history, reconcile the checkpoint before another release. Stable and dev publication share a queued concurrency group, so a dev push cannot replace a pending stable release.
