# ADR0012 — Collect one Shop projection per Panorama paint

Accepted October 2, 2026. Source, runtime fixtures, native Shop comparison and exact production acceptance passed. Follows ADR0004's ordered purchase policy, ADR0010's bounded frame work, and ADR0011's native identity fences.

## Decision

Keep the initial Shop-open preflight, then collect one fresh copied model for each stock hudkit paint. The initial model cannot be reused through layout creation, modal claim, hide, and native client binding. A successful initial open therefore builds two models; a row-selection paint builds one. Stock collection runs rows, detail, buttons, title, then subtitle before submitting native writes.

Shop evaluates each visible item's display gate once and memoizes translated tie-break names within that invocation. A local mutation revision rejects a listing interrupted by wallet, count, catalog, reset, or owner changes. Core continues translating the copied rows and restoring the original Panorama catalog order. No projection is retained as purchase authority.

Every returned `UiShopView` has a required finite `UiShopStamp`: map epoch, round epoch, game state, role, alive/participating values, and a monotonic Shop attachment binding. Core's existing `matchesUiActor(actor, stamp?)` keeps native connection validation first and primitive identity/authority comparison last. The optional argument preserves existing general actor callers. The final pure identity seal compares connected status, SteamID, registry generation, and round identity after the last SDK callback, including same-Steam human and bot reconnects.

World and Shop projection admission use one private Core gate. Existing lifecycle hooks close it before startup, unload, or map cleanup, and reopen it only after successful cleanup and first-PRE retirement settlement. UI does not depend on a World provider to obtain this authority.

UI retains a unique, invocation-owned paint token. Rows, detail, and subtitle validate the collected stamp after native actor checks. Invalid authority triggers a controlled stock collection failure before native submission; only the still-owned Shop projection is retired. An outer failure cannot erase a nested newer paint or unrelated badge/report state. Role invalidation is distinct from connection invalidation.

Purchases still use the stable item ID selected from the rendered row and freshly execute Core/Shop price, role, limit, event, debit, grant, and refund policy. The purchase and economy policy golden hashes remain unchanged. Panorama stays client-specific with `observable: false`.

## Evidence and consequences

Actual archived Core/Shop/UI code with the pinned stock hudkit reduced initial-open inter-plugin calls from 360 to 70 and selection calls from 239 to 35. Both variants submitted the exact same native HUD recipe: 114 writes on open, 109 on selection, one paint each, and zero work on the following frame. These deterministic counts do not establish native wall-time gains.

The merged candidate passed 590 tests, ten owner strict checks, the staging probe strict check, eleven CLI-built archives, and all 28 exact producer/consumer declaration and wire-contract crossings. Actual archive tests cover post-model authority reentry, reconnects, malformed stamps, shared lifecycle admission, attachment ABA, and nested paint ownership. Independent review found no introduced P1/P2.

The required model stamp changes published fingerprints. Rebuild all consumers and the probe as one matched set before deployment. Do not mix these contracts with earlier artifacts.

Native baseline samples were 29/31/30 ms for direct model reads and 137/101/114 ms for successful UI opens. Candidate samples were 10/9/8 ms for model reads and 37/32/40 ms for successful UI opens: medians 30→9 and 114→37 ms. The candidate command window had no frame at or above 100 ms (maximum 54.42 ms); exact uninstrumented production acceptance passed. Receiving-client checks and remaining restart work stay open. See [Shop staging evidence](../evidence/staging/shop-performance-2026-10-02.md) for timestamps, hashes and limits.

## October5 SDK dispatch correction

The actual SDK binding/click comparison in [human-action lookup evidence](../evidence/staging/human-action-lookups-2026-10-05.md) corrects the earlier recipe count:114/109 component recipe operations produce123/5 engine HUD dispatches on initial open/selection because the SDK caches unchanged native writes. The accepted SDK changes preserve that exact recipe and cache while removing fresh Client factories from retained binding checks and replacing each context's64-slot click scan with one exact controller lookup. Retained native Client validity, explicit slot, view/component/epoch checks and action-time Core authority seals remain. Fixture counts establish removed work, not receiving-client latency or freeze resolution.
