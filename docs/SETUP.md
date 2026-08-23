# Setup

This page records the implemented setup for this repository. For daily commands, use [Local Development](./local-development.md).

## Repository Foundation

The root package is private and uses npm workspaces:

```json
{
  "workspaces": ["plugins/*/**", "packages/*/**"],
  "s2script": {
    "workspace": {
      "plugins": ["plugins/*/**"]
    }
  }
}
```

The repository pins Node 24 in `.nvmrc` and npm in `package.json`.

## First Install

```powershell
npm.cmd install
```

Commit `package-lock.json` after dependency changes.

## Local Gate

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
```

Run this gate before opening a pull request.

Only the first directory segment below `plugins/` or `packages/` is policy:
`global` is game-agnostic, and a game segment must appear in
`workspace-policy.json`. Directories below that segment are free-form. Global
code may use global code only; game code may use global code and same-game
code. Run `npm.cmd run workspace:check` for that focused result; lint runs it
automatically. The migrated plugins are `plugins/global/maul` and
`plugins/cs2/ttt`.

## Create A Plugin

```powershell
npm.cmd run create:plugin -- <scope>/<optional folders>/<plugin-name>
```

Use `global` or a game from `workspace-policy.json` as the scope, an
`@edgegamers/` package name, and keep SDK-required fields in the plugin
`package.json`.

## Build A Development Server Bundle

Build the workspace and its development server bundles:

```powershell
npm.cmd run build
npm.cmd run bundles:servers -- --environment development
```

`edgegamers-s2s` sends the bundle to affected server repositories through their
GitLab trigger-token pipelines. Those repositories build runnable images and
restart development containers; this repository does not connect to game hosts.

## GitHub Setup

Push `main` and `dev`, then complete [.github/MANUAL_SETUP.md](../.github/MANUAL_SETUP.md).

The files exist locally, but GitHub rulesets, environments, secrets, labels, and team bindings require maintainer action in GitHub.
