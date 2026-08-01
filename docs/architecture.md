# Repository architecture

The repository keeps Source2Script-native behavior at the center. It adds only the local policy and documentation that Source2Script cannot know about EdgeGamers.

## Directory responsibilities

```text
edgegamers-s2/
├── .changeset/       Release intent for publishable plugins
├── docs/             Contributor and release documentation
├── plugins/          Source2Script runtime plugins
├── scripts/          Repository-specific policy and manifest tools
└── packages/         Reserved for proven shared source packages
```

`plugins/*` belongs to both npm and the Source2Script workspace. Each plugin has its own version and package metadata. Private plugins build normally but cannot be published by `s2s deploy`.

`packages/*` belongs only to npm. Do not create a package for a one-off helper. A shared package should represent a coherent implementation boundary with more than one real consumer.

`scripts/lib/*` contains focused logic that can be tested with explicit inputs. The neighboring CLI files handle Git, filesystem access, console output, and exit codes.

`artifacts/` contains generated development manifests. Plugin `dist/` directories contain generated `.s2sp` packages. Both are ignored by Git.

## Which tool owns what?

Source2Script owns:

- workspace plugin discovery;
- dependency-ordered builds;
- sibling-interface validation;
- version application and dependency cascading;
- registry deployment.

The repository owns:

- deciding when a changed publishable plugin needs a Changeset;
- formatting an immutable development-artifact manifest;
- EdgeGamers contributor documentation.

There is deliberately no custom loop over `plugins/*` for building, versioning, or publishing.

## Shared source versus runtime interfaces

Use a private package under `packages/` when consumers need the same bundled implementation but do not share runtime state. Formatting helpers, configuration parsers, and test fixtures are typical examples.

Use a plugin interface when one loaded plugin owns a runtime service or authoritative state. Permissions, player data, menus, and economies are typical examples. The producer publishes the interface; consumers declare it in `s2script.pluginDependencies` and resolve it with `ctx.use`.

The distinction is simple:

```text
Shared implementation -> private npm package
Shared runtime service -> Source2Script plugin interface
```

See [Plugin development](./plugin-development.md) for the working producer and consumer.

## Command flow

```text
npm install
    ↓
lint → typecheck → unit tests → s2s build
                                  ↓
                        plugin dist/*.s2sp files
                                  ↓
                    development manifest generation
```

Production follows a separate Changeset and registry path described in [Changesets and releases](./releases.md).

## Deferred infrastructure

The foundation does not configure GitHub Actions, branch rules, environments, artifact transport, or server reconciliation. Those concerns require EdgeGamers infrastructure decisions and will be implemented as later milestones.
