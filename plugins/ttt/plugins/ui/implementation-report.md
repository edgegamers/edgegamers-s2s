# Existing-port UI extraction

UI producer integrated and reviewed as part of the four-owner checkpoint. Owned scope: new `plugins/ui/**`, `packages/contracts/ui-types.ts` and identical `ui-wire.d.ts`. Core API/implementation/facade/callers remain Root-owned; no production Core edits, deployments, commits, native prerequisites or asset changes by this task.

Publication is `@edgegamers/ttt-ui`2.0.0, protocol2, hard dependency `@edgegamers/ttt-core`^2.0.0. Contract source SHA256 `a3bae9d852950c535288fee7da97620986619865f382e4d92dd0cbf7073be3f4`; shared finite fragment SHA `01caeb1fd3352bf873596f3ec35bac75a4e580543ff0bc4406ddd040dbe53aa3`. No SDK/native objects, callback fields or executable names cross the wire.

Stable reviewed candidate `.review/ui-candidate.s2sp` SHA256 `6cacee9916fe9b0f15c392238c6c25ffcdc9d0266cf72b29e4783e84ec4caad6`; compiled plugin.js SHA `68223afbaaf5c5ea815024d6ab9abe899207444b8d790d1660e897d883b7a463`. Full hashes in ignored `test/hashes.json`; regular dist archive is byte-identical at handoff.

The existing `cs2/ttthud.ts` constructor/specs were mechanically adapted: same `hudkit.spec`, explicit private `observable:false`, traitor badge, three distinct lazily claimed modals, existing widths/paging/buttons/details/toasts/fallbacks. No visual redesign. Three specs remain necessary because the current SDK footer handler array is per modal. Claims remain held until owner teardown, matching the existing workaround for duplicate handlers on release/reclaim. UI owns only per-viewer presentation state. Direct Shop/Reports/Sanctions/Player imports and writable onGuilty/onBan/logPage callbacks are removed.

Core finite model methods are defined in `UiModelMethods`. Core validates `UiActor {slot,steamId,generation,roundEpoch}` and makes final purchase/ruling decisions. UI captures that actor on open and revalidates around model/action calls. Rows store semantic item/report IDs from what was rendered, so model reordering cannot redirect an action. Purchase retains0.3-second debounce. Report sanctioning is one Core `ruleUiReport` call with an owner-produced status/title/message/tone, so the UI never calls a ban callback after a refused/already-ruled verdict. Core owns actual atomicity and sanction tests.

Each viewer retains a distinct log page snapshot and browse index. Both supplied round-end logs and browser pages require fresh authorized `getUiLogPage`; rows/subtitle/detail reauthorize rather than expose cached data after admin revocation. Reports similarly reauthorize reads/selection/actions. Invalid actor state clears badge/sheets/cache; an old actor cannot hide or forget a successor's new view. OnPluginEnd independently disposes the instance and forgets every retained viewer. Missing pool/layout returns the original fallback values.

Verification:
- Actual skeleton CLI archive:8 behavior outcomes RED/1 fallback passed (`test/red.log`). Initial missing-publication compiler error was corrected before this meaningful RED archive run and is not counted as behavioral evidence.
- Actual implemented archive: explicit teardown regressions RED for stale private views and retained method reopening; privacy regression RED for cached rows after revocation (`test/teardown-red.log`, `privacy-red.log`).
- Final actual CLI archive:18/18 focused outcomes pass (`test/green.log`). Covers distinct specs and footers, unavailable/pool fallback, two-viewer logs, item/report reorder, duplicate Buy, actor reuse, admin revocation, truthful refused ruling, ban confirmation reset, Core reentry, fresh subtitles, stale private reads, disposal and finite publication metadata.
- `node_modules/.bin/s2s build plugins/ui` exits0; `node_modules/.bin/tsc --project plugins/ui/tsconfig.json` exits0. CLI-generated associations use the actual Root Core declaration, with no fake augmentation/casts.
- Tests run via `node --test plugins/ui/test/*.mjs`, load the actual ZIP JavaScript, and replace only engine-owned modules and the Core boundary. They do not prove real cross-context/native rendering or Core sanction side effects.

Root integrated the Core owner/facade, independently reviewed this UI producer, and passed the combined 179-outcome pipeline plus strict checks. Real workshop clients remain required for badge/shop/RDM/log rendering and private views. This is a UI producer completion claim only; no live rendering or complete port claim.

Root review follow-up: first hideAll(valid actor) now captures a previously uncaptured current actor before hiding default-visible panels. Actual archive regression was RED (no hide) then GREEN; stale actor cannot hide successor remains passing. Evidence test/hideall-red.log; full focused18/18 GREEN.
