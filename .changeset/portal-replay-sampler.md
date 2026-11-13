---
"@edgegamers/s2s-portal": minor
---

Record a 3D replay of every Jailbreak and TTT round (every player, every tick, via s2script 0.39's OnPlayerRunCmdPost) with shots, bullet impacts, damage, deaths and crosshair share codes; gzip it off-thread in segments and upload it at round end to the portal's `PUT /api/v1/replays/{round}`, held on disk until it succeeds. New config `replays`, `replay_max_backlog`, `replay_crosshair`.
