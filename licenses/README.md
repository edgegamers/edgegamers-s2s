# Licensing guide

## Rationale

EdgeGamers licenses its first-party Source2Script plugin work under the
dual-license expression `MIT OR Apache-2.0`. Recipients may choose either
license. The repository keeps canonical license terms and the attribution-only
NOTICE together so that the applicable terms are easy to find.

## File map

- [../LICENSE](../LICENSE) is the authoritative statement of the dual-license
  choice, repository scope, and exclusions.
- [MIT.txt](MIT.txt) contains the canonical MIT terms for EdgeGamers, LLC.
- [Apache-2.0.txt](Apache-2.0.txt) contains the Apache License 2.0 terms.
- [NOTICE](NOTICE) is an informational, attribution-only notice; it does not
  add conditions to either license.

## Scope and exclusions

The dual license covers first-party material in this repository. Installed npm
dependencies, Source2Script packages and runtime components, and any future
third-party bundled code retain their own terms. Nothing here grants rights to
third-party names, logos, game assets, or Valve software.

## Published plugin artifacts

Published `.s2sp` plugin artifacts use the MIT option. Each plugin's entry
source carries the complete MIT notice so it can be preserved in the generated
artifact. The source repository remains available under either MIT or
Apache-2.0.

## Bundled libraries

There are currently no bundled third-party libraries in the plugin artifacts.
Before distributing a plugin that introduces an `s2script.libraries`
dependency, audit the library's terms and all required notices. Do not
distribute it until the artifact notice mechanism has been updated to carry
those obligations.
