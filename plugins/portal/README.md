> Development in this monorepo: run `npm ci` and `npm run check` from the repository root. See [the contributor guide](../../CONTRIBUTING.md).

# Portal bridge

Sends game events from an EdgeGamers server to the CS portal (`edgegamers/s2s-cs-web`): Jailbreak
round start and end, and TTT rounds (roles, kills, bodies found, purchases, special rounds, credits
earned, playtime and the round log), which the portal turns into its TTT round pages.

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

## Events

Every event carries a ULID `id`, the `map` its round started on, a `round` id (a ULID made at round
start), `seq` (0, 1, … within the round), `ts` (wall clock ms) and `data`. Durations come from the
game's tick clock, not the wall clock.

| Type | When | `data` |
| --- | --- | --- |
| `jb.round.start` | `@edgegamers/jailbreak-core` OnRoundStart | `number` (round since map start), `players: { prisoner, guard }` (humans) |
| `jb.round.end` | OnRoundEnd | `number`, `winner` (`prisoner`, `guard`, `none`), `mode` (`normal`, `lastrequest`, `lastguard`, `specialday`), `players`, `durationMs` (start to end), `liveMs` (freeze time end to end, or null) |

A round end with no start seen (the plugin or core loaded mid-round, or a map change) is not sent.

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
| `portal_status` | Sending state, events sent this session, last success, and outbox counts |
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
| `debug` | `false` | Log every event queued and batch sent |

## Files

| File | What |
| --- | --- |
| `src/plugin.ts` | Wiring: config, outbox open, sender timer, Jailbreak and TTT watches, commands |
| `src/envelope.ts` | Event shape and the per-round builder (round id, seq, durations) — pure |
| `src/jb.ts` | Jailbreak forward handlers — pure |
| `src/ttt.ts` | TTT forward handlers: buffers pre-start roles, credits and specials — pure |
| `src/outbox.ts` | SQLite outbox and the in-memory write buffer |
| `src/sender.ts` | Batch sender: acks, holds, backoff, pause |
| `src/token.ts` | API key to JWT exchange |
| `src/ulid.ts`, `src/http.ts`, `src/settings.ts` | Helpers |

The portal side of the contract is `docs/server-api.md` in `edgegamers/s2s-cs-web`.
