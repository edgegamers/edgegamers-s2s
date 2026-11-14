---
"@edgegamers/s2s-weaponpaints": patch
---

Legacy-model finishes (AWP | Dragon Lore, AK-47 | Case Hardened) no longer render grey: the instant body group call is dropped, and the gun is instead hidden from clients until the queued body group change has landed, so clients draw it fresh on the right mesh.
