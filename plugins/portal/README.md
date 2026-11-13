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

## 3D round replays

With `replays` on (the default), every Jailbreak and TTT round is recorded for the portal's 3D
replay viewer: every player, **every tick**, in the `@edgegamers/round-replay` format
(`packages/round-replay`, ADR 0008), tied to the same round id as the round's events.

- **Per tick** (s2script 0.39): `onGameFrame` "pre" opens the tick; `OnPlayerRunCmdPost` reads the
  pawn after each command ran (`readKinematics`: origin, eye angles, velocity, flags, duck amount,
  held buttons); `onGameFrame` "post" marks players who ran no command (lost packets) as holds.
- **Weapon in hand** from `item_equip`, `item_remove` and `weapon_fire`, re-read from the pawn
  every 64 ticks. **Alive / team** from `player_spawn`, `player_death`, `player_team`, also re-read
  every 64 ticks.
- **Events**: `weapon_fire`, `bullet_impact`, `player_hurt`, `player_death`.
- **Crosshair**: s2script has no `m_szCrosshairCodes`, so the plugin asks each client for its
  crosshair cvars once per connect (`queryConVar`) and encodes the CS2 share code itself
  (`src/crosshair.ts`). A client that does not answer gets no crosshair (`replay_crosshair` off
  skips the queries).
- **Spool**: one s2script async payload is capped at 8 MiB uncompressed, so finished chunks are
  gzipped off-thread in ~1 MiB segments while the round runs, under the plugin's
  `files/replays/<round id>/` (`000.gz` header, `001.gz`... chunks, `meta.json` last). Rounds wait
  there until the portal has them, across restarts.
- **Upload**: after the round, oldest first, one at a time, to `PUT /api/v1/replays/{round}`.
  s2script's `fetch` only sends string bodies, so the file goes as base64
  (`Content-Type: application/vnd.egrr+base64`): the segments' gzip members concatenated, which the
  portal gunzips as one file. The base64 is built a 32 KiB slice per frame.

| Portal answer | What the plugin does |
| --- | --- |
| 200, 201 | Deletes the round from the spool |
| 401 | Mints a new token once and resends; a refused key pauses uploads |
| 400 `invalid_replay`, 403, 409 `round_conflict`, 413 | Holds the round on disk (`held.txt`), not resent until `portal_resume` |
| 429, 5xx, network error | Backs off (Retry-After, else 2s doubling to 5 min) |

A round over ~6 MiB gzip cannot go in one s2script request and is held (a 20-minute, 40-player
round is about 3 MB). `portal_status` shows the recorder's cost per tick and the upload queue.

**Cost** (`test/replay.test.ts`, Node 24): 40 players, one command each per tick, 64 tick: about
12-19 µs per tick in the recorder on average. Every 256 ticks (4 s) the recorder varint-encodes
the finished chunk, about 0.75 ms in that one tick, and each ~1 MiB segment hand-off adds about as
much again (one copy). A 3-minute round is ~6.8 MB raw, ~0.45 MB gzip on synthetic movement.
Host reads (`Pawn.forSlot` + `readKinematics` per command) are on top and only measurable on a
server.

## Live channel

Besides the outbox, the plugin holds one WebSocket to the portal's gateway
(`wss://<portal>/api/v1/live`, authenticated with the same token) for messages that are useless when
late. Contract: `docs/live.md` in `edgegamers/s2s-cs-web`.

| Message | What the plugin does |
| --- | --- |
| `skins.refresh` (a player saved skins on the website) | If that player is on this server, `@edgegamers/s2s-weaponpaints` `reload(slot)`: reads their rows again and applies them, as `!wp` does |
| `skins.policy.changed` (an admin changed the tier policy) | `@edgegamers/s2s-weaponpaints-ds` `reloadPolicy()`: fetches the policy now instead of at map start |
| `pug.match.changed` (this server's PUG is ready to play, or was cancelled) | Reads `GET /api/v1/pug/match` and hands it to `@edgegamers/s2s-pug` (see PUGs below) |

These plugins are optional dependencies; without them the messages are ignored.

## PUGs

With `@edgegamers/s2s-pug` loaded, the portal's PUG matches are played here (s2s-cs-web
`docs/pug.md`). The plugin reads this server's match from `GET /api/v1/pug/match` when the PUG
plugin loads, on every live-channel connect and on `pug.match.changed`, retrying failed reads
(5s doubling to 2 minutes). A match is passed to the PUG plugin's `load`; no match while one is
being played means it was cancelled on the portal, and the PUG plugin's `clear` stops it.

The PUG plugin's forwards go back as mode `pug` events, `round` = the match id:
`pug.match.state` (warmup, knife, live, and the match's server password), `pug.round.end` (score per portal team and player
stats) and `pug.match.end`. They are sent at once rather than on the next batch tick, so the
match page's score is near-live. The server must be allowed the PUG mode in the portal.

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
| `portal_status` | Sending state, events sent this session, last success, outbox counts, the live channel's state, and replays (recording, µs/tick, upload queue) |
| `portal_resume` | Clears a pause and puts held events and held replays back in the queue |
| `portal_pug_sync` | Reads this server's PUG match from the portal now |

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
| `replays` | `true` | Record and upload a 3D replay of every Jailbreak / TTT round |
| `replay_max_backlog` | `500` | Finished rounds kept on disk waiting for upload; past this the oldest are dropped and logged. 0 = no limit |
| `replay_crosshair` | `true` | Ask clients for their crosshair cvars once per connect |
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
| `src/replay.ts` | Round replay recorder: per-tick samples, holds, events, segmented spool — pure |
| `src/replay-upload.ts` | Replay spool uploader: base64 a slice per frame, holds, backoff |
| `src/crosshair.ts` | Crosshair cvars to a CS2 share code (port of csgo-sharecode, MIT) |
| `src/weapons.ts` | Item definition index to weapon class |
| `src/live.ts` | Live WebSocket client: reconnect backoff, heartbeat watchdog, message routing — pure |
| `src/ulid.ts`, `src/http.ts`, `src/settings.ts` | Helpers |

The portal side of the contract is `docs/server-api.md` in `edgegamers/s2s-cs-web`.
