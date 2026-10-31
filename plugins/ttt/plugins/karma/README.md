# Karma

Karma 2.0.0 extracts the existing port's policy into its own plugin. It requires Core 2.x and publishes the finite methods in `api.d.ts`. Core owns round/registry state and dispatch order; Karma owns its slot tables, SteamID persistence maps, pending deltas, first-hit ledger and timeout state.

The formulas and event callbacks are copied from the old implementation. Score writes, warnings, low-karma command/ban/kick behavior remain the same. There is no SQL implementation in this baseline, and this extraction adds none. Values remain unclamped; `MAX_KARMA=100` is the existing economy divisor, not a storage ceiling.

Core attaches the seven ordered handlers at the original installation positions and replays `karma.join` only for current occupants. Karma does not seed them a second time. The existing teardown calls `resetRound` at its original position. Provider unload clears owned callbacks; the framework revokes published handles. Core defines the explicit behavior while the optional Karma provider is absent.

Configuration still has one owner: Core's existing Karma ConVars and derived settings. The low-karma command remains a live `Server.getCvar` read so an empty command disables punishment. Moving those knobs to Karma JSONC requires moving registration and the economy consumers together; this extraction does not add duplicate settings.

From the repository root:

- `npm run build` builds the real plugin archives.
- `npm run typecheck` checks source and generated contracts.
- `npm test` builds and tests all workspace members.
- `npm test --workspace @edgegamers/ttt-karma` runs policy and archive tests after a build.

Archive tests execute the actual CLI payload with controlled SDK/Core boundaries and copied domain messages. They verify application behavior, not live engine or native inter-plugin transport acceptance. Root owns matched-runtime integration and independent review.
