# Design

This repository is a Source2Script plugin monorepo for EdgeGamers.

## Goals

1. Keep Source2Script workspace behavior authoritative for plugin creation, builds, versioning, and registry deployment.
2. Let npm manage workspace linking for scoped plugin and package directories.
3. Keep each publishable plugin independently versioned with Changesets.
4. Prove sibling runtime interfaces without copied declaration files.
5. Keep release and server deployment paths explicit, even where EdgeGamers infrastructure is still undecided.

## Workspace Boundary

`plugins/global/**` are game-agnostic Source2Script runtime plugins and npm
workspace members. `plugins/<game>/**` are scoped to games listed in
`workspace-policy.json`; below that first segment, layout is free-form. The
migrated plugins are `plugins/global/maul` and `plugins/cs2/ttt`.

`packages/global/**` are game-agnostic private npm workspace packages for
shared source code. `packages/<game>/**` are game-scoped packages using the
same first-segment policy and free-form deeper layout. They are not deployable
plugins unless the root `s2script.workspace.plugins` glob includes them.

Global code may use global code only; game-scoped code may use global and
same-game code. `npm.cmd run workspace:check` reports this focused policy;
`npm.cmd run lint` includes it automatically. Create a plugin with
`npm.cmd run create:plugin -- <scope>/<optional-folders>/<plugin-name>`.

## Source2Script Ownership

The SDK owns:

1. Plugin discovery.
2. Dependency-ordered builds.
3. Sibling interface checks.
4. Changeset-aware version application.
5. Registry deployment.

The repository owns:

1. Local validation commands.
2. License policy.
3. Changeset coverage policy.
4. Development artifact manifests.
5. GitHub workflow and governance stubs.
6. Contributor documentation.

## Release Boundary

Development builds produce immutable `.s2sp` artifacts and a development manifest. Server upload and reconciliation remain stubbed until EdgeGamers chooses the transport.

Production release currently stops at Source2Script registry deployment. Production server manifest and install commands remain stubbed until the final S2S release path is known.
