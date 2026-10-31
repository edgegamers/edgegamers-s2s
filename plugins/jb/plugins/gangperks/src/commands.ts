/**
 * The perk commands (`!wardenicon`, `!sticon`, `!paint`, `!lrcolor`, `!sdcolor`, `!bombicon`) —
 * one generic flow for all six (C# `AbstractEnumCommand`, `SDColorCommand`, `BombIconCommand`):
 *
 * - no argument → open the perk menu;
 * - a locked option → buy it for the gang (PURCHASE_PERKS, charged from the gang bank first, then
 *   the wallet) and announce it in gang chat; gang-wide perks also equip it;
 * - an unlocked option → equip it (per-player perks: for you; gang-wide perks: for the gang, needs
 *   MANAGE_PERKS, announced in gang chat).
 */
import { Chat, Clients } from "@s2script/sdk";
import { Player } from "@s2script/cs2";
import type { EnumPerkDef, PerkOption } from "./perks.ts";
import { ALL_PERKS } from "./perks.ts";
import {
  decide,
  encodeGangData,
  findOption,
  minRankName,
  parseEquipped,
  parseGangData,
  parseMask,
  Perm,
  unlock,
  unlockedMask,
} from "./enum-perk.ts";
import { msgFor, labelFor } from "./messages.ts";
import { openPerkMenu } from "./menus.ts";
import type { GangsApi } from "./state.ts";
import { readyGangs, steamOfSlot } from "./state.ts";

/** A perk's current state for one gang/player. */
export interface PerkView {
  /** Raw stored unlocked mask (what we write back). */
  stored: number;
  /** Unlocked mask including free options. */
  unlocked: number;
  /** Equipped bit (player stat for per-player perks, gang data for gang-wide ones); 0 = none. */
  equipped: number;
}

export function readPerk(gangs: GangsApi, def: EnumPerkDef, gangId: number, steamId: string): PerkView {
  const raw = gangs.getGangStat(gangId, def.statId);
  if (def.equip === "gang") {
    const data = parseGangData(def, raw);
    const stored = data?.Unlocked ?? 0;
    return { stored, unlocked: unlockedMask(def, stored), equipped: data?.Equipped ?? 0 };
  }
  const stored = parseMask(def, raw);
  const eq = parseEquipped(def, gangs.getPlayerStat(steamId, def.statId));
  return { stored, unlocked: unlockedMask(def, stored), equipped: eq?.bit ?? 0 };
}

function purchaseReason(def: EnumPerkDef, opt: PerkOption): string {
  return def.equip === "gang" ? `${def.name}: ${opt.label}` : `${def.title} (${opt.label})`;
}

/** Handle `!<perk> [option…]` for the player in `slot`. Never throws. */
export function runPerk(def: EnumPerkDef, slot: number, args: string[]): void {
  const say = (m: string): void => Chat.toSlot(slot, m);
  const gangs = readyGangs();
  if (!gangs) return say(msgFor(slot).notReady());
  const steam = steamOfSlot(slot);
  if (!steam) return say(msgFor(slot).noSteamId());
  const gang = gangs.getGangOf(steam);
  if (!gang) return say(msgFor(slot).notInGang());

  const view = readPerk(gangs, def, gang.id, steam);
  if (args.length === 0) {
    openPerkMenu(def, slot, view.unlocked, view.equipped, (s, name) => runPerk(def, s, [name]));
    return;
  }

  const opt = findOption(def, args);
  if (!opt) {
    const expected = def.resolve === "icon" || def.resolve === "gang-icon" ? labelFor(slot,"JB_GANGPERKS_EXPECT_ICON") : labelFor(slot,"JB_GANGPERKS_EXPECT_COLOR");
    return say(msgFor(slot).invalidParam(args.join(" "), expected));
  }

  const decision = decide(def, opt, {
    unlocked: view.unlocked,
    equipped: view.equipped,
    canPurchase: gangs.hasPermission(steam, Perm.PURCHASE_PERKS),
    canManage: gangs.hasPermission(steam, Perm.MANAGE_PERKS),
  });
  const who = Player.fromSlot(slot)?.playerName ?? steam;

  switch (decision.kind) {
    case "no_purchase_perm":
      return say(msgFor(slot).noPermRank(minRankName(gangs.getRanks(gang.id), Perm.PURCHASE_PERKS)));
    case "no_manage_perm":
      return say(msgFor(slot).noPermRank(minRankName(gangs.getRanks(gang.id), Perm.MANAGE_PERKS)));
    case "already":
      return;
    case "buy": {
      if (gangs.tryPurchase(steam, decision.cost, purchaseReason(def, opt), false) < 0) {
        return say(msgFor(slot).cannotAfford(decision.cost, gangs.getBalance(steam, false)));
      }
      const stored = unlock(view.stored, opt);
      const value =
        def.equip === "gang" ? encodeGangData({ Unlocked: stored, Equipped: decision.equip ? opt.bit : view.equipped }) : stored;
      if (!gangs.setGangStat(gang.id, def.statId, value)) {
        // Could not record the unlock: give the credits back rather than lose them.
        gangs.grantPlayer(steam, decision.cost, `Refund: ${purchaseReason(def, opt)}`);
        return say(msgFor(slot).purchaseFailed());
      }
      broadcastGang(gangs,gang.id,recipient=>msgFor(recipient).purchased(who,def,opt));
      return;
    }
    case "equip": {
      if (def.equip === "player") {
        gangs.setPlayerStat(steam, def.statId, opt.bit);
        return say(msgFor(slot).equipped(def, opt));
      }
      gangs.setGangStat(gang.id, def.statId, encodeGangData({ Unlocked: view.stored, Equipped: opt.bit }));
      broadcastGang(gangs,gang.id,recipient=>msgFor(recipient).gangThingSet(who,def,opt));
      return;
    }
  }
}

/** The perk commands' names, for the README and registration. */
export const PERK_COMMANDS: string[] = ALL_PERKS.map((p) => p.command);

/** Gangs' chat contract targets online members; resolve each member's text on this side. */
function broadcastGang(gangs:GangsApi,gangId:number,render:(slot:number)=>string):void {
  for(const client of Clients.all()){
    if(!client.isValid()||client.isBot||!client.steamId||client.steamId==="0"||gangs.getGangOf(client.steamId)?.id!==gangId)continue;
    const text=render(client.slot);
    // Both translation and the provider can reenter. Keep membership and connection current.
    if(gangs.getGangOf(client.steamId)?.id===gangId&&client.isValid())client.chat(text);
  }
}
