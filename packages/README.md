# Shared Packages

`packages/global/**` is reserved for game-agnostic private npm workspace
packages shared by more than one plugin. `packages/<game>/**` is reserved for
packages scoped to a game listed in `workspace-policy.json`. Only the first
segment is policy, so directories below `global` or a game name are free-form.

Global code may use global code only; game-scoped code may use global and
same-game code. Run `npm.cmd run workspace:check` for a focused result;
`npm.cmd run lint` runs it automatically. Create plugins with
`npm.cmd run create:plugin -- <scope>/<optional-folders>/<plugin-name>`;
current examples are `plugins/global/maul` and `plugins/cs2/ttt`.

Do not add a package for one local helper. Keep helpers inside the plugin until a second real consumer exists.

Packages in this directory are not Source2Script plugins unless `package.json` also includes them in `s2script.workspace.plugins`.
