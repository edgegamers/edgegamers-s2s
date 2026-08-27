# Task 3 Report

- Added the complete stock special-round config snapshot and manifest values for BHop, Low Grav, Pistol, Suppressed, Vanilla, Rich, and Speed.
- Registered all seven stock definitions through `TttSpecialRoundsApi`, with public SDK Server operations isolated behind an injectable runtime adapter.
- Implemented BHop toggles, captured Low Grav restoration, Speed's initial deadline, Vanilla purchase cancellation, and Rich starting bonuses plus mutable-gain multiplication through the public Shop event API.
- Kept Pistol and Suppressed registered and configurable but unavailable, with explicit Core logs, because public inventory and weapon-effect APIs do not expose their physical effects.
- Added focused tests for config defaults, registration, server effects, Shop absence and events, Rich authoritative-write exclusions, and unsupported rounds.
- Verified focused and repository tests, typecheck, lint, elevated filtered build, `git diff --check`, and the public-import audit.
