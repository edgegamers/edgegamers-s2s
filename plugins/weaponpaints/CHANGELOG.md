# @edgegamers/s2s-weaponpaints

## 0.3.1

### Patch Changes

- 34ce4a9: Weapons, and a knife's model, are set in the same frame they are given, before the client sees them, instead of a frame later. A frame later the client had already built the weapon's look, so `!wp` changed the name tag but kept the old finish, and knives could still come out wrong. Also stops the "Couldn't resolve offset" console warning when gloves are applied. Glove paints work again: the glove attribute call passed its list as a raw pointer, which the engine-call bridge refuses ("unsupported native/projection pair"). New `debug` config logs each knife apply step. Knives are changed in place again instead of re-given, because the engine refuses to give a knife subclass by name, which left players with their own inventory knife.

## 0.3.0

### Minor Changes

- 8997a85: Publish an `@edgegamers/s2s-weaponpaints` contract with `OnSelectionRequested` and `OnApplyRequested` veto hooks and a `refresh(slot)` method. A vetoed selection is not saved; a vetoed apply shows the default item and keeps the saved row. Without a listener nothing changes.
- b268e57: WeaponPaints can run without a database. New config `storage`: `database` (default, as before) or `plugin`, where the plugin asks for each player with a new `OnLoadRequested` forward, takes the answer through a new `supply(slot, userId, rows)` method, and sends every in-game change (and StatTrak counters) out as `OnStoreWrite`. The portal bridge is that provider: it loads players from the portal's `GET /api/v1/skins/{steamId}` and saves in-game changes to `POST /api/v1/skins/{steamId}` with the server's token, so EdgeGamers game servers no longer connect to the portal's Postgres.
- 9798ed3: Add `reload(slot)` to the `@edgegamers/s2s-weaponpaints` contract: read the player's selections from the database again and apply them, as `!wp` does, for changes saved outside the game.

### Patch Changes

- 286fe11: Knives now always show the chosen model. A stock knife is swapped for a newly given knife of the chosen class instead of being changed in place, which left the knife invisible or drawn backwards once the player already held it. `!st` is no longer a default StatTrak alias, so it no longer clashes with the JailBreak warden's `!st`.

## 0.2.0

### Minor Changes

- faf25bf: Add WeaponPaints, an s2script port of Nereziel/cs2-WeaponPaints 3.3a. Players pick weapon skins, knives, gloves, agents, music kits and pins from in-game menus or the WeaponPaints website; selections load from and save to the same `wp_player_*` tables, so an existing WeaponPaints database carries over. StatTrak counters, name tags, stickers and keychains from the database are applied too.
