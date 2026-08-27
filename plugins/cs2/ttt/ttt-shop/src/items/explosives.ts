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

export function registerC4Items(deps: StockItemFamilyDependencies): void {
  const { config } = deps;
  registerDeliveredItem(deps, {
    id: "c4", name: "C4", description: "A timed explosive with configurable fuse and blast power.",
    price: config.itemC4Price, enabled: config.itemC4Enabled,
    allowedRoles: config.itemC4AllowedRoles, allowedTeams: config.itemC4AllowedTeams,
    limit: configuredLimit(config.itemC4MaxPerRound),
  }, {
    itemId: "c4", effect: "c4",
    settings: {
      weapon: config.itemC4Weapon,
      fuseTime: config.itemC4FuseTime,
      power: config.itemC4Power,
      maxAtOnce: config.itemC4MaxAtOnce,
      friendlyFire: config.itemC4FriendlyFire,
    },
  });
}

export function registerClusterGrenadeItems(deps: StockItemFamilyDependencies): void {
  const { config } = deps;
  registerDeliveredItem(deps, {
    id: "clustergrenade", name: "Cluster Grenade", description: "Splits into several grenades on detonation.",
    price: config.itemClusterGrenadePrice, enabled: config.itemClusterGrenadeEnabled,
    allowedRoles: config.itemClusterGrenadeAllowedRoles, allowedTeams: config.itemClusterGrenadeAllowedTeams,
    limit: 1,
  }, {
    itemId: "clustergrenade", effect: "cluster_grenade",
    settings: {
      weapon: config.itemClusterGrenadeWeapon,
      count: config.itemClusterGrenadeCount,
      upForce: config.itemClusterGrenadeUpForce,
      throwForce: config.itemClusterGrenadeThrowForce,
    },
  });
}
