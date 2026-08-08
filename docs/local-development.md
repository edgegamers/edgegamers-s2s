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

`npm.cmd run build` delegates plugin discovery, dependency order, interface checks, and package output to Source2Script. Current SDK output is `plugins/<plugin>/dist/<plugin>.s2sp`.

## Build Local Artifacts

```powershell
npm.cmd run artifacts:local
```

The command runs the Source2Script build, writes `artifacts/development-manifest.json`, and copies built packages into `artifacts/local-development/`.

Use `artifacts/local-development/README.txt` as the file list for a manual local server copy.

`npm.cmd run artifacts:local` still supports manual local server copies. The CI development path uses the same files, then runs `npm run deploy:dev` with GitHub environment secrets. Do not run `deploy:dev` locally unless `DEV_SSH_*` variables point at a development server account.

## Load On A Local Server

The installed Source2Script SDK documents the runtime plugin directory as:

```text
addons/s2script/plugins/
```

Copy each `.s2sp` from `artifacts/local-development/` into that directory on your local development server. Re-copy the file after rebuilding. Delete it to unload.

Do not use this manual copy process as the production release path.
`edgegamers-s2s/main` creates GitHub release assets for all released plugins;
the Source2Script registry is used only by plugins that opt in. Server
repositories resolve those GitHub release assets into
`server-release-manifest.json` at their own `YY.MM.DD` or
`YY.MM.DD-HOTPATCH-N` tag time, and production servers adopt changes only when
their server repository is tagged.

## Environment Setup

Track manual GitHub and environment setup in [.github/MANUAL_SETUP.md](../.github/MANUAL_SETUP.md).
