# Two-client receiving acceptance

**Status: proposed script; receiving-client checks are pending.** Bot timings, archive tests and `sm_ttt_hud` success do not establish rendered HUDs, clicks, voice reception or workshop mounting. Record the final deployed commit, eleven archive hashes, CS2/server and client versions, map, UTC start/end, participant count and results before marking any row passed.

The October5 [production handback](../evidence/staging/owned-value-transport-2026-10-05.md) verifies runtime `0.7.0+value-copy.c8140bd885b2`, 25 running plugins, zero bots, Bodies enabled and normal live controls at the checkpoint. It restores production Core/Bodies/World and removes the temporary clock probe. Recheck that state before testing; the checkpoint does not establish a successful receiving-client join or carry result. The current map was primed after Items loaded; a later cold start needs its own model-registration check because the preserved start-ready helper still pins the older runtime.

## Operator handoff before either tester joins

- Verify the final accepted, uninstrumented set is restored and all 25 expected plugins are running without loader/interface errors. Diagnostic commands and profiler output must be absent from the acceptance run.
- Verify `104.128.62.174:27025` is reachable and VAC-secure with current matching server/client versions. Historical staging receipts establish this endpoint; they are not a fresh join check.
- Read back `sv_cheats 0`, `bot_stop 0`, `game_type 3`, `game_mode 0`. Restore the persistent test-control lines as well as live values. The model-entry timing receipt deliberately retained `sv_cheats`/`bot_stop` at **1/1**; the operator must hand back **0/0** after profiling.
- Verify exact account `76561198006662865` has ROOT. Tester A uses that account; Tester B stays an ordinary account with no admin flags. Do not publish admin files, credentials or the GSLT.
- Verify MultiAddonManager is loaded, version ≥1.6.1, and the configured extra/client addon readbacks include decimal `3790153369`. The documented setting is `mm_extra_addons "3790153369"` in `game/csgo/cfg/multiaddonmanager/multiaddonmanager.cfg`. Both clients must finish downloading and mounting that addon. See [official HUD operator setup](https://s2script.com/docs/concepts/hud#operator-setup).
- Keep the staging low-karma punishment command blank and record moderation settings. Conviction/slay testing below uses a consenting tester and separately identified test report. Do not execute the final ban action.
- Keep enough live participants for the scenarios: **eight total** permits two Traitors and one Detective in the current role formula; two humans plus bots can supply this. Two humans alone cannot exercise Detective assignment or buddy outlines. Record bot count and movement settings for each timing comparison.

The public probe's `ttt_public_owners`, `ttt_public_check`, `ttt_public_watch`, `ttt_public_he` and `ttt_public_cleanup` require server-console dispatch, staging hostname, `sv_lan 1` and zero humans. They belong to the separate bot-only run; do not change the public client session to satisfy them. `ttt_staging_identity` is a server-console-only identity diagnostic with no arguments, if the normal probe is installed.

## Short join, HUD and frame pass

1. Both clients run `connect 104.128.62.174:27025`. Walk, jump, switch weapons and use the normal buy/ping inputs. Record any out-of-date, addon/download, spawn-movement or disconnect error verbatim with UTC time.
2. A checks ROOT using **in-game console** `sm_ttt_myrole clear`, then reserves `sm_ttt_myrole traitor` before the next real deal. Repeat later with `detective` and `innocent`. This command is self-only and consumes the existing quota. The operator can use `sm_ttt_end` then `sm_ttt_start` in the correct round states. **Do not use `sm_ttt_setrole` for acceptance:** it changes bookkeeping without the role assignment visuals/loadout.
3. After an active client exists, A runs `sm_ttt_hud` if needed. Observe the full countdown and real role reveal: role message/badge, buddy names when applicable, health/armor, expected weapons, uniform and round clock. B records their own independently assigned role. A's `sm_ttt status` is a private diagnostic; B must be refused `sm_ttt status`, `sm_ttt_roles`, `sm_logs` and `sm_rdm`.
4. During an active round, each opens `!shop`, selects rows, changes pages and closes it. Reopen using the **player-ping input** (normally middle mouse); press ping again to dismiss and confirm movement/mouse control returns. Merely selecting a row must spend nothing. Press Buy once: one debit and one grant. Double-click an affordable row: exactly one debit and one grant; a single click, or two clicks on different rows, spends nothing. Repeat a limited purchase and an unaffordable purchase; verify a clear refusal and no extra debit/grant. Use `!balance` for the caller's balance. A/operator may set test funds with `sm_ttt_credits <slot> <amount>`; this is ROOT-only and sets the balance, not a purchase test.
5. Enable the clients' built-in telemetry/frametime display through CS2's settings; record the actual options used. Capture both client displays and operator server-frame logs for Waiting, the entire 15-second countdown, role activation, 60 seconds active idle, ten shop open/select/close cycles, and 30 seconds repeated USE. Pair each action with a UTC timestamp, participant count and ping. Client frametime, network delay and server-frame duration are separate observations. A missing server-frame log leaves the server-cost result pending.
6. Keep A's shop/badge and admin report/log sheet separate from B's shop. Have a dead client spectate the other in first and third person. With the current `observable:false` layout the spectator must keep their own UI and must not see the target's private role/buddy list, balance, catalogue, report reason or admin controls. Check reconnect and normal round end as well. Ordinary visible/observer checks do not establish packet-level confidentiality; record a stronger client-state inspection separately only if an established inspection tool is available.

## Voice, chat, bodies and reports

Keep the round active with surviving participants while testing the two human clients sequentially. Use short unique spoken/chat markers and record what the receiving client actually heard/saw.

| Scenario | Expected during an active round |
|---|---|
| Both alive | Ordinary voice/chat follows live policy; verify both directions and team chat. |
| A dead, B alive | A's dead voice does not reach B; repeat with ordinary B dead and A alive. |
| Both dead, others still alive | Dead voice reaches the other dead client; revival/new round removes the old restriction. |
| Dead ordinary chat | Dead recipients receive it. GENERIC admins are also entitled to dead **chat**, so A seeing it is not a leak. Voice uses the dead receiver list; do not infer an admin voice exception from the chat policy. |
| Traitor `@marker` chat | Only Traitor recipients receive it. With A Traitor and B ordinary non-Traitor, B must not receive it. The positive human-to-human Traitor-chat case remains pending until both have real Traitor assignments. |

1. Produce at least one **real weapon kill**, leaving the round active. Inspect corpse model/pose/collision and concealed scoreboard/death behavior from both clients. Approach the body and press/hold USE to identify; test weapon inspect as the alternative identification input. Hold USE on a carryable physics prop, move it, then release to drop. Check death, disconnect, round-end and map cleanup while carrying. `sm_ttt_testkill <victim> [killer]` is a ROOT diagnostic and does not replace this real-weapon check.
2. Produce a suspicious allied kill without the victim striking first. The victim receives a private Panorama "Were you RDM'd?" sheet naming the killer, with **Report** and **Not RDM**. Press Report: the sheet closes and a callout asks for the reason. Send a unique plain chat reason; it must be consumed privately and stored once, and a "Report filed" toast must replace the callout. The offer lasts 45 seconds; the accepted reason window lasts 120 seconds. Repeat with Not RDM, plain `cancel` while awaiting the reason, an unanswered offer (the sheet must close at expiry), an expired reason, reporter reconnect, accused departure and a round boundary. Later unrelated chat must resume normally. A spectator of the victim must not see the sheet, callout or toasts. `!rdmyes`/`!rdmno` remain the text fallback. Bare `!report` opens a player picker that lists names only (no alive/role hints); picking a player and pressing Report starts the same chat reason capture. `!report <slot> <reason>` remains the one-line manual filing path. With the HUD unavailable, every step must fall back to the existing chat lines.
3. A opens `sm_rdm`, selects the test report, verifies its reason and acquits it once. B's `sm_rdm`/`sm_logs` remain denied. In a separately identified consenting-tester case, A cycles Slays and convicts once; verify the selected queued debt is served once per round when that TTT round goes live (roles are dealt), not when the countdown opens: the slain player gets no role and stays dead for the whole round. Compare pre/post karma/debt with private operator records. Check that Ban requires its separate confirmation label, then close without confirming it. `sm_logs` while A is alive announces that the admin viewed logs; expect that notification.

## Buyer-only Cluster and held Tripwire

- **Cluster:** A, as a real Traitor, buys `clustergrenade` through the shop. Throw the buyer's HE and observe real bouncing child grenades, their detonation and credited damage/death. In a new purchase case, drop the granted HE for B to throw: B must not receive the Cluster effect; A's charge remains for A's next own HE detonation. Obtain A's replacement HE through normal map/pickup gameplay. Only one charge is consumed; child explosions must not recursively create more children. End/reload the round while children remain airborne and check cleanup on both clients.
- **Tripwire:** Buy `tripwire` while facing an irrelevant wall and verify the purchase leaves a held charge without placement. Close the shop, approach suitable opposing walls, aim at the first wall and make a fresh USE press. Body identification, prop pickup and defusing take priority over placement. A refused too-far placement keeps the charge. Inspect both anchors and the visible beam, arming cue, crossing trigger, shooting either armed anchor, defusing within reach and configured fellow-Traitor trigger/damage behavior. These are receiving checks, not proof from an entity-count readback.

The current two-anchor implementation has **no exclusive defuser ownership, no progress reset on released USE and no blast wall-occlusion trace**. The reporter's Panorama yes/no prompt and player picker are implemented ([ADR0013](../adr/0013-player-report-panorama.md)); per-incident selection beyond the latest kill is not. These were earlier Q13/Q14 requests. [ADR0003](../adr/0003-existing-port-api-upgrade.md) supersedes the Bara-first brief wherever it conflicts with preserving the existing port. Record these enhancements as scope follow-ups requiring review, not as implemented behavior or an automatic mandate to change this upgrade's gameplay. Test the current two-anchor and private-chat behavior without marking the earlier enhancements complete.

## All 21 current catalogue entries

For every row record **buy/debit/grant**, the listed client observation, refusal/limit behavior and end/reload cleanup. Status starts **pending** for every item; a successful shop opening covers none of these effects. “All” means the four shared entries; T/D use real Traitor/Detective deals. `sm_ttt_give <slot> <id>` is an admin effect diagnostic and bypasses the paid purchase path, so mark such a run separately.

| ID | Role | Required receiving observation / remaining gap |
|---|---|---|
| `armor` | All | Armor and helmet granted; actual protected damage. |
| `healthshot` | All | One held healthshot per purchase, healing on use, two-purchase limit. |
| `m4a1` | All | Configured rifle/pistol replace the intended slots; no unwanted floor drop. |
| `taser` | All | Deferred configured weapon grant/rebuy; private target-role result on a real hit. |
| `deagle` | D | One-shot revolver grant/ammo; enemy hit lethal, allied hit punishes buyer. |
| `stickers` | D | Real taser hit gives persistent public role reveal to both clients. |
| `dna` | D | Real-kill corpse scan, current trace/tracking/identification HUD; expired/no-DNA case and private target glow only if enabled. Description still says reveal the killer; record the current tracking behavior. |
| `healthstation` | D | Purchase places a station at current aim; visible prop, nearby healing, depletion and destruction. |
| `compass_body` | D | Body-direction HUD updates while moving; target removal and cleanup. |
| `c4` | T | Actual grant/plant/fuse/defuse/blast, attribution, self/fellow-T damage and active-count limit. Requires a plantable location and surviving participants. |
| `gloves` | T | Configured charges suppress kill/body DNA; moving a body, charges exhausted and next unprotected action. |
| `camo` | T | Reduced visibility and name behavior seen by the other client; restoration at end/reload. |
| `bodypaint` | T | USE on corpse changes appearance/identification behavior; configured charges and exhaustion. |
| `onehitknife` | T | First real knife hit and later ordinary hit, with damage attribution. |
| `silentawp` | T | Deferred held weapon/ammo, silent shots from the other client's hearing position, charge exhaustion. Record actual reserve ammo; do not infer it from the configured amount. |
| `poisonsmoke` | T | Real smoke, inside/outside and fellow-T behavior, damage/death attribution, expiry cleanup. |
| `poisonshots` | T | Configured pistol fire charges, misses consuming charges, poison on hit, expiry/cleanup; compare audible shot behavior. |
| `clustergrenade` | T | Buyer-only drop/pickup, real bouncing children, no recursion and airborne end cleanup above. |
| `damagestation` | T | Purchase-time placement; non-T hurt, T exemption, destruction and three-purchase limit. |
| `compass_player` | T | Direction HUD follows living targets while either client moves; target death/reconnect/end. |
| `tripwire` | T | Held charge, fresh USE placement, two anchors/beam, crossing/shoot/defuse; earlier exclusive/continuous/occlusion enhancements need the scope review above. |

Use additional rounds for charged/limited items. Purchasing station items is placement; buying Tripwire is not. [ADR0003](../adr/0003-existing-port-api-upgrade.md) and the current upgrade spec preserve all 21 existing-port items. Earlier CSS-only feature-selection discussions do not make this catalogue unapproved. Implementation is preserved; receiving-client acceptance of every entry remains pending.

## Buddy outline and lifecycle pass

1. Have A dealt Traitor with a second real assigned Traitor (a bot can be the outlined target) and B dealt a non-Traitor opponent. A should see the buddy outline through geometry as configured; B should not. Check target movement, death, observer modes and round end. Human-to-human permitted-viewer checks need both humans assigned Traitor in a later round; do not permanently grant B admin access to force that setup.
2. The operator reloads UI, Items, Bodies and Communication individually through the established loader workflow. Check each owner's existing surfaces/effects/carry/voice rules retire; other functionality returns. Record exact commands used by the operator rather than guessing a loader command here.
3. With a shop/report reason and a placed gadget or corpse present, reload Core only. Old badge/name tags/outlines, gadgets, carry and menus must retire before the next deal; stale clicks/reasons/timers must not act. Reports, slay debt and karma retained by their still-loaded owners must remain available; the abandoned active round counts once. Compare server-console `ttt_staging_identity` before/after if the normal probe is available: round/connection identities must advance. A map change has its own per-map resets; record them separately.

For each case record `passed`, `failed` or `pending`, UTC time, roles/alive states privately, steps, both receiving observations and correlated server logs. Public evidence excludes report reasons, hidden roles, credentials and raw admin configuration. End with `sm_ttt_myrole clear`; the operator verifies normal 0/0 controls and the intended final bot quota again. Any client crash, one-second server stall, leaked private view, lost movement/cursor, wrong buyer ownership or duplicate debit/grant is a failed case to reproduce and diagnose before accepting that area.

## Source audit basis

Verified against source checkpoint `3214f0f83d67a1f65f428c52b9d4609c4c85890e`: Core `src/commands.ts`, `src/plugin.ts`, `src/shop/items.ts`, `src/game/roles.ts`; UI `src/ttthud.ts`; Shop `src/catalog.ts`; Communication `src/communication.ts`; Reports `src/{flow,prompt}.ts`; Bodies `src/interact.ts`; Items `src/{effects,weaponfx}.ts`; normal public probe `src/plugin.ts`. Command examples above are registered commands, not proposed APIs. The coherent 610-test preview adds only Communication preflight and the accepted public model-entry scope to the reviewed production baseline; neither changes the commands or mechanics listed here. Repeat the audit if the final deployed source differs materially.
