---
"@edgegamers/s2s-weaponpaints": patch
---

Weapons, knives and gloves from a player's real inventory no longer keep that item's attributes under the chosen skin: both attribute lists are emptied before the skin goes on, as upstream WeaponPaints does. StatTrak turned off on the portal now stays off, the pattern seed is the saved one, and the real item's stickers no longer show. Sticker attributes now go on both lists. Fake item ids no longer start over on every map, so after a map change the client cannot show an earlier weapon's look (a knife with the right model but the stock finish).
