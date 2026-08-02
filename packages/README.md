# Shared Packages

`packages/*` is reserved for private npm workspace packages shared by more than one plugin.

Do not add a package for one local helper. Keep helpers inside the plugin until a second real consumer exists.

Packages in this directory are not Source2Script plugins unless `package.json` also includes them in `s2script.workspace.plugins`.
