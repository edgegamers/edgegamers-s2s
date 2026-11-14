# @edgegamers/s2s-weaponpaints

## 0.6.0

### Minor Changes

- f3bc8ab: Gate weapon charms by tier: WeaponPaints asks `OnApplyRequested` with kind `keychain` before putting a saved charm on a gun, and weaponpaints-ds adds a `keychain` rule (Gold by default).

## 0.5.1

### Patch Changes

- 6084fdb: Weapons, knives and gloves from a player's real inventory no longer keep that item's attributes under the chosen skin: both attribute lists are emptied before the skin goes on, as upstream WeaponPaints does. StatTrak turned off on the portal now stays off, the pattern seed is the saved one, and the real item's stickers no longer show. Sticker attributes now go on both lists. Fake item ids no longer start over on every map, so after a map change the client cannot show an earlier weapon's look (a knife with the right model but the stock finish).

## 0.5.0

### Minor Changes

- 0e7f9a3: Stickers can be gated by tier: WeaponPaints asks `OnApplyRequested` with kind `sticker` for each saved sticker, and weaponpaints-ds gates them (Gold by default). Update weaponpaints-ds before the portal serves a policy with a `sticker` rule: older versions reject the unknown kind and keep their last policy.

### Patch Changes

- 2167238: Knife skins apply reliably. A give is now painted inside the give itself (WeaponEquipPost), so a knife handed out from a timer (the Jailbreak spawn knife, a respawn, another plugin's loadout) no longer reaches the client stock. A knife the client saw before it was painted is swapped for a freshly painted one, and shortly after each spawn the held knife is checked and swapped the same way if it was never painted in time. Freshness is now counted in ticks instead of retries.

## 0.4.0

### Minor Changes

- 0ae6976: Rename translation keys to owner.feature.function and apply the shared semantic chat colors. Migrate operator phrase overrides to the new keys, including Hide's Russian locale. Preserve per-recipient translations, literal custom prefixes, staff-chat audiences and plain console/menu output.

### Patch Changes

- 0ae6976: Use arrow separators for existing system chat prefixes while preserving console output, translated labels, configured prefixes and literal message text.
- 0ae6976: Move remaining standalone plugin chat wrappers, default formats and command replies into editable translation phrases. Resolve broadcasts per recipient while preserving authored chat, map text, colors and routing.

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
