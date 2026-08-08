# Plugin Workflows

This repository is the plugin source of truth. Server repositories decide which released plugins a server installs.

## Layout

Plugins live under `plugins/<scope>/<plugin>`.

- `plugins/global/*`: shared services and APIs every game may consume.
- `plugins/cs2/*`: Counter-Strike 2 plugins.
- Future games get their own scope, such as `plugins/dods/*`.

Game-scoped plugins may consume global plugins and plugins from their own game scope. They must not consume another game's plugin package. The local gate enforces this with:

```powershell
npm.cmd run plugins:check
```

## Starting A Plugin

Create a package under the correct scope, use an `@edgegamers/` package name, and extend the root TypeScript config:

```json
{
  "extends": "../../../tsconfig.base.json",
  "include": ["src/**/*.ts", "test/**/*.ts", "api.d.ts"]
}
```

Plugins that publish runtime APIs should expose one contract through `api.d.ts` and set:

```json
{
  "types": "api.d.ts",
  "s2script": {
    "publishes": "self"
  }
}
```

Consumers declare runtime requirements with `s2script.pluginDependencies` or `s2script.optionalPluginDependencies`. Do not copy another plugin's declaration file into your package.

## Validation

Run the normal gate from the repository root before merging:

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
```

Use focused tests while iterating:

```powershell
npm.cmd test -- plugins/cs2/ttt/test
npm.cmd run build -- --filter @edgegamers/ttt
```

## Changesets

Plugin changes may not reach `main` without a changeset. Add one for every plugin whose runtime behavior, package metadata, API contract, or built artifact changes:

```powershell
npm.cmd exec changeset
```

The changeset release job turns merged changes on `main` into plugin releases. Every plugin release has a stable `.s2sp` asset name so development reconcile and runtime hot reload can replace the same file path.

## Development Deploys

`dev` is the live development branch. After changes merge to `dev`, the development workflow builds latest plugin artifacts, reads each server repo's `server-plugins.json`, and reconciles only affected development servers.

`config/development-servers.json` maps server repo names to development host/path metadata. It is not a second plugin list. The plugin list stays in the server repo intent file, using entries such as `{ "name": "@edgegamers/ttt", "enabled": true }`.

Disabled development plugins still update, but reconcile installs them under:

```text
addons/s2script/plugins/disabled/<plugin-name>.s2sp
```

## Production Releases

`main` is staging for tested changes. Production servers do not auto-adopt plugin releases from `main`. A server repo tag such as `YY.MM.DD` resolves the latest plugin releases available from `edgegamers-s2s/main` at tag time and writes a full server release snapshot.

That snapshot is used until the next server repo tag. Empty/base server changes are tested first through development, then individual production server repos pick them up the next time those servers are tagged.
