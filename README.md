<p align="center">
  <picture><source media="(prefers-color-scheme: dark)" srcset="https://shieldcn.dev/header/graph.svg?title=edgegamers-s2s&amp;subtitle=the+s2script+plugins+and+apis+maintained+by+EdgeGamers&amp;logo=tsnode&amp;logoColor=848484&amp;mode=dark&amp;align=left&amp;font=geist-mono&amp;border=false" /><img alt="s2script" src="https://shieldcn.dev/header/graph.svg?title=edgegamers-s2s&amp;subtitle=the+s2script+plugins+and+apis+maintained+by+EdgeGamers&amp;logo=tsnode&amp;logoColor=848484&amp;mode=light&amp;align=left&amp;font=geist-mono&amp;border=false" /></picture>
</p>

<div align="center">
  
This repository contains the Source2Script plugins and runtime interfaces
maintained by EdgeGamers in one npm workspace.

<div align="center">
  
[EdgeGamers Forums](https://edgm.rs) · [Repo Docs](./docs/navigation.md) · [s2s Docs](https://s2script.com)

<p align="center">
  <img alt="Info" src="https://shieldcn.dev/group/github/edgegamers/edgegamers-s2s/stars+github/edgegamers/edgegamers-s2s/contributors+github/edgegamers/edgegamers-s2s/ci+github/edgegamers/edgegamers-s2s/last-commit.svg?variant=branded&amp;size=xs" />
</p>

<p align="center">
  <a href="https://edgm.rs/discord"><img alt="Custom badge" src="https://shieldcn.dev/badge/Discord.svg?variant=branded&amp;size=xs&amp;logo=discord&amp;color=7289da" /></a>
  <a href="https://github.com/edgegamers"><img alt="Custom badge" src="https://shieldcn.dev/badge/EdgeGamers.svg?variant=branded&amp;size=xs&amp;logo=github&amp;label=Github&amp;color=211F1F" /></a>
  <img alt="badge" src="https://shieldcn.dev/badge/TypeScript.svg?variant=branded&amp;size=xs&amp;logo=typescript&amp;label=Stack" />
  <img alt="badge" src="https://shieldcn.dev/badge/Changesets.svg?size=xs&amp;label=Releases&amp;color=8b5cf6" />
</p>

## Documentation

Start with the [documentation navigator](./docs/navigation.md) or go directly
to the [developer guide](./docs/developer-guide.md). Maintainers and
administrators can use the [repository setup guide](./docs/repository-setup.md)
and [release guide](./docs/releases.md). Source and artifact obligations are in
the [licensing guide](./docs/licensing.md).

## Quick local validation

Run the local gate from the repository root:

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
```

The [developer guide](./docs/developer-guide.md) covers prerequisites, install,
Changesets, pull requests, and development-server validation.

## License

First-party work in this repository is dual-licensed under [MIT OR
Apache-2.0](./LICENSE). See the [licensing guide](./docs/licensing.md) for
the covered work, artifact policy, and maintenance details. Distributed
`.s2sp` plugin artifacts carry the complete MIT notice in `plugin.js`; the
repository source remains available under either license at your option.

Source2Script and every third-party dependency retain their own terms. This
repository's first-party license does not relicense them.
