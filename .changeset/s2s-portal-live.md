---
"@edgegamers/s2s-portal": minor
---

Hold a live WebSocket to the portal's gateway: a skin saved on the website reloads that player's WeaponPaints items within a second or two, and a policy change on the website makes weaponpaints-ds refetch it. Reconnects with capped backoff (2s doubling to 60s, with jitter); with the socket down nothing changes in game. New config `live` and `live_url`.
