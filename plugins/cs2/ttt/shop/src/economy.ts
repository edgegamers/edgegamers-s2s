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
import type { TttCoreApi } from "@edgegamers/ttt-core";
import type { TttShopApi } from "../api.d.ts";

export interface KarmaReader {
  karmaOf(slot: number): number;
}

export interface StartingCredits {
  innocent: number;
  traitor: number;
  detective: number;
}

export interface StartingCreditsReader {
  getInt(key: string): number;
}

export interface InstallEconomyOptions {
  core: TttCoreApi;
  shop: TttShopApi;
  karma?: KarmaReader | null;
  startingCredits?: () => StartingCredits;
}

const DEFAULT_STARTING_CREDITS: StartingCredits = {
  innocent: 60,
  traitor: 100,
  detective: 120,
};

export function createStartingCredits(reader: StartingCreditsReader): StartingCredits {
  return {
    innocent: reader.getInt("credits_start_innocent"),
    traitor: reader.getInt("credits_start_traitor"),
    detective: reader.getInt("credits_start_detective"),
  };
}

function creditsForKill(attackerRole: string, victimRole: string): number {
  switch (attackerRole) {
    case "ttt:traitor":
      if (victimRole === "ttt:traitor") return -5;
      if (victimRole === "ttt:detective") return 6;
      if (victimRole === "ttt:innocent") return 4;
      return 2;
    case "ttt:detective":
      if (victimRole === "ttt:detective") return -8;
      if (victimRole === "ttt:traitor") return 8;
      if (victimRole === "ttt:innocent") return -6;
      return 2;
    case "ttt:innocent":
      if (victimRole === "ttt:detective") return -6;
      if (victimRole === "ttt:traitor") return 8;
      if (victimRole === "ttt:innocent") return -4;
      return 2;
    default: return 2;
  }
}

export function scaleExplorationReward(base: number, karma: KarmaReader | null, slot = 0): number {
  if (karma === null) return base;
  return Math.trunc(base * Math.max(0, karma.karmaOf(slot)) / 100);
}

function startingCreditForRole(role: string, credits: StartingCredits): number {
  switch (role) {
    case "ttt:innocent": return credits.innocent;
    case "ttt:traitor": return credits.traitor;
    case "ttt:detective": return credits.detective;
    default: return 0;
  }
}

export function installEconomy(options: InstallEconomyOptions): void {
  const karma = options.karma ?? null;
  const startingCredits = options.startingCredits ?? (() => DEFAULT_STARTING_CREDITS);

  options.core.on("roleAssigned", (event) => {
    const credits = startingCreditForRole(event.role, startingCredits());
    if (credits === 0) return;
    options.shop.addBalance(event.slot, scaleExplorationReward(credits, karma, event.slot));
  });

  options.core.on("death", (event) => {
    if (options.core.gameState().state !== "in_progress") return;
    if (event.killer < 0 || event.killer === event.slot) return;

    const victimRole = options.core.roleOf(event.slot);
    let killerCredits = creditsForKill(options.core.roleOf(event.killer), victimRole);
    if (event.assister >= 0 && event.assister !== event.killer) {
      const assistCredits = Math.trunc(creditsForKill(options.core.roleOf(event.assister), victimRole) * 0.5);
      options.shop.addBalance(event.assister, assistCredits);
    } else {
      killerCredits = Math.trunc(killerCredits * 1.5);
    }
    options.shop.addBalance(event.killer, killerCredits);

    const victimBalance = options.shop.balanceOf(event.slot);
    if (victimBalance > 0) options.shop.addBalance(event.killer, Math.trunc(victimBalance / 2));
  });

  options.core.on("bodyIdentify", (event) => {
    if (event.canceled || event.identifier < 0) return;

    const victimBalance = options.shop.balanceOf(event.body.ownerSlot);
    options.shop.addBalance(event.identifier, Math.trunc(victimBalance / 4));

    const killer = event.body.killerSlot;
    if (killer < 0 || options.core.player(killer)?.connected !== true) return;

    const killerIsTraitor = options.core.teamOfRole(options.core.roleOf(killer)) === "traitor";
    const victimIsTraitor = options.core.teamOfRole(event.body.ownerRole) === "traitor";
    if (killerIsTraitor !== victimIsTraitor) {
      options.shop.addBalance(killer, Math.trunc(victimBalance / 4));
      return;
    }

    const killerBalance = options.shop.balanceOf(killer);
    options.shop.addBalance(killer, -(Math.trunc(killerBalance / 3) + Math.trunc(victimBalance / 2)));
  });

  options.core.on("gameState", (event) => {
    if (event.state === "finished") options.shop.resetRound();
  });
}
