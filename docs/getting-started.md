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

The committed `package-lock.json` is the source of truth for dependency versions. CI should use `npm ci` once validation workflows are added.

## Validate the workspace

Run the complete local validation sequence:

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
```

These commands check different boundaries:

- `lint` applies the same Source2Script rules used by the SDK build;
- `typecheck` runs strict repository-wide TypeScript validation;
- `test` runs portable unit and repository-policy tests with Vitest;
- `build` delegates plugin discovery, dependency ordering, contract checks, and `.s2sp` packaging to Source2Script.

Built packages appear beneath each plugin's `dist/` directory and are ignored by Git.

## TypeScript version

TypeScript is pinned to 5.9.3. TypeScript 7.0.2 is stable, but the current official Source2Script lint stack uses `@typescript-eslint/parser@8.65.0`, which rejects TypeScript 7 at startup.

Upgrade to TypeScript 7 only after the official Source2Script ESLint dependency graph supports it without peer overrides, install warnings, or runtime warnings. Keeping one supported compiler version is more valuable than forcing a split compiler/linter setup.

Vite is pinned to 6.4.3 because Vitest's broad dependency range otherwise selects a newer Vite line that requires a different esbuild version than Source2Script SDK 0.14.0. The explicit pin keeps the npm tree valid and on a patched Vite release.

## Local server testing

Build a local artifact bundle:

```powershell
npm.cmd run artifacts:local
```

Copy the generated `.s2sp` files from `artifacts/local-development/` into a local Source2Script server:

```text
addons/s2script/plugins/
```

See [Local development](./local-development.md) for the full local setup and current release-path stubs.

## Next steps

- Read [Repository architecture](./architecture.md) before introducing shared code.
- Follow [Plugin development](./plugin-development.md) to create a plugin or runtime interface.
- Read [Changesets and releases](./releases.md) before changing publishable behavior.
