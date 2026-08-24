# Repository architecture

The repository keeps Source2Script-native behavior at the center. It adds only the local policy and documentation that Source2Script cannot know about EdgeGamers.

## Directory responsibilities

```text
edgegamers-s2s/
├── .changeset/       Release intent for publishable plugins
├── docs/             Contributor and release documentation
├── plugins/          Source2Script runtime plugins
├── scripts/          Repository-specific policy and bundle tools
└── packages/         Reserved for proven shared source packages
```

`plugins/global/**` belongs to both npm and the Source2Script workspace for
game-agnostic plugins. `plugins/<game>/**` holds plugins scoped to a game
listed in `workspace-policy.json`. Only this first segment is policy; deeper
directories are free-form. For example, the migrated plugins are
`plugins/global/maul` and `plugins/cs2/ttt`. Each plugin has its own version
and package metadata. Private plugins build normally but cannot be published
by `s2s deploy`.

`packages/global/**` is game-agnostic shared source, while
`packages/<game>/**` is shared source scoped to a game listed in
`workspace-policy.json`; directories below the scope are free-form.
`packages/` belongs only to npm. Do not create a package for a one-off helper.
A shared package should represent a coherent implementation boundary with more
than one real consumer.

Dependency boundaries follow the same matrix: global code may use global code
only; game-scoped code may use global and same-game code. Run
`npm.cmd run workspace:check` for a focused result. `npm.cmd run lint` invokes
the same check automatically before ESLint. Follow
[Plugin development](./plugin-development.md) for generator usage and plugin
placement.

`scripts/lib/*` contains focused logic shared by repository-specific CLI scripts. The neighboring CLI files handle Git, filesystem access, console output, and exit codes.

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

There is deliberately no custom loop over plugin directories for building,
versioning, or publishing.

## Shared source versus runtime interfaces

Use a private package under `packages/` when consumers need the same bundled implementation but do not share runtime state. Formatting helpers and configuration parsers are typical examples.

Use a plugin interface when one loaded plugin owns a runtime service or authoritative state. Permissions, player data, menus, and economies are typical examples. The producer publishes the interface; consumers declare it in `s2script.pluginDependencies` and resolve it with `ctx.use`.

The distinction is simple:

```text
Shared implementation -> private npm package
Shared runtime service -> Source2Script plugin interface
```

See [Plugin development](./plugin-development.md) for runtime interface guidance.

## Generated artifacts

Source2Script writes each built plugin's `.s2sp` package beneath that plugin's
`dist/` directory. The repository bundle tool writes server-scoped bundles and
their index beneath `artifacts/server-bundles/`. These paths are generated and
ignored by Git; source and manifests remain the reviewable inputs.

## Development and release routes

Use the [developer guide](./developer-guide.md) for installation, validation,
branch, and pull-request steps. Use
[Changesets, ownership, and releases](./releases.md) for versioning,
development delivery, production promotion, registry publication, and
hotfixes. Repository administrators configure the remote controls described in
the [repository setup guide](./repository-setup.md).

## Server-repository deployment ownership

This repository builds server-scoped plugin bundles and uses GitLab trigger
tokens to start affected development server pipelines. Server repositories own
runnable image builds, bundle selection, SSH deployment, compose files,
restart policy, and rollback. This repository never SSHes to game servers.
