---
"@edgegamers/s2s-weaponpaints-ds": minor
---

Knife finishes get their own tier: a new `knife_finish` rule kind (optional `defindex` = knife, `paint` = finish) covers finishes on knives apart from the `knife` rule, which now only covers carrying the knife model in its default finish. A finish still needs the knife model's tier as well. Without a `knife_finish` rule nothing changes. Update weaponpaints-ds before the portal serves a policy with a `knife_finish` rule: older versions reject the unknown kind and keep their last policy.
