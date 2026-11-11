# @edgegamers/s2s-weaponpaints-ds

## 0.1.0

### Minor Changes

- 9798ed3: Publish an `@edgegamers/s2s-weaponpaints-ds` contract with `reloadPolicy()`, which fetches the policy from `policy_url` now (skipping HTTP caches) and re-applies items if it changed.
- 8997a85: New restricted plugin that gates WeaponPaints items by MAUL Dedicated Supporter tier. The policy comes from the CS portal (`policy_url`, fetched at every map start) or from a local file, which also keeps the last good copy; a malformed or unreachable policy never replaces a working one.
