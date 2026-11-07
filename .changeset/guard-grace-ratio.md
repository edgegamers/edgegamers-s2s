---
"@edgegamers/jailbreak-guards": patch
---

Apply guard restrictions to client jointeam commands as well as native team requests, keeping blocked prisoners alive during grace time. Count players with pending SteamIDs in the ratio and remove excess human guards at round end, moving unverified guards first and re-queueing verified guards by priority.
