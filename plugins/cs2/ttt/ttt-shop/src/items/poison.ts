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

import { registerDeliveredItem, type StockItemFamilyDependencies } from "./shared.ts";

export function registerPoisonItems(deps: StockItemFamilyDependencies): void {
  const { config } = deps;
  registerDeliveredItem(deps, {
    id: "poisonsmoke", name: "Poison Smoke", description: "Damages non-Traitors inside its smoke cloud.",
    price: config.itemPoisonSmokePrice, enabled: config.itemPoisonSmokeEnabled,
    allowedRoles: config.itemPoisonSmokeAllowedRoles, allowedTeams: config.itemPoisonSmokeAllowedTeams,
    limit: 1,
  }, {
    itemId: "poisonsmoke", effect: "poison_smoke",
    settings: {
      weapon: config.itemPoisonSmokeWeapon,
      radius: config.itemPoisonSmokeRadius,
      tickInterval: config.itemPoisonSmokeTickInterval,
      damagePerTick: config.itemPoisonSmokeDamagePerTick,
      totalDamage: config.itemPoisonSmokeTotalDamage,
      sound: config.itemPoisonSmokeSound,
    },
  });
  registerDeliveredItem(deps, {
    id: "poisonshots", name: "Poison Shots", description: "Coats the configured number of pistol shots with poison.",
    price: config.itemPoisonShotsPrice, enabled: config.itemPoisonShotsEnabled,
    allowedRoles: config.itemPoisonShotsAllowedRoles, allowedTeams: config.itemPoisonShotsAllowedTeams,
    limit: 1,
  }, { itemId: "poisonshots", effect: "poison_shots", settings: { total: config.itemPoisonShotsTotal } });
}
