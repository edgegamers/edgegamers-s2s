# edgegamers · s2script

[![Checks](https://shieldcn.dev/github/ci/edgegamers/edgegamers-s2s.svg?variant=outline)](https://github.com/edgegamers/edgegamers-s2s/actions)
[![Node 24](https://shieldcn.dev/badge/Node-24-green.svg?variant=outline&logo=nodedotjs)](https://nodejs.org/)
[![s2script SDK](https://shieldcn.dev/badge/s2script-0.39.0-blue.svg?variant=outline)](https://github.com/s2script/s2script)

CS2 server plugins maintained by edgegamers. One install, native s2s tooling, independent releases.

## Plugins

| Product | Registry package | Distribution |
| --- | --- | --- |
| [TTT](plugins/ttt/) | `@edgegamers/ttt` | Public bundle · 10 members |
| [SurfTimer](plugins/surftimer/) | `@edgegamers/surftimer` | Public bundle · timer + HUD |
| [Jailbreak](plugins/jb/) | `@edgegamers/jailbreak` | Public bundle · 7 members, gangperks optional |
| [ArcadeScripts](plugins/arcadescripts/) | `@edgegamers/s2s-arcadescripts` | Public plugin · jb_arcade_b6 map scripts |
| [Decluttr](plugins/decluttr/) | `@edgegamers/decluttr` | Public plugin |
| [ExtraCommands](plugins/extracommands/) | `@edgegamers/extracommands` | Public plugin |
| [Hide](plugins/hide/) | `@edgegamers/s2s-hide` | Public plugin |
| [CustomIO](plugins/customio/) | `@edgegamers/s2s-customio` | Public plugin |
| [WeaponPaints](plugins/weaponpaints/) | `@edgegamers/s2s-weaponpaints` | Public plugin · skins, knives, gloves, agents, music kits, pins |
| [WeaponPaints DS](plugins/weaponpaints-ds/) | `@edgegamers/s2s-weaponpaints-ds` | Restricted plugin · supporter tier gates |
| [MAUL](plugins/maul/) | `@edgegamers/s2s-maul` | Restricted plugin |
| [PUG](plugins/pug/) | `@edgegamers/s2s-pug` | Restricted plugin · portal match play |
| [Portal bridge](plugins/portal/) | `@edgegamers/s2s-portal` | Restricted plugin · sends game events to the CS portal |

All source is public. Registry downloads of the restricted plugins (MAUL, WeaponPaints DS, PUG and Portal bridge) are restricted to authorized members of the edgegamers organization.

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

The root owns the only npm workspace, lockfile and Changesets configuration. Bundle containers hold descriptors; their runtime plugins and shared libraries are workspace packages. Keep runtime plugins inside `plugins/` and shared libraries in a bundle's `packages/` or the root `packages/`; update the root's discovery lists when adding a product.

## Chat translations

Player-facing plugin chat uses editable English phrase files. Start with these files when revising the wording:

| Product | Phrase files |
| --- | --- |
| Standalone plugins | `plugins/<plugin>/translations/*.phrases.json` |
| Jailbreak | `plugins/jb/plugins/<member>/translations/jailbreak-<member>.phrases.json` |
| SurfTimer | `plugins/surftimer/plugins/<member>/translations/<member>.phrases.json` |
| TTT | `plugins/ttt/translations/ttt.phrases.json` |

Keys follow `owner.feature.function`, such as `extracommands.beacon.toggle_for_players`. The [translation style guide](docs/translations/STYLE.md) defines the semantic colors and TTT role colors. Keep phrase keys and positional placeholders (`{1}`, `{2}`, etc.) intact when revising wording. Names, player-written chat, map text, and operator-configured messages remain literal. Existing translation overrides must migrate their old keys to the dotted names.

Rebuild after editing source JSON to update the embedded English defaults. Native `.s2sp` archives embed those defaults in the plugin code. To override them without rebuilding, put the corresponding phrase file in `addons/s2script/translations/`; put additional languages under `addons/s2script/translations/<language-code>/`. Missing locale keys fall back to English. CustomIO currently sends no player chat.

## Releases

Add a changeset for each changed runtime plugin or shared library. After it reaches `main`, the release workflow creates or updates one **`chore: version packages`** PR from `changeset-release/main`:

1. Applies `s2s version`, refreshes the root lockfile, then builds and tests the packages whose new versions are not on the registry yet before updating the PR.
2. Collects subsequent changesets into the same PR, including generated versions, changelogs and bundle updates.
3. When you merge the version PR, builds and tests only the packages whose versions are not on the registry yet, then runs `s2s deploy --ci` on them, publishing members before their bundles. A push with nothing new to publish skips the build entirely.

Leave the version PR open to collect more changes; merge it when the release is ready. Versions are independent. Each bundle advances with its own changed members. Already published versions are skipped, so a failed release can be retried using **Actions → Release → Run workflow** without another version bump. With pending changesets, a manual run updates the version PR instead of publishing.

### One-time GitHub setup

Add an Actions secret named **`S2SCRIPT_TOKEN`**, using a s2script deploy token authorized to publish under `@edgegamers`, including restricted MAUL packages. Never commit it. A missing token stops publication.

Enable **Settings → Actions → General → Workflow permissions → Allow GitHub Actions to create and approve pull requests**. The workflow grants the repository token `contents: write` and `pull-requests: write` to maintain the release branch and PR. [PR checks triggered with GitHub's built-in token can require approval](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow#triggering-a-workflow-from-a-workflow), so `version-packages` also runs the build/tests before the bot updates the PR.

For an intentional local release, use `npm run version`, review and commit the generated changes, then `npm run deploy` with your registry credentials. This uploads packages. `npm run release:plan` lists what is not on the registry yet without building (set `S2SCRIPT_TOKEN` so restricted packages resolve), and `npm exec -- s2s deploy --dry-run` inspects the native plan without uploading; registry metadata access may require authentication.

Registry releases do not deploy to game servers or publish Workshop content. Follow each product's runtime setup and smoke-test instructions when adopting a new release.

## Contribute

Read [CONTRIBUTING.md](CONTRIBUTING.md), our [code of conduct](CODE_OF_CONDUCT.md), and the [security policy](SECURITY.md). Track work in [GitHub Issues](https://github.com/edgegamers/edgegamers-s2s/issues).

Fresh imports are recorded in [UPSTREAMS.md](UPSTREAMS.md). The repository's existing [LICENSE](LICENSE) is preserved; each imported product keeps its original license and notices. Badges are served by [shieldcn](https://shieldcn.dev/).
