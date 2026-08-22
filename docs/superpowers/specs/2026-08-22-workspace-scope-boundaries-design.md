# Workspace Scope Boundaries

## Summary

Organize Source2Script plugins and shared packages by one meaningful scope: the first directory below `plugins/` or `packages/`. That directory is either `global` or a game ID listed in repository policy. Everything below the scope directory is free-form organization.

The repository will discover package roots recursively and validate dependency edges without requiring developers to use custom imports, annotations, wrappers, or per-server metadata. Global code can reference only global code. Game-scoped code can reference global code or code from the same game, but never another game.

## Goals

- Permit arbitrary directory organization after the leading scope.
- Keep game and game-agnostic code from acquiring invalid dependencies.
- Cover plugins, shared npm packages, Source2Script runtime interfaces, and official game APIs.
- Catch violations through the existing development workflow.
- Give precise, actionable errors and report all violations in one run.
- Centralize recursive workspace discovery so repository tools agree about package ownership.

## Non-goals

- Model server names or enforce server-level dependency boundaries.
- Infer scope from any directory after the first segment.
- Change how developers write ordinary TypeScript or Source2Script imports.
- Automatically classify arbitrary third-party npm libraries by game.
- Automatically choose which plugins belong in a server bundle.

## Directory Model

Both workspace roots use the same layout:

```text
plugins/
├── global/<any folders>/<plugin package>
└── cs2/<any folders>/<plugin package>

packages/
├── global/<any folders>/<npm package>
└── cs2/<any folders>/<npm package>
```

The first segment is authoritative:

- `global` means game-agnostic.
- Any other first segment must be a game ID in the root policy file.
- Remaining segments have no policy meaning and may represent servers, features, teams, or any other organization.

A package root is a recursively discovered directory containing `package.json`. It must have at least one directory name after the scope segment, so the scope directory itself cannot be a package. Package roots may appear at any greater depth, but a package root may not contain another package root. Rejecting nested packages keeps file ownership and dependency resolution unambiguous; nested source directories remain unrestricted.

The initial migration is:

```text
plugins/maul -> plugins/global/maul
plugins/ttt  -> plugins/cs2/ttt
```

## Repository Policy

Add `workspace-policy.json` at the repository root with this initial shape:

```json
{
  "games": ["cs2"],
  "externalScopes": {
    "@s2script/sdk": "global",
    "@s2script/cs2": "cs2"
  }
}
```

The policy describes only scope. It does not list servers, package directories, or allowed dependency pairs. Adding a game is an explicit policy change, which catches misspelled top-level directories and makes new official game APIs deliberate.

References to an unclassified `@s2script/*` package fail closed with an instruction to classify it. Ordinary third-party dependencies are scope-neutral.

## Central Workspace Discovery

Add `scripts/lib/workspace-layout.mjs` as the single source of truth for:

- loading and validating repository policy;
- recursively discovering package manifests below `plugins/` and `packages/`;
- assigning each package its root kind and scope;
- mapping npm package names to package roots;
- mapping source files to their owning package;
- rejecting invalid first segments, duplicate package names, nested package roots, and malformed manifests;
- producing normalized, deterministic paths on Windows and Unix.

Repository tools that currently assume one directory level will consume this module:

- server-bundle discovery;
- Changeset package discovery and changed-file ownership;
- licensing workspace/plugin discovery;
- the new boundary validator.

npm workspace patterns will become `plugins/*/**` and `packages/*/**`. The Source2Script plugin pattern will become `plugins/*/**`. Root TypeScript includes will cover TypeScript source recursively beneath both workspace roots.

## Dependency Rules

Let the source scope be `global` or a game ID:

| Source | Allowed targets |
| --- | --- |
| `global` | `global` |
| game `G` | `global`, game `G` |

Every direct dependency edge must satisfy this table. Because global packages cannot lead back into a game and game packages cannot cross into another game, validating every direct edge also enforces the rule transitively.

The validator checks:

- static imports and exports;
- type-only imports and exports;
- literal dynamic `import()` calls;
- literal CommonJS `require()` calls when encountered;
- relative imports resolved to their owning workspace package;
- bare imports resolved by workspace package name;
- `dependencies`;
- `devDependencies`;
- `peerDependencies`;
- `optionalDependencies`;
- `s2script.pluginDependencies`;
- `s2script.optionalPluginDependencies`;
- first-party `s2script.libraries` references.

Source scanning covers `.ts`, `.tsx`, `.mts`, `.cts`, `.js`, `.jsx`, `.mjs`, and `.cjs` files below every discovered package. It excludes `node_modules`, `dist`, and `.s2script` generated output.

References within the same package are always valid. A relative import that crosses a package boundary is checked by the target package's derived scope; developers do not have to replace it with a package-name import solely for this policy.

Official external package classifications apply to the package name and all of its subpaths. Thus `@s2script/sdk` and `@s2script/sdk/chat` are global, while `@s2script/cs2` and its subpaths are CS2.

The checker does not attempt to infer the scope of unrelated third-party packages. If a future external package needs game classification, it must be added to repository policy.

## Boundary Validator

Add a focused policy module and a thin command-line entry point:

- `scripts/lib/workspace-boundary-policy.mjs` owns dependency extraction and rule evaluation.
- `scripts/check-workspace-boundaries.mjs` performs filesystem access, formats errors, and sets the exit code.

The implementation will reuse TypeScript's parser, already available in the repository, rather than using regular expressions for source imports. Common source-file discovery and import extraction will move to `scripts/lib/source-imports.mjs` and be consumed by both licensing and boundary validation. Licensing and game-boundary decisions remain separate policy modules.

Validation reports all errors in deterministic path and dependency order. An example is:

```text
plugins/global/maul/src/plugin.ts -> @s2script/cs2:
global code cannot reference the cs2-scoped package @s2script/cs2
```

Configuration and layout failures use the same concise style and identify the affected manifest or path.

## Developer Workflow

Add `npm run workspace:check` as the fast focused command. Run it automatically before ESLint as part of the existing `npm run lint`, so the standard contributor workflow remains:

```text
npm run lint
npm run typecheck
npm test
npm run build
```

The Source2Script creation flow will gain a thin scope-aware wrapper. Developers provide the intended repository-relative destination after `plugins/`:

```text
npm run create:plugin -- cs2/ttt/my-plugin
npm run create:plugin -- global/maul-helper
```

The wrapper requires the destination not to exist, validates the first segment, invokes the repository-pinned Source2Script generator for the final package directory, and rewrites the generated local `tsconfig.json` to extend the root configuration using the correct relative path. It then runs workspace validation. If generation or validation fails, it removes only the new destination created by that invocation, leaving no half-configured plugin. It does not require developers to edit workspace globs or package scope metadata.

Server bundle lists continue to select plugins by npm package name. Directory moves within a scope do not change bundle configuration or package identity.

## Error Handling

The validator fails safely when it cannot establish a trustworthy boundary. It rejects:

- unknown or misspelled game directories;
- package manifests directly below a workspace root with no scope segment;
- malformed policy or package manifests;
- duplicate package names;
- nested package roots;
- non-literal package-loading calls that prevent reliable classification, where source scanning already treats them as package loads;
- unclassified `@s2script/*` references;
- relative package-loading references that cannot be resolved to exactly one scanned source file;
- forbidden workspace or external dependency edges.

One run returns every independently discoverable error so developers can fix a batch without repeated command cycles.

## Testing

Use Node's built-in test runner and add a root `test` script. Tests will use small fixture layouts or pure policy inputs and cover:

- recursive discovery at different depths in both workspace roots;
- valid `global -> global`, `game -> global`, and `game -> same game` edges;
- invalid `global -> game` and cross-game edges;
- static, type-only, dynamic, CommonJS, relative, and bare imports;
- all checked npm and Source2Script manifest fields;
- official global and game API classifications;
- neutral third-party packages;
- unknown games, duplicate names, nested packages, malformed manifests, and unclassified Source2Script packages;
- changed-file ownership for Changesets at arbitrary depth;
- recursive server-bundle and license discovery;
- deterministic multi-error output.

GitHub Actions will run `npm test` between typechecking and building. Existing build artifact upload globs already support recursive plugin directories.

## Documentation

Update repository architecture, plugin development, shared-package, getting-started, local-development, and contributor documentation where they describe flat paths or validation commands. Document only the first-segment scope rule and emphasize that deeper organization is intentionally free-form.

## Success Criteria

- `maul` builds from `plugins/global/maul` and `ttt` builds from `plugins/cs2/ttt`.
- Packages at arbitrary depth are discovered consistently by npm, Source2Script, TypeScript, licensing, Changesets, bundles, and the boundary validator.
- A global package importing or declaring a dependency on CS2 fails validation.
- A CS2 package referencing a future different game fails validation.
- A CS2 package can use global and CS2 packages through ordinary imports.
- Moving a package within its existing first-segment scope does not change its permissions or require policy edits.
- Developers use the existing lint/typecheck/test/build workflow and add no code annotations or custom import APIs.

## Source2Script Compatibility Basis

The current Source2Script documentation defines `@s2script/sdk` as engine-generic and `@s2script/cs2` as the CS2-specific API. It also defines runtime interface requirements through `s2script.pluginDependencies` and `s2script.optionalPluginDependencies`. The boundary model follows those existing package and manifest seams rather than introducing a parallel runtime mechanism.

- https://s2script.com/docs/api/overview
- https://s2script.com/docs/authoring
- https://s2script.com/docs/concepts/interfaces
