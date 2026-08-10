# Repository architecture

The repository keeps Source2Script-native behavior at the center. It adds only the local policy and documentation that Source2Script cannot know about EdgeGamers.

## Directory responsibilities

```text
edgegamers-s2/
├── .changeset/       Release intent for publishable plugins
├── docs/             Contributor and release documentation
├── plugins/          Source2Script runtime plugins
├── scripts/          Repository-specific policy and bundle tools
└── packages/         Reserved for proven shared source packages
```

`plugins/*` belongs to both npm and the Source2Script workspace. Each plugin has its own version and package metadata. Private plugins build normally but cannot be published by `s2s deploy`.

`packages/*` belongs only to npm. Do not create a package for a one-off helper. A shared package should represent a coherent implementation boundary with more than one real consumer.

`scripts/lib/*` contains focused logic shared by repository-specific CLI scripts. The neighboring CLI files handle Git, filesystem access, console output, and exit codes.

`artifacts/server-bundles/` contains generated server bundles. Plugin `dist/`
directories contain generated `.s2sp` packages. Both are ignored by Git.

## Which tool owns what?

Source2Script owns:

- workspace plugin discovery;
- dependency-ordered builds;
- sibling-interface validation;
- version application and dependency cascading;
- registry deployment.

The repository owns:

- deciding when a changed publishable plugin needs a Changeset;
- building server-scoped plugin bundles and triggering server pipelines;
- EdgeGamers contributor documentation.

There is deliberately no custom loop over `plugins/*` for building, versioning, or publishing.

## Shared source versus runtime interfaces

Use a private package under `packages/` when consumers need the same bundled implementation but do not share runtime state. Formatting helpers and configuration parsers are typical examples.

Use a plugin interface when one loaded plugin owns a runtime service or authoritative state. Permissions, player data, menus, and economies are typical examples. The producer publishes the interface; consumers declare it in `s2script.pluginDependencies` and resolve it with `ctx.use`.

The distinction is simple:

```text
Shared implementation -> private npm package
Shared runtime service -> Source2Script plugin interface
```

See [Plugin development](./plugin-development.md) for runtime interface guidance.

## Command flow

```text
npm install
    ↓
lint → typecheck → s2s build
                                  ↓
                        plugin dist/*.s2sp files
                                  ↓
                    server bundle generation
```

Production follows a separate Changeset and registry path described in [Changesets and releases](./releases.md).

## GitHub and deployment state

The repository includes GitHub Actions for validation, server bundle builds, Source2Script registry deploys, and hotfix synchronization.

Branch rules, environments, secrets, labels, team bindings, and required checks still require maintainer setup in GitHub. Follow [.github/MANUAL_SETUP.md](../.github/MANUAL_SETUP.md).

Server deployment is intentionally outside this repository. This repository
builds server-scoped plugin bundles and uses GitLab trigger tokens to start
affected development server pipelines. Server repositories own runnable image
builds, SSH deploys, compose files, and restart policy; this repository never
SSHes to game servers.
