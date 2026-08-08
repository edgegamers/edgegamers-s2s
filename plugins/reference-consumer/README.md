# Reference Consumer

This private plugin demonstrates how a Source2Script workspace consumer declares a runtime dependency, imports the producer's live contract, and resolves the implementation with `ctx.use`.

The contract comes directly from the sibling `@edgegamers/reference-api` workspace package. Do not copy it into `.s2script/types`; copied sibling declarations can become stale and are ignored by the workspace build.
