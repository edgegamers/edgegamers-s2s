---
"@edgegamers/s2s-weaponpaints": patch
---

Weapons are painted in the same frame they are given, before the client sees them, instead of a frame later. A frame later the client had already built the weapon's look, so `!wp` changed the name tag but kept the old finish, and knives could still come out wrong. Also stops the "Couldn't resolve offset" console warning when gloves are applied.
