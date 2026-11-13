---
"@edgegamers/s2s-weaponpaints": minor
"@edgegamers/s2s-weaponpaints-ds": minor
---

Stickers can be gated by tier: WeaponPaints asks `OnApplyRequested` with kind `sticker` for each saved sticker, and weaponpaints-ds gates them (Gold by default). Update weaponpaints-ds before the portal serves a policy with a `sticker` rule: older versions reject the unknown kind and keep their last policy.
