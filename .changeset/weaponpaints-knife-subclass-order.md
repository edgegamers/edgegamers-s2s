---
"@edgegamers/s2s-weaponpaints": patch
---

Knife finishes go on after the knife's model change, as upstream does. s2script queues ChangeSubclass on the engine's I/O queue instead of running it in the call, so the finish used to go on first and the model change landed on top of it: the right knife with the stock finish, hit or miss. The finish now waits for a signal input queued right behind the model change and goes on in the same tick. Also: a loadout that arrives after the player spawned (map change, slow portal) is applied right away, and debug logging says when a gate refuses a finish.
