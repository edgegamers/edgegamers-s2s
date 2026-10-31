# Public API staging probe implementation report

Scope: only `tools/staging/public-api-probe/**`. No production source, workspace metadata/lock, framework, native binary, supplier, deployment or commit changes.

Ready for independent review and Root-controlled isolated staging. Stable candidate SHA256 `2d37ca03ccd698965bc6c3a1e9d713ae5fa46b02569af4f053fc1975578dea7a`. Full source/payload hashes are in `hashes.json`. No runtime patch dependency. No live effect observed or claimed.

Evidence:
- Initial actual CLI archive with empty OnPluginStart: seven required command behavior outcomes RED, metadata outcome passed (`red.log`).
- Actual implemented archive: named map-end regression RED (six native fixture calls instead of three), then corrected map admission (`map-red.log`).
- Final actual archived JavaScript:13/13 focused outcomes pass (`green.log`). Covers exact server/staging/LAN/human/argument gates, unavailable binding, bounded ring and overlapping refusal, native callback pawn replacement, readonly borrowed damage, registration failure, borrowed getter reentry, nonfinite/capped observations, human admission cleanup, unload/map teardown and complete escaped Unicode output.
- Actual published CLI scoped build exits0 (`build.log`), derives exactly `engine:calls`, manifest hard-depends Core/Karma ^2.0.0, protocol2, no legacy gamedata.
- Raw strict source check exits0 (`typecheck.log`, empty success). Uses only genuine SDK declarations and CLI-generated associations.
- No duplicate production test-suite run.

The HE descriptor is an exact byte copy of `plugins/core/gamedata/functions.jsonc`, SHA256 `f9afa04c003d75d7f06f763589993eb949f664a946f0cd763175109d83ef05dd`. Its prior binary evidence targets libserver SHA `d81faffb3e3a5f2001932b3b55a96c4ac05c2ed4b99702b06fc416b6e9bb5300`, entry0xd28710/prologue plus string-xref, four borrowed synchronous vectors established by stack caller0xd28c30→0xd28d0c. This report does not add a new binary or live validation claim.

Core verified type SHA `97372cb9cfa3c1f601f2077b8acfae858aa0229467cac6f874d697f780a48a0e`; Karma type SHA `00023a2a13d19d17e1314788e75930b15e405dddd72cc5589d647a9f2d2cf789`. Copies and publisher receipts remain package-local and regenerate from current archives.

Self-review: kept copied damage records synchronous, finite and bounded; retained original native connection/controller/pawn plus epoch/map around engine dispatch and callbacks; cleanup owns only returned refs and detaches state before external input; map end closes command admission until map start. Frame cleanup removes AsyncQueueFull admission concerns. Cleanup input success is reported as a request, not an observed removal. Human joins trigger next-frame cleanup, but cannot retroactively undo an already detonated grenade; Root must run the explicit mutation command only in the stipulated isolated staging server. Factory/binding availability, hook registration, actual callback observations and actual created refs are distinct receipts.

Remaining native acceptance belongs to Root: activate package on stock reviewed runtime with Core/Karma; run check; select a real current bot slot; watch then explicitly run HE; retain complete receipts; observe actual callback(s) and cleanup. Native factory success/damage delivery remain unobserved by this implementation task. Exact commands and interpretation are in README.md.
