> Development in this monorepo: run `npm ci` and `npm run check` from the repository root. See [the contributor guide](../../CONTRIBUTING.md).

# Portal bridge

Sends game events from an EdgeGamers server to the CS portal (`edgegamers/s2s-cs-web`): every
Jailbreak round in full, and TTT rounds (roles, kills, bodies found, purchases, special rounds,
credits earned, playtime and the round log), which the portal turns into its round pages.

Game plugins never import this one. It listens to their forwards as optional dependencies, so a
server without it, or without a given game plugin, runs exactly as before.

## Install

Published as a restricted package, like MAUL: `s2s install @edgegamers/s2s-portal` with an
`S2SCRIPT_TOKEN` that can read it.

1. In the portal, an admin registers the server under **Servers** (`/admin/servers`) and copies the
   API key it shows once.
2. Set `portal_url` and `api_key` in this plugin's config. With either missing the plugin logs
   once and stays idle: it queues nothing and sends nothing.

The server's slug comes from the portal (it is in the token), so there is nothing else to set.

## How it sends

1. Each event is written to a local SQLite outbox (`Database.open("s2s_portal")`, which is
   s2script's local SQLite unless `databases.json` names that connection; leave it unnamed).
2. Every `batch_interval_ms` the sender trades the API key for a 15-minute token
   (`POST /api/v1/auth/token`, cached until a minute before it expires) and posts up to
   `batch_size` events to `POST /api/v1/events`.
3. On a 200 the batch's rows are deleted. The portal stores each event once by id, so a batch
   resent after a lost response only counts as duplicates.

While the portal is down, events stay on disk and the sender backs off (2s doubling to 5 minutes,
with jitter, or the portal's `Retry-After`), logging the first failure and then every 10th. When it
is back, the backlog drains in order. A restart in between loses nothing.

| Portal answer | What the plugin does |
| --- | --- |
| 200 | Deletes the batch from the outbox |
| 401 on events | Mints a new token once and resends |
| 401 on token (`invalid_client`) | Pauses: the key was revoked or rotated |
| 429, 5xx, network error, timeout | Backs off and retries; rows are kept |
| 400 `invalid_batch`, 403 `mode_not_allowed` | Holds the events named (kept, not resent) and sends the rest |
| Any other 400 or 403 | Pauses: it needs a code or config fix |

A pause or a held event is logged. Fix the cause, then run `portal_resume`.

## Live channel

Besides the outbox, the plugin holds one WebSocket to the portal's gateway
(`wss://<portal>/api/v1/live`, authenticated with the same token) for messages that are useless when
late. Contract: `docs/live.md` in `edgegamers/s2s-cs-web`.

| Message | What the plugin does |
| --- | --- |
| `skins.refresh` (a player saved skins on the website) | If that player is on this server, `@edgegamers/s2s-weaponpaints` `reload(slot)`: reads their rows again and applies them, as `!wp` does |
| `skins.policy.changed` (an admin changed the tier policy) | `@edgegamers/s2s-weaponpaints-ds` `reloadPolicy()`: fetches the policy now instead of at map start |

Both plugins are optional dependencies; without them the messages are ignored.

## Skins storage

With WeaponPaints' `storage` set to `plugin`, this plugin is where its selections live: game
servers need no database credentials and the portal's Postgres is never exposed.

| WeaponPaints asks | What the plugin does |
| --- | --- |
| `OnLoadRequested` (join, `!wp`, a `skins.refresh`) | `GET /api/v1/skins/{steamId}` with the server token, then `supply(slot, userId, rows)`; `null` on failure so the player can `!wp` again |
| `OnStoreWrite` (in-game menu choices, StatTrak counters) | `POST /api/v1/skins/{steamId}` with the writes; network errors, 429 and 5xx are retried 3 times (2s, 4s, 8s), then the change is logged as not saved |

While idle (no `portal_url` or `api_key`) loads answer `null` at once. When this plugin loads after
WeaponPaints, it asks WeaponPaints to reload everyone so nobody waits. With WeaponPaints'
`storage = "database"` none of this runs.

The socket reconnects by itself after any drop, waiting 2s doubling to 60s (with ±20% jitter) and
resetting once the gateway says hello. A close with 4401 mints a new token first; a revoked key
(4403) retries every minute. Three missed pings (75s of silence) count as a drop. After a
reconnect the policy is refetched once, in case a change was missed. Messages sent while
disconnected are not replayed: the player can always `!wp`, and nothing in game depends on the
socket. Failures are logged on the first and every 10th attempt.

## Events

Every event carries a ULID `id`, the `map` its round started on, a `round` id (a ULID made at round
start), `seq` (0, 1, … within the round), `ts` (wall clock ms) and `data`. Durations come from the
game's tick clock, not the wall clock: every event after the start has `data.atMs`, the ms since
round start.

A player on the wire is `{ steamId, name, team }` (`team` at that moment: `prisoner`, `guard`,
`spectator`, `none`), plus `bot: true` for bots.

| Type | From | `data` |
| --- | --- | --- |
| `jb.round.start` | core OnRoundStart | `number` (round since map start), `players: { prisoner, guard }` (humans), `bots`, `warmup`, `roster` (players on a team) |
| `jb.round.live` | core OnRoundLive | (none) |
| `jb.round.end` | core OnRoundEnd | `number`, `winner` (`prisoner`, `guard`, `none`), `mode` (`normal`, `lastrequest`, `lastguard`, `specialday`), `players`, `bots`, `adminEnded`, `roster`, `durationMs` (start to end), `liveMs` (freeze time end to end, or null) |
| `jb.mode` | core OnModeChanged | `mode`, `previous` |
| `jb.cells` | core OnCellsOpened | `source` (`warden`, `auto`, `admin`, `specialday`), `by` (player, or null) |
| `jb.rebel` | core OnRebelChanged | `player`, `rebel` (marked or cleared), `reason` |
| `jb.bomb` | core OnBombDetonated | `player` (the bomber), `killed`, `killedGuards` |
| `jb.log` | core OnLog | `message` (the `!logs` line, at most 512 characters) |
| `jb.warden.assigned` | warden OnWardenAssigned | `player` |
| `jb.warden.removed` | warden OnWardenRemoved | `player`, `reason` (`pass`, `fire`, `death`, `disconnect`, `team_change`, `admin`, `round_end`) |
| `jb.lr.enabled` | lastrequest OnLREnabled | `prisoners` (alive when LR became available) |
| `jb.lr.start` | OnLRStart | `lr: { id, type, prisoner, guard }` |
| `jb.lr.end` | OnLREnd | `lr`, `result` (`prisoner_win`, `guard_win`, `timed_out`, `interrupted`) |
| `jb.lastguard.start` | OnLastGuardStart | `guard`, `prisoners` |
| `jb.lastguard.end` | OnLastGuardEnd | `guard`, `result` |
| `jb.specialday.start` / `.end` | specialdays forwards | `type`, `name`, `starterSteamId` |
| `jb.death` | `player_death` (pre hook) | `victim`, `attacker` (null for the world or a suicide), `assister`, `weapon`, `headshot`, `victimRebel`, `attackerRebel` |
| `jb.hurt` | `player_hurt` | prisoner on guard only: `attacker`, `victim`, `damage` (health), `weapon`, `attackerRebel` |

Deaths are read in the pre hook because core clears the victim's rebel mark in its own handler.
A round end with no start seen (the plugin or core loaded mid-round, or a map change) is not sent.
Events between a round's end and the next start (a warden removed at round end, an LR's result,
post-round deaths) keep the ended round's id. Warden, lastrequest and specialdays are optional:
without one, its events are simply missing.

### TTT

From `@edgegamers/ttt-core`, `ttt-shop` and `ttt-special` (all optional). A player is
`{ steamId, name }`, with `steamId` the decimal SteamID64 (`""` for a bot). Roles are `innocent`,
`traitor`, `detective` (or `none`). In-round events also carry `atMs`, ms since round start.

| Type | When | `data` |
| --- | --- | --- |
| `ttt.round.start` | Core OnRoundStart (roles dealt, round live) | `number` (Core's round identity), `players: [{ steamId, name, role }]`, `special: [{ id, name }]` (special rounds that started with it) |
| `ttt.kill` | Core OnPlayerKilled | `victim`, `victimRole`, `killer` (null for suicide or world), `killerRole`, `weapon`, `headshot`, `correct` (right for the killer's role) |
| `ttt.body.found` | Core OnBodyFound | `finder`, `finderRole`, `owner`, `ownerRole` |
| `ttt.purchase` | Shop OnPurchase (charged and delivered) | `player`, `role`, `itemId`, `price` |
| `ttt.special` | Special OnSpecialRoundStarted after the round went live | `special: [{ id, name }]` |
| `ttt.round.end` | Core OnRoundEnd | `number`, `winner` (`none` for a draw or other non-role end), `reason`, `players: [{ steamId, name, role, alive, creditsEarned, playtimeSeconds }]`, `log` (Core's round log lines), `durationMs`, `liveMs` |

`creditsEarned` sums a player's credit gains in the round (Shop OnBalanceChanged), starting grant
included. `playtimeSeconds` runs from round start to round end, or to when the player left.

## Commands (server console)

| Command | What |
| --- | --- |
| `portal_status` | Sending state, events sent this session, last success, outbox counts, and the live channel's state |
| `portal_resume` | Clears a pause and puts held events back in the queue |

## Config

| Key | Default | What |
| --- | --- | --- |
| `portal_url` | `""` | Portal root, e.g. `https://cs.edgegamers.com` |
| `api_key` | `""` | The server's `egs_…` key |
| `batch_interval_ms` | `5000` | How often to drain the outbox (at least 1000) |
| `batch_size` | `200` | Events per batch, 1-500 |
| `max_outbox_events` | `200000` | Unsent events kept on disk; past this the oldest are dropped and logged. 0 = no limit |
| `http_timeout_ms` | `10000` | Per-request timeout |
| `live` | `true` | Hold the live WebSocket (skin changes from the website apply at once) |
| `live_url` | `""` | Live channel URL; empty = `portal_url` as `ws(s)://…/api/v1/live` |
| `debug` | `false` | Log every event queued and batch sent, and every live message |

## Files

| File | What |
| --- | --- |
| `src/plugin.ts` | Wiring: config, outbox open, sender timer, live channel, Jailbreak, TTT and WeaponPaints watches, game events, commands |
| `src/envelope.ts` | Event shape and the per-round builder (round id, seq, durations) — pure |
| `src/jb.ts` | Jailbreak collector: forwards and game events to portal events — pure |
| `src/ttt.ts` | TTT forward handlers: buffers pre-start roles, credits and specials — pure |
| `src/outbox.ts` | SQLite outbox and the in-memory write buffer |
| `src/sender.ts` | Batch sender: acks, holds, backoff, pause |
| `src/token.ts` | API key to JWT exchange |
| `src/live.ts` | Live WebSocket client: reconnect backoff, heartbeat watchdog, message routing — pure |
| `src/ulid.ts`, `src/http.ts`, `src/settings.ts` | Helpers |

The portal side of the contract is `docs/server-api.md` in `edgegamers/s2s-cs-web`.
