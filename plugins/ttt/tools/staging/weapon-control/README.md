# Standalone current-SDK weapon control

Diagnostic only. Loading registers one command and prints usage. No automatic weapon effects, TTT dependencies/publications, model/transmit/UI/camera/input subscriptions, movement writes, timers or native patch. Official SDK 0.27.1 / CS2 0.19.1; uses public GameRules.get(), Player, Clients, Admin, Pawn.removeWeapon/giveNamedItem and controller schema wrapper only.

Server-console commands (explicit current living bot or human slot 0–63):

    ttt_weapon_control 4 bare
    ttt_weapon_control 4 revolver
    ttt_weapon_control 4 bundle

ROOT player's own developer console (self only, SDK Admin.forSlot().hasFlags(ADMFLAG.ROOT)):

    ttt_weapon_control bare
    ttt_weapon_control revolver
    ttt_weapon_control bundle

`bare` refuses when any held primary exists and immediately grants only weapon_m4a1_silencer. `revolver` removes current pistols and grants only weapon_revolver on the next actual public OnGameFrame (PRE). `bundle` removes primary/pistol slots then grants weapon_m4a1_silencer and weapon_usp_silencer on the next PRE. Same item-definition classification as old TTT, including unknown valid definitions defaulting to primary; unreadable definitions refuse. Weapons, slots and modes are not arbitrary strings.

Operation pins private Client lifetime, controller/pawn full refs, actual CBasePlayerController possessed pawn, map, plugin epoch and public engine roundStartTime. Every grant/removal and subsequent grant is sealed; dead/spoof-dead pawn (lifeState!=0), changed possession, native connection, map, round, unload or revoked self ROOT refuses. There is one pending operation, a 2-second deadline (clock rollback/nonfinite also refuses), no retries, no successor cleanup. MapEnd closes new admission until MapStart. Selected weapons retain their exact ref and must still have the captured pawn as owner immediately before removal. Final liveness reads follow client/privilege checks; the trailing owner epoch comparison is pure. An operation may have partially removed/granted before a refusal; inspect rather than retry blindly. OnGameFrame does no SDK work without a pending job.

Output is bounded primitive stage+boolean only, no identities/refs/coordinates. `entity-remove-not-unequip` is the historical diagnostic label. Its interpretation predates the corrected SDK: owned removal now reports accepted void dispatch and does not call a second EntityRef.remove. A true grant result is a live returned weapon, not proof of client viewmodel, possession, movement or successful equip.

## Historical native isolation and restoration

This temporary mode ended on October6 at00:02:28 UTC. Normal TTT is restored with25 owners, and the fresh Items precache map cycle completed. The [corrected WeaponServices removal package](../../../docs/evidence/staging/weapon-removal-receiver-2026-10-06.md) was subsequently deployed. This standalone helper is not currently installed; the user declined the proposed receiving-client sequence.

On October5 at23:30 UTC, Root installed this control on the existing staging container at104.128.62.174:27025 with14 stock plugins and no TTT plugins. Native libraries, image, game files, launch arguments, credentials and configuration files were preserved. The final state archive is7ab793162142a09374be18697e3c97e5965489109c3f8fd0bd0ba1ebbbc4f3ba. Zero humans/bots were confirmed before handback; a living bot's bare M4 grant succeeded before bots were removed for the receiving-client test. The first startup readiness poll failed and automatically rolled back; the subsequent attempt waited for TCP/RCON readiness successfully. This is temporary diagnostic mode, not a freeze fix.

The original11 TTT/probe archives are checksum-preserved under `/home/ghirakawa/s2s-ttt-staging/private/weapon-control-isolation-20261005-ready/ttt-plugins`. Root's explicit `restore.py` checks zero humans, exact cohort/native/config hashes and container/image identity before restoring25 owners. The accepted restoration was executed on October6, and the fresh map/precache lifecycle and eight bots were restored. Inspect any failed restoration before rerunning it.

Historical proposed receiving-client sequence (declined; no result claimed): join a playing team, confirm ordinary movement with the spawn pistol, then use `ttt_weapon_control bare`. Report whether movement/hands change. Use `ttt_weapon_control revolver` separately and select the revolver with2; report whether the change occurs on grant or selection. `ttt_weapon_control bundle` tests the M4A1-S/USP replacement path. Commands can partially remove/grant before refusal; do not retry an uncertain operation blindly.

General load procedure:

1. Freshly verify zero humans and preserve complete installed archives/config/runtime/private state. Arrange the intended isolation with the current framework and CS2 package, no TTT owner plugins, according to Root's lifecycle plan. Do not uninstall or modify native suppliers.
2. Load only `dist/ttt-weapon-control.s2sp` into the isolated staging plugin cohort (hostname must remain exactly s2s-ttt-staging). Preserve existing admin choices; a self-client needs genuine ROOT. No source-provided SteamID grant.
3. After a receiving client joins, establish ordinary native movement/weapon baseline, then explicitly issue one selected command. For bare control, the primary slot must already be empty; this helper will not clear it. Server console can select the consenting human; self console can target only itself.
4. Compare receiving-client first-person hands, movement and authoritative read-only snapshots before/after. Headless bot acquisition is not receiving-client proof. No cvar/model/camera workaround is applied here.
5. Root unloads helper and restores the exact preserved cohort/config when done. No automatic removal of granted items targets an uncertain successor.

## Local gates

From the repository root: `node_modules/.bin/s2s build tools/staging/weapon-control` and `node_modules/.bin/tsc -p tools/staging/weapon-control/tsconfig.json`.

Run tests from this directory:

`ARCHIVE=dist/ttt-weapon-control.s2sp node --test control.test.mjs`

`ARCHIVE=dist/ttt-weapon-control.s2sp node --test --test-name-pattern=ASTRA astra-peer.test.mjs`

35 author archive tests plus3 independent adversarial archive cases pass, with actual CLI build/strict/peer review. Integrated source is byte-identical; its archive differs only in the bundled source-path comment (integrated SHA0d65b91456e47a04977dab54fc2107e74d7f5b4005458670e675589b745a8fcb). Use the ASTRA name filter: that peer file also retains historical pre-fix fixtures with intentionally incomplete owner doubles. These tests prove diagnostic guards/order/deferral and reentry effects, not native or human-client acceptance. Initial inert registered-command RED had5 failures/14 passing guards. Three peer-discovered admission/ownership/liveness gaps were RED on rejected d339 and GREEN on accepted ff2; the subsequent state command changes no grant admission or effects. The added late-possession test also passed before its final redundant seal; it is coverage, not a claimed causal RED.

## Read-only admission state

Server console only, exact staging hostname and no arguments:

    ttt_weapon_control_state

Copies at most 64 current client/pawn observations. Each bounded JSON line contains one numeric-slot row (bot, pawnValid, health, lifeState, possessed match, activeDef) plus active/mapEpoch and public roundStartTime type/finite value or null. No names, SteamIDs, native ref IDs, positions or callbacks are emitted. Missing native round data stays null; grant admission is not weakened. Native target retirement during the read discards the result. This command never grants or removes weapons and adds no subscriptions or timers.
