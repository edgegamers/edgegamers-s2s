## Contributor Guide

Thanks for helping maintain the EdgeGamers Source2Script plugins. Start by
checking the relevant plugin and documentation, then keep the change focused
and include tests when behavior changes.

Before opening a contribution, install dependencies and run the local
validation sequence from the repository root:

```powershell
npm install
npm run lint
npm run typecheck
npm test
npm run build
```

`npm run build` runs the repository licensing policy before the build and
checks the generated plugin artifacts afterward.

## Contribution licensing

This repository is dual-licensed `MIT OR Apache-2.0`. Unless you explicitly
state otherwise, any contribution you intentionally submit for inclusion is
provided under those same terms without additional conditions.

By submitting a contribution, you represent that you authored it or otherwise
have authority to submit and license it. Do not submit code, assets, or other
material copied from a third party unless its terms permit inclusion and you
preserve every required notice.
