# EdgeGamers Source2Script Monorepo Foundation Design

**Status:** Approved for implementation planning

**Date:** 2026-07-31

**Milestone:** Local monorepo foundation

## Goal

Establish a clean, approachable Source2Script plugin monorepo that validates the SDK's native workspace behavior locally and gives contributors one documented path for creating, testing, building, and versioning plugins.

This milestone deliberately stops before GitHub automation and infrastructure integration. Production publication ends at `s2s deploy`. Development builds follow a separate immutable-artifact route, but connecting those artifacts to EdgeGamers development servers is deferred.

## Constraints

- Use Node.js 24.x and npm workspaces.
- Pin `@s2script/sdk` to the verified current version, `0.14.0`.
- Use Source2Script-native workspace commands for plugin creation, build, versioning, and deployment.
- Do not build custom plugin-discovery, dependency-ordering, versioning, or registry-publishing systems.
- Keep the repository root private and keep reference plugins private so examples cannot be published accidentally.
- Keep existing repository branding and contributor-facing content unless a focused edit is needed to link the new documentation.
- Treat generated `.s2sp` files and development manifests as build artifacts, not source files.

## Architecture

The repository has three primary areas:

1. `plugins/*` contains Source2Script runtime plugins discovered by both npm and the Source2Script workspace.
2. `packages/*` is reserved for private shared source or testing packages with at least one real consumer. This milestone will not create placeholder packages.
3. `scripts/*` contains narrow repository-policy utilities. Core logic is exported from testable modules; thin CLI entry points translate results into console output and process exit codes.

The root `package.json` is the single command surface. Contributors run root scripts rather than entering each plugin directory or maintaining custom loops.

## Workspace Configuration

The root package declares:

- npm workspace membership for `plugins/*` and `packages/*`;
- Source2Script plugin discovery for `plugins/*` only;
- exact development dependency versions recorded in `package-lock.json`;
- scripts for linting, type checking, testing, Source2Script builds, Changesets, repository policy checks, and development-manifest generation.

The Source2Script SDK remains authoritative for:

- creating plugins with `npx @s2script/sdk create`;
- building all plugins in dependency order with `npx @s2script/sdk build`;
- applying Changesets and sibling dependency updates with `npx @s2script/sdk version`;
- publishing production versions with `npx @s2script/sdk deploy`.

## Reference Plugins

Two minimal private plugins prove that the workspace is wired correctly:

- A producer exports a small typed interface using the current Source2Script authoring pattern.
- A consumer imports that interface from the producer's npm workspace package and declares the corresponding `s2script.pluginDependencies` relationship.

The pair exists to verify real behavior, not to establish a permanent example-plugin product. Their names and behavior should be obviously instructional. They must not copy declarations into `.s2script/types`.

Each plugin has a focused `package.json`, a small `tsconfig.json` extending the root configuration, source code, tests where behavior can run outside the game, and a short README explaining its role.

## Tooling

### TypeScript

A strict root configuration provides consistent compiler behavior. Plugin configurations extend it and include only their own source and tests. Source2Script's build remains the authoritative packaging check; the root type-check gives faster feedback.

### ESLint

One root flat configuration covers TypeScript source, tests, and JavaScript repository scripts. It enforces type-aware correctness rules without duplicating configuration inside plugins.

### Tests

Vitest runs from the repository root. Tests focus on portable plugin logic and repository-policy behavior; they do not require a live Counter-Strike 2 server.

Every new behavior follows a red-green-refactor cycle. Repository scripts expose pure functions so tests can provide explicit inputs rather than invoking Git or mutating process-global state unnecessarily.

### Changesets

Changesets records release intent for publishable plugins. Reference plugins are private, so they do not require releases. The configuration targets `main`, uses public access for future publishable plugins, and delegates final workspace version application to `s2s version`.

## Repository Policy Scripts

### Changeset coverage

The Changeset policy receives a list of changed files plus workspace package metadata. It identifies changed publishable plugins and reports package names that lack a pending Changeset.

The CLI obtains changed paths from Git using an explicit base reference. It exits successfully when no publishable plugin changed or all affected plugins are covered, and fails with a message listing every missing package otherwise. An override is accepted only through an explicit local input; future CI must derive any override from trusted pull-request metadata.

### Development manifest

The development-manifest generator receives discovered `.s2sp` paths, a commit identity, and an output location. It emits deterministic plugin entries sorted by normalized artifact path. Every entry records the artifact path, filename, `dev.<short-sha>` revision, and SHA-256 digest.

The generated document also records the development environment, full commit identity, and generation timestamp. Tests inject the timestamp so output is repeatable. The CLI scans the SDK's documented `plugins/*/dist/*.s2sp` output pattern and fails clearly when a build was expected but no artifacts were found.

This manifest describes immutable development artifacts. Uploading it or reconciling development servers is outside this milestone.

## Command and Data Flow

Contributor validation flows through the root:

1. `npm install` restores the pinned dependency graph.
2. `npm run lint` checks source, tests, and scripts.
3. `npm run typecheck` performs strict TypeScript validation.
4. `npm test` runs portable unit tests.
5. `npm run build` delegates workspace packaging and dependency order to Source2Script.
6. `npm run manifest:dev` reads built `.s2sp` files and produces a development manifest.

Release intent is recorded with `npm run changeset`. A later production workflow will use `s2s version`, review the resulting version changes, and finish at `s2s deploy`. No production server manifest or reconciliation layer is part of the repository requirement.

## Error Handling

- Invalid package metadata, malformed Changesets, missing Git base references, unreadable artifacts, and duplicate manifest entries fail fast with contextual messages.
- CLI entry points return nonzero exit codes for actionable failures and avoid printing stack traces for expected user errors.
- Pure policy functions return structured results so tests and future automation can render them without parsing console text.
- Artifact paths are normalized to forward slashes in manifests for cross-platform consistency.
- Registry tokens and deployment credentials are never read by local policy scripts.

## Documentation

The `docs/` directory becomes the contributor reference and includes:

- an updated navigation page;
- local setup and prerequisites;
- repository architecture and directory responsibilities;
- creating a plugin with the native workspace command;
- choosing between a shared package and a runtime plugin interface;
- the reference producer/consumer relationship;
- local validation commands and expected outputs;
- Changeset policy and semantic-version guidance;
- distinct development and production release routes;
- the intentionally deferred GitHub and deployment-infrastructure work.

The root README links to the documentation navigator without duplicating the full guide.

## Verification

The milestone is complete when fresh commands demonstrate all of the following:

- dependency installation succeeds from the committed lockfile;
- linting reports no errors;
- strict type checking reports no errors;
- all Vitest tests pass;
- Source2Script builds the complete workspace from the root;
- the consumer resolves the producer's live sibling interface without copied declarations;
- development-manifest tests prove stable ordering, normalized paths, revision formatting, and SHA-256 hashing;
- Changeset-policy tests cover no changes, private plugins, covered publishable plugins, and missing Changesets;
- documentation accurately describes the implemented commands and boundaries.

## Deferred Work

The following belong to later milestones:

- GitHub Actions validation and release workflows;
- `dev` and `main` rulesets, environments, labels, and CODEOWNERS expansion;
- artifact upload transport and development-server reconciliation;
- automatic development rollback;
- production credentials and automated invocation of `s2s deploy`;
- production server installation or reconciliation;
- hotfix synchronization automation;
- any shared package without an established second consumer.
