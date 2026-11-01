# edgegamers · s2script

[![Checks](https://shieldcn.dev/github/ci/edgegamers/edgegamers-s2s.svg?variant=outline)](https://github.com/edgegamers/edgegamers-s2s/actions)
[![Node 24](https://shieldcn.dev/badge/Node-24-green.svg?variant=outline&logo=nodedotjs)](https://nodejs.org/)
[![s2script SDK](https://shieldcn.dev/badge/s2script-0.35.0-blue.svg?variant=outline)](https://github.com/s2script/s2script)

CS2 server plugins maintained by edgegamers. One install, native s2s tooling, independent releases.

## Plugins

| Product | Registry package | Distribution |
| --- | --- | --- |
| [TTT](plugins/ttt/) | `@edgegamers/ttt` | Public bundle · 10 members |
| [SurfTimer](plugins/surftimer/) | `@edgegamers/surftimer` | Public bundle · timer + HUD |
| [Jailbreak](plugins/jb/) | `@edgegamers/jailbreak` | Public bundle · 7 members, gangperks optional |
| [Decluttr](plugins/decluttr/) | `@edgegamers/decluttr` | Public plugin |
| [Hide](plugins/hide/) | `@edgegamers/s2s-hide` | Public plugin |
| [MAUL](plugins/maul/) | `@edgegamers/s2s-maul` | Restricted plugin |

All source is public. MAUL's registry downloads are restricted to authorized members of the edgegamers organization.

## Develop

Use Node 24 (`.node-version`) and npm 11.19.0. Bun is installed with the root dependencies for MAUL's existing behavior tests. Archive behavior tests also use Python 3 and `unzip`.

```bash
npm ci
npm run check
```

`check` builds all runtime plugins with the SDK's type and safety checks, then runs the retained behavior suites. Archives are written to each plugin's `dist/` directory.

```bash
npm run build
npm run build -- --filter '@edgegamers/ttt-*'
npm test                         # after a build; some tests exercise archives
npm run changeset                # record release intent
```

The root owns the only npm workspace, lockfile and Changesets configuration. Bundle containers hold descriptors; their runtime plugins and shared libraries are workspace packages. Keep additions inside `plugins/` and update the root's discovery lists when adding a product.

Player/admin text follows [the translations and message guide](docs/translations.md), shared by contributors and coding agents.

## Releases

Feature PRs target `dev`. Its workflow builds and tests the workspace, then publishes affected dev snapshots and requests configured dev-server restarts once native snapshot support is enabled. **Actions → Promote dev** opens the batch `dev` → `main` release PR. Use a merge commit for that promotion. See the [feature-to-production guide](docs/releases.md) for commands, activation prerequisites and retries.

Add a changeset for each changed runtime plugin or shared library. After it reaches `main`, the release workflow:

1. Applies `s2s version` and refreshes the root lockfile.
2. Builds and tests the resulting versions.
3. Commits version changes when `main` has not advanced.
4. Runs `s2s deploy --ci`, publishing members before their bundles.
5. Merges the published `main` back into `dev` and explicitly starts dev validation.

Versions are independent. Each bundle advances with its own changed members. Already published versions are skipped, so a failed release can be retried using **Actions → Release → Run workflow**. Version commits do not start another workflow run.

### One-time GitHub setup

Add an Actions secret named **`S2SCRIPT_TOKEN`**, using a s2script deploy token authorized to publish under `@edgegamers`, including restricted MAUL packages. Never commit it. The repository's Actions token needs permission to push version commits to `main`; any branch rules must allow that bot update. A missing token stops publication.

For an intentional local release, use `npm run version`, review and commit the generated changes, then `npm run deploy` with your registry credentials. This uploads packages. `npm exec -- s2s deploy --dry-run` inspects the native plan without uploading; registry metadata access may require authentication.

Registry releases do not deploy to game servers or publish Workshop content. Follow each product's runtime setup and smoke-test instructions when adopting a new release.

## Contribute

Read [CONTRIBUTING.md](CONTRIBUTING.md), our [code of conduct](CODE_OF_CONDUCT.md), and the [security policy](SECURITY.md). Track work in [GitHub Issues](https://github.com/edgegamers/edgegamers-s2s/issues).

Fresh imports are recorded in [UPSTREAMS.md](UPSTREAMS.md). The repository's existing [LICENSE](LICENSE) is preserved; each imported product keeps its original license and notices. Badges are served by [shieldcn](https://shieldcn.dev/).
