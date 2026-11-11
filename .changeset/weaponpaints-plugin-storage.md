---
"@edgegamers/s2s-weaponpaints": minor
"@edgegamers/s2s-portal": minor
---

WeaponPaints can run without a database. New config `storage`: `database` (default, as before) or `plugin`, where the plugin asks for each player with a new `OnLoadRequested` forward, takes the answer through a new `supply(slot, userId, rows)` method, and sends every in-game change (and StatTrak counters) out as `OnStoreWrite`. The portal bridge is that provider: it loads players from the portal's `GET /api/v1/skins/{steamId}` and saves in-game changes to `POST /api/v1/skins/{steamId}` with the server's token, so EdgeGamers game servers no longer connect to the portal's Postgres.
