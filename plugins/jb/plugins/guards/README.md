# @edgegamers/jailbreak-guards

The guard queue and CT bans: `!guard` joins the queue for CT, the prisoner:guard ratio fills and
trims CT at round start and end, playtime priority orders the queue (with Dedicated Supporter skip
chances), and eG+ admins issue, revoke and inspect CT bans. Ported from the EdgeGamers CTBans
plugin (CounterStrikeSharp) in `jb-old/ctbans`, with its SQL moved out of the game thread and its
hard-coded numbers moved into config.

Hard-depends on `@edgegamers/jailbreak-core` (round lifecycle, round mode for special days).

## Files

| File | What |
| --- | --- |
| `src/plugin.ts` | Wiring only: config, core forwards, the published contract, named publics. |
| `src/store.ts` | The only DB code: open `jailbreak_guards`, create tables, parameterized queries, reconnect, bounded write retry. |
| `src/writeq.ts` | Pure write-queue policy: priority-write coalescing and overflow eviction (unit tested). |
| `src/ctbans.ts`, `src/cache.ts`, `src/players.ts` | Per-online-player cache (latest ban, priority, load state), expiry timers, alive-time priority tick. |
| `src/bans.ts`, `src/priority.ts`, `src/ranks.ts` | Ban model and repeat-ban penalty, effective priority and skip rules, rank ladder and caps. |
| `src/queue.ts`, `src/queueing.ts`, `src/ratio.ts` | Ordered queue with prioritized insertion; round-start fill and round-end trim counts. |
| `src/teams.ts` | `jointeam` hook, round start/end balancing, special-day tracking. |
| `src/commands.ts` | Every chat/console command. |
| `src/messages.ts` | Every player-facing string. |
| `src/rows.ts`, `src/ids.ts`, `src/config.ts`, `src/env.ts` | DB row decoding, SteamID parsing, config parsing, environment helpers. |

## Commands

| Command (SM name) | Who | What |
| --- | --- | --- |
| `!guard` / `!g` (`sm_guard`, `sm_g`) | everyone | Join the guard queue. Refused below `min_priority_for_ct` unless rank is eG+. 30 s cooldown. |
| `!leave` / `!l` (`sm_leave`, `sm_l`) | everyone | Leave the guard queue. |
| `!queue` (`sm_queue`) | everyone | List the queue as `[n]: effective/max – name`. |
| `!priority` (`sm_priority`) | everyone (target: eG+, set: manager+) | Show your effective / max / raw priority, or another player's. Manager+ can set a value. |
| `!ctban <target> <minutes> <reason>` (`sm_ctban`) | eG+ | Issue a CT ban. Duration is capped by rank (see below). |
| `!revoke <target> <reason>` (`sm_revoke`) | eG+ | Issue a `revoke_minutes` CT ban. |
| `!unctban <target \| SteamID64 \| SteamID3 \| community ID>` (`sm_unctban`) | eG+ | Lift a CT ban. Works for offline players (looked up in the DB). |
| `!lcb [1]` (`sm_lcb`) | eG+ | List active CT bans; `1` includes offline players (DB query). |
| `!ctbans` / `!cthistory <target \| SteamID>` (`sm_ctbans`, `sm_cthistory`) | eG+ | Full ban history with Revoked / Expired / minutes left / Permanent annotations. |

`!guard` from the team menu (choosing CT while CT is occupied) runs the same `!guard` logic with
chat replies. When CT is empty the team menu joins CT directly (and leaves the queue), as long as the
player's data is loaded and they are not CT banned; a CT-banned or not-yet-loaded player is redirected
to the `!guard` logic instead (ban reminder, or "priority couldn't be loaded yet"). "Empty" means no
real player on CT: bots don't count, unverified players do. A player whose SteamID is not verified yet
cannot pick CT (moved to T with a notice). A guard re-picking CT is a no-op.

`!ctban` and `!revoke` target online players only, and refuse while the target's data is still loading.

## Config (`package.json` `s2script.config`)

| Key | Default | Meaning |
| --- | --- | --- |
| `prisoner_to_guard_ratio` | 2.0 | Prisoners per guard (CTBans `PrisonerToGuardRatio`, 3.0). |
| `min_priority_for_ct` | 120 | Priority (minutes alive) needed to guard; eG+ are exempt. |
| `priority_caps` | `default=480,ego/e=500,ego/dssilver=600,ego/dsgold=650,ego/dsplatnium=700,ego/dsroyal=750` | `group=cap` pairs; a player's cap is the highest of their groups' caps, else `default`. |
| `rank_groups` | `e=ego/e,eg=ego/eg,ego=ego/ego,advisor=ego/advisor,manager=ego/manager,srmanager=ego/srmanager,commgr=ego/commgr,root=ego/root` | `rank=admin group` pairs (MAUL ranks). |
| `allow_dangerous_ctbans` | false | Let manager / srmanager / commgr issue uncapped and permanent CT bans. |
| `guard_cooldown_seconds` | 30 | Seconds between `!guard` uses. |
| `restart_delay_seconds` | 5 | `mp_restartgame` delay when the first guard queues into an empty CT. |
| `priority_tick_seconds` | 60 | Seconds per +1 priority for alive players. |
| `priority_min_players` | 5 | Real players needed for priority to accrue (unless a chat admin is online). |
| `revoke_minutes` | 15 | Length of a `!revoke` CT ban. |
| `ctban_max_minutes` | 60 | Longest CT ban below manager rank. |
| `ctban_max_minutes_manager` | 20160 | Longest CT ban for manager / srmanager / commgr (unless `allow_dangerous_ctbans`). |
| `ctban_immediate_move_minutes` | 15 | Bans longer than this move the target to T immediately. |
| `penalty_window_hours` | 8 | Repeat-ban penalty window. |
| `penalty_min_bans` | 2 | Bans within the window that trigger the priority penalty. |
| `prune_after_days` | 90 | Delete non-permanent bans that ended this long ago (on map start). |
| `db_retry_seconds` | 30 | Seconds between DB reconnect attempts. |

`priority_caps` and `rank_groups` are comma-separated `key=value` strings. Malformed pairs are
skipped with a logged warning.

## Behaviour

- **Queue order**: effective priority is `min(stored, rank cap)`. A joiner walks from the back toward
  the front and may be skipped by Dedicated Supporters with a chance based on their priority. Players
  pushed back are told why.
- **Round start**: CT-banned guards go to T; guards below `min_priority_for_ct` (rank under eG) go to
  T; then CT is filled from the queue to `floor(T / ratio)` (at least one guard when CT is empty).
- **Round end**: CT-banned guards go to T. Unless this round was a special day, CT is trimmed to
  `ceil(T / ratio)` (at least one guard) and the removed guards, lowest priority first, are moved to T
  and re-queued.
- **Special day this round**: "special day" means core reported mode `specialday` at any point in the
  round. Days that hand the mode back before round end still skip the round-end trim. CT-ban
  enforcement always runs.
- **Priority unknown**: while the DB is down or a player's data is still loading, that player's
  priority (and ban) is unknown. `!guard` replies "priority couldn't be loaded yet", the team menu
  won't put them on an empty CT, and round start does not move them for low priority. Loads retry
  every `db_retry_seconds`, and every unloaded player is reloaded as soon as the DB (re)connects.
- **Late ban discovery**: when a load reveals an active CT ban, the player leaves the queue; if they
  are on CT they get the ban reminder and are moved to T.
- **CT bans**: duration cap by issuer rank (`ctban_max_minutes`, or `ctban_max_minutes_manager` for
  manager / srmanager / commgr, uncapped for root and console). Over-cap requests are reduced with a
  notice. Bans over `ctban_immediate_move_minutes` move the target to T at once. Expiry is broadcast,
  then the repeat-ban penalty runs.
- **Repeat-ban penalty**: on expiry, if at least `penalty_min_bans` non-revoked bans ended within
  `penalty_window_hours`, their summed minutes are deducted from the player's priority.
- **Priority accrual**: every `priority_tick_seconds`, +1 to each alive real player, but only when at
  least `priority_min_players` real players are online (or a chat admin is online).

## Storage

Two tables, identical to the CS# plugin so the live EdgeGamers database can be pointed at directly:

```sql
CREATE TABLE IF NOT EXISTS `ctbans` (`SteamID` BIGINT NOT NULL, `Admin` BIGINT NOT NULL,
  `Reason` VARCHAR(255) NOT NULL, `Duration` BIGINT NOT NULL, `Timestamp` BIGINT NOT NULL PRIMARY KEY);
CREATE TABLE IF NOT EXISTS `priorities` (`SteamID` BIGINT NOT NULL, `Priority` BIGINT NOT NULL,
  PRIMARY KEY (`SteamID`));
```

`Duration` is seconds: `0` is permanent, negative is revoked (a revoked permanent ban is `-1`).

The connection is named `jailbreak_guards` in `databases.json`:

```json
{
  "jailbreak_guards": {
    "driver": "mysql",
    "host": "db-host",
    "port": 3306,
    "user": "jailbreak",
    "password": "…",
    "database": "jailbreak"
  }
}
```

- **No entry**: the plugin uses s2script's automatic local SQLite and creates the tables there.
- **Configured MySQL never falls back to SQLite.** If the configured database is unreachable, the
  plugin stays loaded, logs the error, and retries every `db_retry_seconds`. This avoids two split ban
  stores.
- **While disconnected**: bans and unbans apply in memory and are queued for write. Joiners are marked
  as priority unknown (see above) and loaded when the DB comes back. Priority ticks stay in memory and
  are not queued (a leaving player's priority still is); they are written on the first tick after the
  DB reconnects.
- **Write queue**: at most 500 pending writes. A priority write replaces any waiting write for the same
  player. When full, the oldest waiting priority write is dropped first, so ban writes survive an
  outage; a ban write is only dropped once no priority write is left to drop.
- **Failed writes** are attempted up to 3 times, then dropped with a log line. Unloading logs how many
  writes were still pending.

## Known gaps

- **Repeat-ban penalty needs the player online at expiry.** Expiry (and with it the penalty) only runs
  for online players, as in the spec; a player who disconnects before their ban ends is never
  penalized for it.

## Ranks and admins

Ladder: `none < e < eg < ego < advisor < manager < srmanager < commgr < root`. Each rung maps to an
admin group through `rank_groups`. A player's rank is the highest rung whose group they are in. With
no mapped group, the `ROOT` flag gives root and the `BAN` flag gives eG.

Dedicated Supporters without admin rights are listed in `admins.json` with `groups` and no flags. For
example, a Dedicated Supporter at Gold:

```json
{ "76561198000000000": { "groups": ["ego/dsgold"], "flags": [] } }
```

Their priority cap comes from the `ego/dsgold` entry in `priority_caps`.

## Contract (`api.d.ts`)

Synchronous, cache-backed reads: `isCTBanned(steamId)` (online players only), `getBan(steamId)`,
`getPriority(steamId)` (effective; `-1` when unknown), `queuePosition(steamId)` (0-based; `-1` when not
queued), `queueSize()`.

Forwards: `OnCTBan`, `OnCTUnban`, `OnQueueChanged`.

## Live checklist

Run on the jb staging server with at least 3 players. Bots count for team sizes but are excluded from
the queue.

- [ ] `!guard` below 120 priority is refused and eG+ bypasses
- [ ] queue order follows priority and a DS above 480 can skip
- [ ] CT from the team menu redirects to the queue (and is allowed when CT is empty)
- [ ] a guard re-picking CT from the team menu is a no-op
- [ ] round start fills CT to `floor(T/2)`
- [ ] round end trims to `ceil(T/2)` and re-queues
- [ ] no trim after a special day (start one with `!sd`)
- [ ] `!ctban` on a guard over 15 min moves them to T
- [ ] expiry broadcasts
- [ ] `!unctban <steamid>` works for an offline player
- [ ] `!lcb 1` lists offline bans
- [ ] reconnect after `!unctban` of a permanent ban is NOT banned
- [ ] SQLite (no `databases.json` entry) and MySQL both create the tables and persist across a restart
- [ ] with the DB down, `!guard` says "priority couldn't be loaded yet" and round start does not move the guard
