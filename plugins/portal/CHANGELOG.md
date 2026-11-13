# @edgegamers/s2s-portal

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
