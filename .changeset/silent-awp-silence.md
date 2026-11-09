---
"@edgegamers/ttt-items": patch
---

Fix the Silent AWP being audible to other players: the fire-bullets hook read `weapon_id` (an entity handle in CS2) instead of `item_def_index`, so the shot was never suppressed. The shooter is now resolved from the message's pawn handle, so crouched or moving shots are also silenced. This also restores pistol silencing for the Suppressed round and Poison Shots.
