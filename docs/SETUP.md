# Setup

This page records the implemented setup for this repository. For daily commands, use [Local Development](./local-development.md).

## Repository Foundation

The root package is private and uses npm workspaces:

```json
{
  "workspaces": ["plugins/*/*", "packages/*"],
  "s2script": {
    "workspace": {
      "plugins": ["plugins/*/*"]
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

## Create A Plugin

```powershell
npm.cmd run create:plugin -- my-plugin
```

Move generated plugins under the correct scope, such as `plugins/global/my-plugin` or `plugins/cs2/my-plugin`. Use an `@edgegamers/` package name and keep SDK-required fields in the plugin `package.json`.

## Build Artifacts For A Local Server

```powershell
npm.cmd run artifacts:local
```

Copy `.s2sp` files from `artifacts/local-development/` into your local Source2Script plugin directory:

```text
addons/s2script/plugins/
```

## GitHub Setup

Push `main` and `dev`, then complete [.github/MANUAL_SETUP.md](../.github/MANUAL_SETUP.md).

The files exist locally, but GitHub rulesets, environments, secrets, labels, and team bindings require maintainer action in GitHub.
