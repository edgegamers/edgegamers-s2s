---
"@edgegamers/s2s-weaponpaints": patch
---

Weapons, and a knife's model, are set in the same frame they are given, before the client sees them, instead of a frame later. A frame later the client had already built the weapon's look, so `!wp` changed the name tag but kept the old finish, and knives could still come out wrong. Also stops the "Couldn't resolve offset" console warning when gloves are applied. Glove paints work again: the glove attribute call passed its list as a raw pointer, which the engine-call bridge refuses ("unsupported native/projection pair"). New `debug` config logs each knife apply step. Knives are changed in place again instead of re-given, because the engine refuses to give a knife subclass by name, which left players with their own inventory knife.
