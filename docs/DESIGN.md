# Design

This repository is a Source2Script plugin monorepo for EdgeGamers.

## Goals

1. Keep Source2Script workspace behavior authoritative for plugin creation, builds, versioning, and registry deployment.
2. Let npm manage workspace linking for `plugins/*` and future `packages/*`.
3. Keep each publishable plugin independently versioned with Changesets.
4. Prove sibling runtime interfaces without copied declaration files.
5. Keep release and server deployment paths explicit, even where EdgeGamers infrastructure is still undecided.

## Workspace Boundary

`plugins/*` are Source2Script runtime plugins and npm workspace members.

`packages/*` are private npm workspace packages for shared source code. They are not deployable plugins unless the root `s2script.workspace.plugins` glob includes them.

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

Development builds produce immutable `.s2sp` artifacts and a development
manifest. The development workflow uploads managed artifacts and reconciles the
development server from that manifest.

Production plugin release starts on `edgegamers-s2s/main`, which creates GitHub
release assets for all released plugins. Only plugins with registry opt-in
metadata publish to the Source2Script registry. Server repositories resolve the
GitHub release assets at their own `YY.MM.DD` or `YY.MM.DD-HOTPATCH-N` tag time
into `server-release-manifest.json`; production servers adopt the frozen
manifest only when their own server repository is tagged.
