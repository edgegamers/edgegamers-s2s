# HidePlayers for s2script

A TypeScript port of [edgegamers/CS2-HidePlayers 1.3.2](https://github.com/edgegamers/CS2-HidePlayers)
by xstage. Players can hide other player models, with their choice saved by
s2script's bundled **clientprefs** module.

## Install

Requires a Linux CS2 server with a current [s2script](https://www.s2script.com/)
runtime supporting host API **3**, the `Transmit` API, post-frame callbacks, and
the boolean-returning `Cookies.set` API. Built against SDK **0.33.0** and CS2
types **0.22.0** (latest published packages checked on 2026-10-26).
Keep the framework and its bundled clientprefs at matching
versions; this port does not need CounterStrikeSharp or Cruze03's Clientprefs.

1. Ensure the bundled `@s2script/clientprefs` plugin is running and its database
   opens successfully. The framework's default local SQLite database is enough.
2. Build locally or download the artifact from a successful
   [GitHub Actions run](https://github.com/ShookEagle/s2s-hide/actions). Extract
   `s2s-hide-1.3.3.zip` into `game/csgo/` on your server. It
   installs `addons/s2script/plugins/_edgegamers_s2s-hide.s2sp`, English/Russian translations,
   and documentation/source under `addons/s2script/docs/s2s-hide/`.
3. s2script loads the plugin automatically. Check `sm plugins list` and server
   logs. On first load, it creates `addons/s2script/configs/HidePlayers.json`.

For manual installation, copy `dist/_edgegamers_s2s-hide.s2sp` to
`addons/s2script/plugins/` and the contents of `translations/` to
`addons/s2script/translations/`. English feedback is embedded as a fallback.
Do not overwrite an existing config when upgrading.

If upgrading from the earlier unscoped build, unload `s2s-hide` and remove its
old `addons/s2script/plugins/s2s-hide.s2sp` before installing the scoped build,
so both copies do not run together. The config and clientprefs cookie are unchanged.

After the first registry publication, `s2s install @edgegamers/s2s-hide` installs the plugin
from the registry. The registry installs the `.s2sp`, which includes English
fallback messages. For Russian and editable phrase files, also copy
`translations/` into `addons/s2script/translations/`, or use the full install ZIP.

## Commands and configuration

| Command | Behavior |
| --- | --- |
| `!hide`, `/hide`, `!hidemodels`, `/hidemodels` | Toggle hiding for yourself |
| `css_hide`, `css_hidemodels` | Same toggle from the player's console |
| `css_hide_reload` or `!hide_reload` | Reload config; s2script ROOT access or server console required |

The config retains the original format:

```json
{
  "cmds": "css_hidemodels;css_hide",
  "who_hidden": "@all",
  "ConfigVersion": 3
}
```

- `@all`: hide all other players.
- `@team`: hide players on your own team.
- `@enemy`: hide players on different teams.

Unknown modes fall back to `@all`, as upstream does. `cmds` accepts semicolon
separated console commands; a `css_` prefix also registers the corresponding
unprefixed chat alias. s2script handles `sm_` chat aliases itself.
`css_hide_reload` and `hide_reload` are reserved for admins.

Mode changes apply after `css_hide_reload`. As upstream does, commands register
at startup: after changing `cmds`, use `sm plugins reload @edgegamers/s2s-hide`. Invalid
config reloads report an error and keep the last working settings. Phrase-file
changes also require a plugin reload.

## Behavior and client preferences

Hiding defaults off. Your own pawn stays visible, and hiding is suspended while
your current pawn is in observer mode. Team changes and respawns are picked up
each frame. Bots can be hidden. The original plugin's life-state condition also
allows dead/dying target pawns, so this port preserves that behavior.

Only player-pawn transmission is filtered. Damage, collisions, sounds, radar,
and separately transmitted equipment are not independently modified, matching
the original scope. Other plugins' transmit restrictions still apply.

The public cookie is **`hide_player_status`**, storing **`True`/`False`**. s2script
clientprefs owns database loading and persistence; this plugin never opens or
writes a separate database. Existing CounterStrikeSharp databases are **not
automatically migrated** just because the cookie name matches.

Choices are saved on toggle rather than disconnect: s2script makes disconnected
client handles read-only. Accepted writes belong to the host's asynchronous
persistence queue. Rejected writes keep the session choice active, show a notice,
and retry once per second while connected. A disconnect or plugin reload before
acceptance can lose that unsaved choice; a process crash can lose accepted writes
that have not yet reached the database. Check clientprefs logs for DB failures.

Native `Transmit.setVisibleTo` rules enforce visibility per recipient. The
plugin refreshes them after simulation, reuses live schema views, and only writes changed rules. Rules are
cleared on map changes and unload. A transmit failure is logged and retried.

## Build and verify

Use Node.js 22.13+ (tested with 24) and npm.

```sh
npm ci
npm test
npm run typecheck
npm run package
```

`npm run build` produces `dist/_edgegamers_s2s-hide.s2sp` using the official `s2s` compiler.
`npm run package` also creates the install ZIP with translations, license, and
corresponding source. Dependencies are locked in `package-lock.json`.
The registry's source tarball follows npm packing rules and excludes lockfiles;
use `npm install` when building that tarball, or `npm ci` from this repository
or the full install ZIP's included source.

Automated tests execute the bundled plugin against simulated engine boundaries.
They cover filtering, observers, dead pawns, bots, commands/admin registration,
cookie loading/saving/rejection, reconnects, reused entity indices, config reload,
localization and cleanup. Typechecking and the SDK build verify API compatibility.
They do **not** replace a live CS2 transmission/database test.

Before putting it on a populated server, check with two clients:

1. Toggle all three hide modes, switch teams, die/spectate, and respawn.
2. Toggle hiding, wait for persistence, reconnect, then restart the server and
   reconnect again to confirm the preference survives.
3. Change maps and reload/unload the plugin; confirm visibility resets correctly.
4. Confirm non-root users cannot reload config and Russian clients get Russian
   feedback. Check logs for transmit and clientprefs errors.

## Automatic registry publishing

Create a deploy token with **publish access to the `edgegamers` organization** at
[s2script → Deploy tokens](https://www.s2script.com/account/tokens). In this
repository, open **Settings → Secrets and variables → Actions → Secrets → New
repository secret** and add:

| Secret name | Value |
| --- | --- |
| `S2SCRIPT_TOKEN` | Your s2script deploy token (`s2s_…`) |

Use a repository **secret**, not a plain Actions variable. No other custom
secret or variable is required. The package publishes as **`@edgegamers/s2s-hide`**;
the token must be authorized for that organization scope. Do not paste the token into
source, issue comments, or chat.

The [publishing workflow](.github/workflows/publish.yml) tests, typechecks,
packages, and then runs the pinned SDK's `s2s deploy --ci`. It publishes both
the `.s2sp` and corresponding source to the public s2script registry.

- **First publish:** after adding the secret, open **Actions → Publish to
  s2script registry → Run workflow**, select `main`, and run it. This publishes
  the version currently in `package.json` (initially `1.3.3`).
- **Later releases:** bump the version, commit `package.json` and
  `package-lock.json`, then push a matching tag. For example, after `1.3.3`:

  ```sh
  npm version patch --no-git-tag-version
  git add package.json package-lock.json
  git commit -m "Release 1.3.4"
  git tag v1.3.4
  git push origin main
  git push origin v1.3.4
  ```

Tag names must be exactly `v` plus the package version. For a first tag-based
publish instead of the manual button, use `v1.3.3`. Choose one method for each
version: published registry versions cannot be overwritten. Re-running after a
successful publish, or subsequently tagging the same version, will be rejected
by the registry; bump the version to publish new content.

The separate [CI workflow](.github/workflows/ci.yml) runs on pushes to `main`
and pull requests. It needs no registry token and does not publish.

## Attribution

GPL-3.0-only, preserving the upstream license. See [NOTICE](NOTICE) and
[LICENSE](LICENSE). Upstream source reference:
`d9b6ce0008be45ecd983f3c7fa402b0286721e20`. Framework API reference:
`ec97355e2836336a25709961301355671b0b92c9` from
[s2script/s2script](https://github.com/s2script/s2script).
