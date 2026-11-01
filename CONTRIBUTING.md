# Contributing

Use GitHub Issues in [edgegamers/edgegamers-s2s](https://github.com/edgegamers/edgegamers-s2s/issues) for bugs and proposals. Report vulnerabilities through [SECURITY.md](SECURITY.md).

## Local workflow

Use Node 24 and npm 11.19.0, then run these commands from the repository root:

```bash
npm ci
npm run check
```

Create a branch for your change. Keep it focused and describe the observable behavior, why it changes, and how you checked it in the pull request. For game behavior, include relevant manual CS2 smoke-test results or identify what still needs live verification.

## Workspace rules

- Keep one root install, lockfile and Changesets configuration. Bundle descriptors belong outside the npm workspace package list.
- Preserve bundle membership and optional integrations unless changing them deliberately. Jailbreak gangperks remains optional.
- Keep shared libraries private when they are inlined. MAUL uses `publishConfig.access: restricted`; `private: true` would prevent its publication entirely.
- Preserve the licenses, notices and attribution of imported code. Select upstream updates deliberately and update [UPSTREAMS.md](UPSTREAMS.md) when changing the imported baseline.

When editing Jailbreak's shared library, run `npm run types --workspace @edgegamers/jailbreak-shared` and commit the updated declarations with the source.

## Player/admin text

Before changing player/admin text, phrase catalogs or output routing, read [the translations and message guide](docs/translations.md). Follow its catalog, recipient-language, chat/console and plain UI rules.

## Changesets

Run `npm run changeset` for changes that affect shipped runtime plugins or their shared libraries. Select those packages and describe the user-visible change. Use patch for compatible fixes, minor for compatible functionality, and major for breaking behavior or public interface changes.

Bundle descriptors are handled by native s2s versioning: select their affected members rather than inventing separate npm packages for bundles. A private shared-library changeset must reach its consuming plugins; keep the declared dependency edges accurate. Documentation-only changes normally need no changeset.

CI verifies pull requests. Merged changesets are versioned and published automatically from `main`; there is no separate release PR. Let the workflow commit its generated versions and refresh the lockfile. Retry a failed publication through the Release workflow, retaining the same committed versions.

## Tests

Test external behavior at the highest useful boundary. Keep coverage for gameplay rules, authentication/access decisions, configuration/data handling and release safety. Existing behavioral suites are the starting point.

Temporary tests and development probes are welcome. Remove them after use when they only freeze source text, folder layout, command wording, snapshots of implementation details or other noncritical choices. A permanent test should catch a real regression while allowing the implementation to change.

Give behavior tests controlled phrases, settings, prices and display data. Routine edits to shipped wording, translations, colors, labels, layout, catalog size, prices or default values must not require test updates. Verify the behavior using those inputs: recipient language and fallback, argument substitution, escaping, private audiences, authorization, debits/grants, persistence and lifecycle boundaries. Keep exact assertions for protocol identifiers and persisted data contracts. Before retaining an assertion, name the bug it would catch; remove assertions that only record an editable product choice.

Run `npm run check` before submitting. A native build includes SDK type and safety checks; a passing local suite does not replace testing a plugin on a compatible game host.
