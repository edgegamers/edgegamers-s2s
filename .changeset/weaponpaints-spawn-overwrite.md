---
"@edgegamers/s2s-weaponpaints": patch
---

Skins survive the round-start spawn. A spawn's own loadout code can write the player's real item back over a weapon after it was painted in the equip, so a weapon painted there is painted again at the end of the tick if its item id was replaced. Shortly after each spawn, guns whose skin was written over are given again (the path a reload takes), and a knife whose skin was lost is replaced.
