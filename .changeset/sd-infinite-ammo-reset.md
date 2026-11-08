---
"@edgegamers/jailbreak-specialdays": patch
---

Grenades no longer stay infinite after No Scope or Rocket Jump. Both days turn on `sv_infinite_ammo` and used to put back whatever value they read before the day. That read can't be trusted (the console showed -229000626 on a live server), and a failed restore was silent. Any nonzero value keeps grenades from being used up while guns look normal, and it carried over to later rounds and maps. `sv_infinite_ammo` now always goes back to 0 when a day ends, every round start outside a special day sets it back to 0 if it isn't already, and failed restores are logged.
