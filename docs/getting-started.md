# Getting started

This repository is an npm workspace for the Source2Script plugins maintained by EdgeGamers. All common development commands run from the repository root.

## Prerequisites

Install:

- Node.js 24.x;
- npm 11 or newer;
- Git.

The Source2Script CLI is pinned as a project dependency. A global `s2s` installation is not required.

Select the repository's Node version with your version manager, then verify the toolchain:

```powershell
node --version
npm.cmd --version
```

On macOS or Linux, use `npm` and `npx` wherever the examples use the Windows launchers `npm.cmd` and `npx.cmd`.

## Install dependencies

From the repository root:

```powershell
npm.cmd install
```

The committed `package-lock.json` is the source of truth for dependency versions. CI uses `npm ci`.

## Validate the workspace

Run the complete local validation sequence:

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
```

These commands check different boundaries:

- `lint` includes `workspace:check` automatically before applying the same
  Source2Script rules used by the SDK build;
- `workspace:check` reports scope and dependency-boundary violations directly;
- `typecheck` runs strict repository-wide TypeScript validation;
- `test` runs the layout, scanner, boundary, consumer, and creator tests;
- `build` delegates plugin discovery, dependency ordering, contract checks, and `.s2sp` packaging to Source2Script.

Built packages appear beneath each plugin's `dist/` directory and are ignored by Git.

The first segment below `plugins/` or `packages/` is the only policy segment:
`global` is game-agnostic and a game name must be listed in
`workspace-policy.json`; directories after it are free-form. The current
plugins are `plugins/global/maul` and `plugins/cs2/ttt`. Global code may use
global code only; game-scoped code may use global and same-game code.
Create plugins with
`npm.cmd run create:plugin -- <scope>/<optional-folders>/<plugin-name>`.

## TypeScript version

TypeScript is pinned to 5.9.3. TypeScript 7.0.2 is stable, but the current official Source2Script lint stack uses `@typescript-eslint/parser@8.65.0`, which rejects TypeScript 7 at startup.

Upgrade to TypeScript 7 only after the official Source2Script ESLint dependency graph supports it without peer overrides, install warnings, or runtime warnings. Keeping one supported compiler version is more valuable than forcing a split compiler/linter setup.

## Local server testing

Build the workspace and development bundles with:

```powershell
npm.cmd run build
npm.cmd run bundles:servers -- --environment development
```

Development delivery triggers the affected server repositories, which build
their runnable images, pull them on the development hosts, and restart their
development containers. Production delivery updates the selected image and
compose configuration without a live restart; the host restart at 10:00 applies
the selected image.

See [Local development](./local-development.md) for the full local setup and current release-path stubs.

## Next steps

- Read [Repository architecture](./architecture.md) before introducing shared code.
- Follow [Plugin development](./plugin-development.md) to create a plugin or runtime interface.
- Read [Changesets and releases](./releases.md) before changing publishable behavior.
