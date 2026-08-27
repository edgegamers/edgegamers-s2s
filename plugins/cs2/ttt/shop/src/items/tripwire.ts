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

export function registerTripwireItems(deps: StockItemFamilyDependencies): void {
  const { config } = deps;
  registerDeliveredItem(deps, {
    id: "tripwire", name: "Tripwire", description: "Activates when a player crosses its beam.",
    price: config.itemTripwirePrice, enabled: config.itemTripwireEnabled,
    allowedRoles: config.itemTripwireAllowedRoles, allowedTeams: config.itemTripwireAllowedTeams,
  }, {
    itemId: "tripwire", effect: "tripwire",
    settings: {
      explosionPower: config.itemTripwireExplosionPower,
      falloffDelay: config.itemTripwireFalloffDelay,
      friendlyFireMultiplier: config.itemTripwireFriendlyFireMultiplier,
      friendlyFireTriggers: config.itemTripwireFriendlyFireTriggers,
      friendlyFireKarmaPenaltyTime: config.itemTripwireFriendlyFireKarmaPenaltyTime,
      maxDistanceSquared: config.itemTripwireMaxDistanceSquared,
      maxSpan: config.itemTripwireMaxSpan,
      glow: config.itemTripwireGlow,
      initiationTime: config.itemTripwireInitiationTime,
      sizeSquared: config.itemTripwireSizeSquared,
      thickness: config.itemTripwireThickness,
      defuseTime: config.itemTripwireDefuseTime,
      defuseRate: config.itemTripwireDefuseRate,
      defuseReward: config.itemTripwireDefuseReward,
      colorR: config.itemTripwireColorR,
      colorG: config.itemTripwireColorG,
      colorB: config.itemTripwireColorB,
      colorA: config.itemTripwireColorA,
    },
  });
}
