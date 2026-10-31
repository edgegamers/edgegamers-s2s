# ADR0005 — One canonical configuration per extracted owner

Accepted during the existing-port extraction, October 2, 2026.

## Decision

Karma and Special declare the exact existing settings in their own typed plugin manifest. The current SDK materializes JSONC line-comment syntax at `configs/_s2s-ttt_karma.json` and `configs/_s2s-ttt_special.json`. These `.json` files are the sole writable authority. Do not add parallel `.jsonc` overrides. Preserve all 34 old names as aliases registered by their respective owner, and remove their registration and numeric snapshots from Core.

An alias writes through to its owner's canonical file. Accept it only after exact readback; refuse unseen disk edits and restore the prior alias on write failure. File reload mirrors aliases without creating a second settings store. Deferred historical alias notifications cannot overwrite newer canonical values. The offline importer parses configuration rather than executing console commands, preserves existing canonical values, and records input/output hashes.

## Timing

Numeric values remain an active round snapshot with pending validated edits. Core promotes owners at all four original refresh sites: plugin load, map start, startGame before Countdown, and bootstrap.gameState priority 10 for InProgress. At the latter site, role assignment and starting credits have already run; the Special priority 60 handler sees the refreshed snapshot. Keep this order.

The low-karma command retains its old live exception: an accepted empty string immediately disables that punishment. Legacy numeric input retains parse/clamp rules; typed JSON uses the SDK's type/range validation and defaults.

Core retains a copied observation of Karma's default and minimum for the existing economy formula. Its deprecated getKarmaSettings method projects that observation. Owner absence cannot create a second writable configuration authority. Configuration does not introduce MySQL persistence; that remains a separate operational deliverable.
