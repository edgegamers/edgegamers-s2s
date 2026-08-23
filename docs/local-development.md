# Local Development

Use local development to prove plugins build, package, and load before CI or server automation handles them.

## Toolchain

Install:

1. Node.js 24.x.
2. npm 11 or newer.
3. Git.
4. A local CS2 server with Source2Script installed, when you need runtime smoke tests.

Check versions:

```powershell
node --version
npm.cmd --version
git --version
```

The repository pins `@s2script/sdk` and calls the local `s2s` CLI through npm scripts. Do not install a global CLI for normal work.

## Install

```powershell
npm.cmd install
```

Use `npm ci` in clean validation environments.

## Validate

Run the local gate from the repository root:

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
```

`npm.cmd run workspace:check` is the focused scope and dependency-boundary
check, and `npm.cmd run lint` runs it automatically. `npm.cmd run build`
delegates plugin discovery, dependency order, interface checks, and package
output to Source2Script. Current SDK output is a plugin's
`dist/<plugin>.s2sp` file.

The first segment below `plugins/` or `packages/` is policy: `global` is
game-agnostic; another value must be a game in `workspace-policy.json`; deeper
directories are free-form. Global code may use global code only. Game code may
use global code and same-game code. For example, plugins live at
`plugins/global/maul` and `plugins/cs2/ttt`.

## Build Local Artifacts

```powershell
npm.cmd run build
```

CI server deployment does not use `artifacts/local-development/`. CI uses
server bundles under `artifacts/server-bundles/` and hands deployment to the
server repositories.

## Load On A Local Server

The installed Source2Script SDK documents the runtime plugin directory as:

```text
addons/s2script/plugins/
```

Copy each `.s2sp` from a plugin's `dist/` directory into that directory on your local development server. Re-copy the file after rebuilding. Delete it to unload.

Do not use this manual copy process as the production release path. Server repositories select production bundles and deploy their server images.

## Environment Setup

Track manual GitHub and environment setup in [.github/MANUAL_SETUP.md](../.github/MANUAL_SETUP.md).
