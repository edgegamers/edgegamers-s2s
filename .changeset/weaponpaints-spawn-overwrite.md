---
"@edgegamers/s2s-weaponpaints": patch
---

Skins survive the round-start spawn. A knife whose model change lands a tick after its give (the spawn gives after the tick's I/O has run, so the client already drew the stock knife) is swapped from a timer, the way a reload gives knives. A spawn's own loadout code can write the player's real item back over a weapon after it was painted in the equip, so a weapon painted there is painted again at the end of the tick if its item id was replaced. Shortly after each spawn, guns whose skin was written over are given again (the path a reload takes), and a knife whose skin was lost is replaced.
