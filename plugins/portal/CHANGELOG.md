# @edgegamers/s2s-portal

## 0.3.0

### Minor Changes

- 78f0de2: Record a 3D replay of every Jailbreak and TTT round (every player, every tick, via s2script 0.39's OnPlayerRunCmdPost) with shots, bullet impacts, damage, deaths and crosshair share codes; gzip it off-thread in segments and upload it at round end to the portal's `PUT /api/v1/replays/{round}`, held on disk until it succeeds. New config `replays`, `replay_max_backlog`, `replay_crosshair`.

### Patch Changes

- 8c01ff7: Loading a PUG match no longer fails silently: the PUG plugin logs when it gets a match and any error while loading it, and the bridge awaits the call and logs a refusal or an error. The PUG plugin also keeps an empty server awake during a match (`keep_awake`, on by default; `sv_hibernate_when_empty 0`, set back afterwards), so the map change and warmup happen without anyone connected, and falls back to `Math.random` when Web Crypto is unusable.
- Updated dependencies [069067d]
- Updated dependencies [78f0de2]
  - @edgegamers/round-replay@0.2.0

## 0.2.1

### Patch Changes

- 798bf6c: Each PUG match gets its own server password (`set_password`, on by default). It is reported to the portal in `pug.match.state` so the match page can show the join command; the server's previous password comes back when the match is cleared. Players already on the server when a match arrives who are not in it are now kicked too (admins excepted), not only those who join later.

## 0.2.0

### Minor Changes

- 663371c: Hands this server's PUG match from the portal to `@edgegamers/s2s-pug` (on connect, on `pug.match.changed`, and `portal_pug_sync`), and sends its state, every round's score and the final result back as `pug.*` events right away.

## 0.1.0

### Minor Changes

- 1038ce6: Jailbreak round timelines for the CS portal. Core's `OnCellsOpened` now names the player who opened the cells (`player`, and `openCells` takes an optional `slot`, which the warden's `!open` passes), and `OnRoundEnd` says whether an admin ended the round (`adminEnded`). The portal bridge now sends the whole round: live, mode changes, cells, rebels, jihad C4s, warden terms, LR availability, LRs and last guard, special days, deaths (with whether the victim and killer were rebels at that moment), prisoner-on-guard damage, round log lines, and the roster at round start and end.
- 9798ed3: Hold a live WebSocket to the portal's gateway: a skin saved on the website reloads that player's WeaponPaints items within a second or two, and a policy change on the website makes weaponpaints-ds refetch it. Reconnects with capped backoff (2s doubling to 60s, with jitter); with the socket down nothing changes in game. New config `live` and `live_url`.
- d0c4b15: New restricted plugin that sends Jailbreak round start and end to the EdgeGamers CS portal through a local SQLite outbox, with token auth, batching, backoff and idempotent resends.
- c5734f5: TTT stats reach the CS portal. Core's `OnRoundEnd` now carries the round's action log (`log`, one line per entry as `!logs` shows it), and Shop publishes `OnBalanceChanged` for each committed credit change. The portal bridge sends TTT round start and end (roster, winner, credits earned, playtime, log), kills, bodies found, purchases and special rounds.
- b268e57: WeaponPaints can run without a database. New config `storage`: `database` (default, as before) or `plugin`, where the plugin asks for each player with a new `OnLoadRequested` forward, takes the answer through a new `supply(slot, userId, rows)` method, and sends every in-game change (and StatTrak counters) out as `OnStoreWrite`. The portal bridge is that provider: it loads players from the portal's `GET /api/v1/skins/{steamId}` and saves in-game changes to `POST /api/v1/skins/{steamId}` with the server's token, so EdgeGamers game servers no longer connect to the portal's Postgres.
