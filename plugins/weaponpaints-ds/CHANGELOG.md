# @edgegamers/s2s-weaponpaints-ds

## 0.1.1

### Patch Changes

- 2bfe6a7: A knife's finish or StatTrak now needs the knife's tier as well as the weapon-skin tier, so a player can no longer save a finish for a knife they cannot equip. Matches the CS portal.

## 0.1.0

### Minor Changes

- 9798ed3: Publish an `@edgegamers/s2s-weaponpaints-ds` contract with `reloadPolicy()`, which fetches the policy from `policy_url` now (skipping HTTP caches) and re-applies items if it changed.
- 8997a85: New restricted plugin that gates WeaponPaints items by MAUL Dedicated Supporter tier. The policy comes from the CS portal (`policy_url`, fetched at every map start) or from a local file, which also keeps the last good copy; a malformed or unreachable policy never replaces a working one.
