---
"@edgegamers/extracommands": patch
---

The movement hook behind `sm_speed` no longer looks up the player on every movement tick while nobody has a speed effect. On a live server that lookup was the largest single cost in the profile: about 0.12 ms per player per tick.
