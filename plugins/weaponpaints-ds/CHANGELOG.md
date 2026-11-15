# @edgegamers/s2s-weaponpaints-ds

## 0.4.0

### Minor Changes

- bfd6c7e: Knife finishes get their own tier: a new `knife_finish` rule kind (optional `defindex` = knife, `paint` = finish) covers finishes on knives apart from the `knife` rule, which now only covers carrying the knife model in its default finish. A finish still needs the knife model's tier as well. Without a `knife_finish` rule nothing changes. Update weaponpaints-ds before the portal serves a policy with a `knife_finish` rule: older versions reject the unknown kind and keep their last policy.

## 0.3.1

## 0.3.0

### Minor Changes

- f3bc8ab: Gate weapon charms by tier: WeaponPaints asks `OnApplyRequested` with kind `keychain` before putting a saved charm on a gun, and weaponpaints-ds adds a `keychain` rule (Gold by default).

## 0.2.0

### Minor Changes

- 0e7f9a3: Stickers can be gated by tier: WeaponPaints asks `OnApplyRequested` with kind `sticker` for each saved sticker, and weaponpaints-ds gates them (Gold by default). Update weaponpaints-ds before the portal serves a policy with a `sticker` rule: older versions reject the unknown kind and keep their last policy.

## 0.1.2

### Patch Changes

- Localize item tier refusals and displayed supporter tier names with owner.feature.function keys and the shared chat colors and arrow prefix. Keep policy tier names and server console formatting unchanged.

## 0.1.1

### Patch Changes

- 2bfe6a7: A knife's finish or StatTrak now needs the knife's tier as well as the weapon-skin tier, so a player can no longer save a finish for a knife they cannot equip. Matches the CS portal.

## 0.1.0

### Minor Changes

- 9798ed3: Publish an `@edgegamers/s2s-weaponpaints-ds` contract with `reloadPolicy()`, which fetches the policy from `policy_url` now (skipping HTTP caches) and re-applies items if it changed.
- 8997a85: New restricted plugin that gates WeaponPaints items by MAUL Dedicated Supporter tier. The policy comes from the CS portal (`policy_url`, fetched at every map start) or from a local file, which also keeps the last good copy; a malformed or unreachable policy never replaces a working one.
