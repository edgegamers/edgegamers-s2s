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

function settings(deps: StockItemFamilyDependencies, mode: "bodies" | "players") {
  return {
    mode,
    maxRange: deps.config.itemCompassMaxRange,
    fov: deps.config.itemCompassFov,
    length: deps.config.itemCompassLength,
  };
}

export function registerBodyCompassItems(deps: StockItemFamilyDependencies): void {
  const { config } = deps;
  registerDeliveredItem(deps, {
    id: "compass_body", name: "Body Compass", description: "Shows the direction of nearby bodies.",
    price: config.itemCompassPrice, enabled: config.itemCompassBodyEnabled,
    allowedRoles: config.itemCompassBodyAllowedRoles, allowedTeams: config.itemCompassBodyAllowedTeams,
    limit: 1,
  }, { itemId: "compass_body", effect: "compass", settings: settings(deps, "bodies") });
}

export function registerPlayerCompassItems(deps: StockItemFamilyDependencies): void {
  const { config } = deps;
  registerDeliveredItem(deps, {
    id: "compass_player", name: "Player Compass", description: "Shows the direction of nearby players.",
    price: config.itemCompassPrice, enabled: config.itemCompassPlayerEnabled,
    allowedRoles: config.itemCompassPlayerAllowedRoles, allowedTeams: config.itemCompassPlayerAllowedTeams,
    limit: 1,
  }, { itemId: "compass_player", effect: "compass", settings: settings(deps, "players") });
}
