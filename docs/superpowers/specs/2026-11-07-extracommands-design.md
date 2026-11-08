# ExtraCommands

Approved direction: create `@edgegamers/extracommands` here from the command additions in s2script/s2script#327 and integrate them into the existing admin menu. Close that PR after verification.

## Approach

Use one optional plugin and release unit rather than extending the three stock command plugins or splitting these related additions across several products. Keep stock command names, aliases, permissions and public player-only self-kill. Existing SDK operations supply the implementation; stock commands such as freeze, slay and noclip retain their owners. Preserve the stock freeze regression fix separately as an upstream patch.

## Behavior and constraints

Commands and menus share handlers through native `Commands.dispatch`, preserving permission and immunity checks at execution. Player/option pickers use the published SDK. Pending menu selections and delayed actions must not cross connections, lives or maps. Menu options offer useful presets; text commands retain full validated ranges and item names.

Use one root workspace/lockfile, native s2s builds, a public package, an embedded English phrase seed, localized replies and plain console/UI output. Retain essential command and cleanup tests. Preserve unrelated local work. No registry or game-server deployment is requested.

## Verification

Run the plugin's behavior suites, native build/type/safety checks, root workspace checks and inspect the `.s2sp` archive. Report live-engine validation separately from mocked engine-boundary tests. Close #327 only after those checks succeed and the standalone replacement is durable in this repository.
