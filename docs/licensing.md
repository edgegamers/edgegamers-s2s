# Licensing guide

## License choice

First-party EdgeGamers source in this repository is available under the
dual-license expression `MIT OR Apache-2.0`. Recipients may choose the MIT
license or Apache License 2.0; they do not need to comply with both.

## What the repository license covers

The repository license applies to first-party EdgeGamers work in this
repository, including `.changeset/`, `.github/`, `docs/`, `plugins/`,
`scripts/`, root files, and future first-party `packages/` directories.

## What it does not cover

The repository license does not apply to installed dependencies, Source2Script
packages or runtime components, or future third-party bundled code. Third-party
names, logos, game assets, and Valve software remain subject to their owners'
terms and are not licensed by EdgeGamers through this repository.

## Contribution requirements

Contributors intentionally submitting work for inclusion submit it under both
license options, without additional terms or conditions. Submitters must have
authored the material or otherwise have authority to submit and license it.
Do not submit third-party code, assets, or other material unless its terms
permit inclusion and all required notices are preserved.

## Source files and package metadata

The root package and each workspace package declare `MIT OR Apache-2.0` in
their package metadata. The repository licensing check validates that metadata,
the required legal files, and the workspace and Source2Script plugin discovery
remain consistent. It also verifies the import declarations used by plugin
sources for licensing review.

## Distributed Source2Script artifacts

Published `.s2sp` plugin artifacts use the MIT option. Each plugin entry source
must preserve the complete MIT notice so the generated artifact contains it.
The artifact check verifies that every built plugin archive contains the
complete MIT notice in `plugin.js`.

## Third-party dependencies and assets

Installed dependencies and Source2Script runtime components retain their own
terms. Third-party names, logos, game assets, and Valve software are outside
the repository license. Do not treat this repository's license as permission to
reuse any of them.

## Validation commands

Run these checks when working on licensing, package metadata, plugin source
imports, or distributed artifacts:

```powershell
npm.cmd run license:check
npm.cmd run build
npm.cmd run license:artifacts
```

`npm.cmd run build` runs the repository licensing check before packaging and
runs the artifact licensing check afterward.

## Adding bundled third-party material

Before bundling third-party code, audit its terms and required notices. Update
the artifact notice mechanism to carry those obligations before distributing
the artifact.

## Authoritative files

- [`LICENSE`](../LICENSE) states the dual-license choice, repository scope, and
  exclusions.
- [`licenses/MIT.txt`](../licenses/MIT.txt) contains the canonical MIT terms.
- [`licenses/Apache-2.0.txt`](../licenses/Apache-2.0.txt) contains the Apache
  License 2.0 terms.
- [`licenses/NOTICE`](../licenses/NOTICE) is the attribution-only notice and
  does not add conditions to either license.

The package `license` fields and licensing scripts validate repository metadata
and generated artifacts; they do not replace these legal files.
