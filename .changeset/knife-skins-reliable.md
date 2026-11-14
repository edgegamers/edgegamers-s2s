---
"@edgegamers/s2s-weaponpaints": patch
---

Knife skins apply reliably. A give is now painted inside the give itself (WeaponEquipPost), so a knife handed out from a timer (the Jailbreak spawn knife, a respawn, another plugin's loadout) no longer reaches the client stock. A knife the client saw before it was painted is swapped for a freshly painted one, and shortly after each spawn the held knife is checked and swapped the same way if it was never painted in time. Freshness is now counted in ticks instead of retries.
