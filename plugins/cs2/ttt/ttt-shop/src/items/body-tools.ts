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

export function registerDetectiveBodyTools(deps: StockItemFamilyDependencies): void {
  const { config } = deps;
  registerDeliveredItem(deps, {
    id: "stickers", name: "Stickers", description: "Tased players have their role revealed to everyone.",
    price: config.itemStickersPrice, enabled: config.itemStickersEnabled,
    allowedRoles: config.itemStickersAllowedRoles, allowedTeams: config.itemStickersAllowedTeams,
    limit: 1,
  }, { itemId: "stickers", effect: "stickers", settings: {} });
  registerDeliveredItem(deps, {
    id: "dna", name: "DNA Scanner", description: "Scans bodies for a trace leading to their killer.",
    price: config.itemDnaPrice, enabled: config.itemDnaEnabled,
    allowedRoles: config.itemDnaAllowedRoles, allowedTeams: config.itemDnaAllowedTeams,
    limit: 1,
  }, {
    itemId: "dna", effect: "dna_scanner",
    settings: { decayTime: config.itemDnaDecayTime, maxSamples: config.itemDnaMaxSamples },
  });
}

export function registerTraitorBodyTools(deps: StockItemFamilyDependencies): void {
  const { config } = deps;
  registerDeliveredItem(deps, {
    id: "gloves", name: "Gloves", description: "Prevents DNA evidence and permits moving unidentified bodies.",
    price: config.itemGlovesPrice, enabled: config.itemGlovesEnabled,
    allowedRoles: config.itemGlovesAllowedRoles, allowedTeams: config.itemGlovesAllowedTeams,
    limit: 1,
  }, { itemId: "gloves", effect: "gloves", settings: { maxUses: config.itemGlovesMaxUses } });
  registerDeliveredItem(deps, {
    id: "camo", name: "Camouflage", description: "Makes the buyer harder to see.",
    price: config.itemCamoPrice, enabled: config.itemCamoEnabled,
    allowedRoles: config.itemCamoAllowedRoles, allowedTeams: config.itemCamoAllowedTeams,
    limit: 1,
  }, { itemId: "camo", effect: "camouflage", settings: { visibility: config.itemCamoVisibility } });
  registerDeliveredItem(deps, {
    id: "bodypaint", name: "Body Paint", description: "Makes painted bodies appear identified.",
    price: config.itemBodyPaintPrice, enabled: config.itemBodyPaintEnabled,
    allowedRoles: config.itemBodyPaintAllowedRoles, allowedTeams: config.itemBodyPaintAllowedTeams,
    limit: 1,
  }, {
    itemId: "bodypaint", effect: "body_paint",
    settings: { maxUses: config.itemBodyPaintMaxUses, color: config.itemBodyPaintColor },
  });
}
