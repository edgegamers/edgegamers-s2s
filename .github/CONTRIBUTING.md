## Contributor Guide

Thanks for helping maintain the EdgeGamers s2script plugins. Start by
checking the relevant plugin and documentation, then keep the change focused
and include tests when behavior changes.

Before opening a contribution, install dependencies and run the local
validation sequence from the repository root:

```powershell
npm.cmd install
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
```

Workspace scope is determined only by the first directory below `plugins/` or
`packages/`: `global` is game-agnostic, while a game name must appear in
`workspace-policy.json`. Directories after that first segment are free-form.
For example, the migrated plugins live at `plugins/global/maul` and
`plugins/cs2/ttt`. Run `npm.cmd run workspace:check` for a focused scope and
dependency-boundary result; `npm.cmd run lint` includes that check automatically.

`npm.cmd run build` runs the repository licensing policy before the build and
checks the generated plugin artifacts afterward.

## Contribution licensing

This repository is dual-licensed `MIT OR Apache-2.0`. Any contribution intentionally submitted for inclusion in this project shall be dual-licensed as above, without any
additional terms or conditions.

By submitting a contribution, you represent that you authored it or otherwise
have authority to submit and license it. Do not submit code, assets, or other
material copied from a third party unless its terms permit inclusion and you
preserve every required notice.
