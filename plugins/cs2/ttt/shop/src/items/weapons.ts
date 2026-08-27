/*!
MIT License

Copyright (c) 2026 EdgeGamers, LLC

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

import { configuredLimit, registerDeliveredItem, type StockItemFamilyDependencies } from "./shared.ts";

export function registerUniversalWeaponItems(deps: StockItemFamilyDependencies): void {
  const { config } = deps;
  registerDeliveredItem(deps, {
    id: "healthshot", name: "Healthshot", description: "Heals the buyer when used.",
    price: config.itemHealthshotPrice, enabled: config.itemHealthshotEnabled,
    allowedRoles: config.itemHealthshotAllowedRoles, allowedTeams: config.itemHealthshotAllowedTeams,
    limit: configuredLimit(config.itemHealthshotMaxPurchases),
  }, { itemId: "healthshot", effect: "weapon", settings: { weapon: config.itemHealthshotWeapon } });
  registerDeliveredItem(deps, {
    id: "m4a1", name: "M4A1", description: "Grants an M4A1 rifle and configured companion weapons.",
    price: config.itemM4a1Price, enabled: config.itemM4a1Enabled,
    allowedRoles: config.itemM4a1AllowedRoles, allowedTeams: config.itemM4a1AllowedTeams,
  }, {
    itemId: "m4a1", effect: "weapon_bundle",
    settings: { clearSlots: config.itemM4a1ClearSlots, weapons: config.itemM4a1Weapons },
  });
  registerDeliveredItem(deps, {
    id: "taser", name: "Taser", description: "Tasing a player reveals their role to the buyer.",
    price: config.itemTaserPrice, enabled: config.itemTaserEnabled,
    allowedRoles: config.itemTaserAllowedRoles, allowedTeams: config.itemTaserAllowedTeams,
  }, { itemId: "taser", effect: "taser", settings: { weapon: config.itemTaserWeapon } });
}

export function registerDetectiveWeaponItems(deps: StockItemFamilyDependencies): void {
  const { config } = deps;
  registerDeliveredItem(deps, {
    id: "deagle", name: "One-Shot Revolver",
    description: "Kills an enemy in one hit and can punish friendly fire.",
    price: config.itemOneDeaglePrice, enabled: config.itemOneDeagleEnabled,
    allowedRoles: config.itemOneDeagleAllowedRoles, allowedTeams: config.itemOneDeagleAllowedTeams,
    limit: 1,
  }, {
    itemId: "deagle", effect: "one_shot_revolver",
    settings: {
      weapon: config.itemOneDeagleWeapon,
      friendlyFire: config.itemOneDeagleFriendlyFire,
      killShooterOnFriendlyFire: config.itemOneDeagleKillShooterOnFriendlyFire,
    },
  });
}

export function registerTraitorWeaponItems(deps: StockItemFamilyDependencies): void {
  const { config } = deps;
  registerDeliveredItem(deps, {
    id: "onehitknife", name: "One-Hit Knife", description: "Makes the next knife attack instantly lethal.",
    price: config.itemOneHitKnifePrice, enabled: config.itemOneHitKnifeEnabled,
    allowedRoles: config.itemOneHitKnifeAllowedRoles, allowedTeams: config.itemOneHitKnifeAllowedTeams,
    limit: 1,
  }, {
    itemId: "onehitknife", effect: "one_hit_knife",
    settings: { friendlyFire: config.itemOneHitKnifeFriendlyFire },
  });
  registerDeliveredItem(deps, {
    id: "silentawp", name: "Silent AWP", description: "Grants an AWP whose configured shots are silent.",
    price: config.itemSilentAwpPrice, enabled: config.itemSilentAwpEnabled,
    allowedRoles: config.itemSilentAwpAllowedRoles, allowedTeams: config.itemSilentAwpAllowedTeams,
    limit: 1,
  }, {
    itemId: "silentawp", effect: "silent_awp",
    settings: {
      weapon: config.itemSilentAwpWeapon,
      index: config.itemSilentAwpIndex,
      currentAmmo: config.itemSilentAwpCurrentAmmo,
      reserveAmmo: config.itemSilentAwpReserveAmmo,
    },
  });
}
