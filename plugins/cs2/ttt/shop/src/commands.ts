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
import type { CommandInvocation } from "@s2script/sdk/commands";
import type { Menu, MenuStyle } from "@s2script/sdk/menu";
import type { CtxCommands } from "@s2script/sdk/plugin";
import type { TttCoreApi, TttPlayerSnapshot } from "@edgegamers/ttt-core";
import type { TttPurchaseResult, TttShopApi, TttShopItem } from "../api.d.ts";

const GENERIC_ADMIN_FLAG = 2;
const PLAYER_ONLY = "This command can only be used by a player.";
const SHOP_INACTIVE = "The shop is only available while you are alive in an active round.";

interface MenuRuntime {
  Menu: new (title?: string) => Menu;
  MenuStyle: { Chat: MenuStyle };
}

interface ShopListEntry {
  item: TttShopItem;
  purchaseResult: TttPurchaseResult;
}

export function registerShopCommands(commands: CtxCommands, core: TttCoreApi, shop: TttShopApi): void {
  const balance = (cmd: CommandInvocation): void => {
    if (cmd.callerSlot < 0) {
      cmd.reply(PLAYER_ONLY);
      return;
    }
    cmd.reply(`You have ${shop.balanceOf(cmd.callerSlot)} credits.`);
  };

  const list = (cmd: CommandInvocation): void => {
    const slot = cmd.callerSlot;
    if (slot >= 0 && core.gameState().state !== "in_progress") {
      cmd.reply(SHOP_INACTIVE);
      return;
    }

    const entries = slot < 0
      ? shop.allItems().map((item) => ({ item, purchaseResult: "success" as const }))
      : listEntries(slot, shop);
    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index]!;
      cmd.replyToChat(formatListEntry(entry, index + 1, slot >= 0));
    }
    if (slot >= 0) cmd.replyToChat(`You have ${shop.balanceOf(slot)} credits.`);
  };

  const buy = (cmd: CommandInvocation, query = cmd.argsFrom(0).trim()): void => {
    if (!canPlayerPurchase(cmd, core)) return;
    if (query === "") {
      cmd.reply("Usage: sm_buy <item>");
      return;
    }

    const item = findItem(cmd.callerSlot, query, shop);
    if (item === null) {
      cmd.reply(`Could not find an item named "${query}".`);
      return;
    }

    replyPurchaseResult(cmd, shop.tryPurchase(cmd.callerSlot, item.id), item.name);
  };

  const openMenu = (cmd: CommandInvocation): void => {
    const slot = cmd.callerSlot;
    if (slot < 0) {
      list(cmd);
      return;
    }
    if (core.gameState().state !== "in_progress") {
      cmd.reply(SHOP_INACTIVE);
      return;
    }

    const runtime = menuRuntime();
    if (runtime === null) {
      list(cmd);
      return;
    }

    const menu = new runtime.Menu("Shop");
    menu.style = runtime.MenuStyle.Chat;
    const entries = listEntries(slot, shop);
    cmd.replyToChat(`You have ${shop.balanceOf(slot)} credits.`);
    for (const entry of entries) {
      const available = entry.purchaseResult === "success";
      menu.addItem(
        entry.item.id,
        `[${entry.item.price}] ${entry.item.name}${available ? "" : " (unavailable)"}`,
        { disabled: !available },
      );
    }
    menu.onSelect((event) => {
      if (event.slot !== slot || !canSlotPurchase(event.slot, core)) {
        cmd.replyToChat(SHOP_INACTIVE);
        return;
      }
      const item = shop.itemById(event.info);
      if (item === null) return;
      replyPurchaseResult(cmd, shop.tryPurchase(event.slot, item.id), item.name, true);
    });
    menu.display(slot, 30);
  };

  commands.register("sm_balance", balance);
  commands.register("sm_bal", balance);
  commands.register("sm_credits", balance);
  commands.register("sm_points", balance);
  commands.register("sm_buy", buy);
  commands.register("sm_purchase", buy);
  commands.register("sm_b", buy);
  commands.register("sm_list", list);
  commands.register("sm_menu", openMenu);
  commands.register("sm_shop", (cmd) => {
    switch (cmd.arg(0).toLowerCase()) {
      case "buy":
      case "purchase":
        buy(cmd, cmd.argsFrom(1).trim());
        return;
      case "balance":
      case "bal":
        balance(cmd);
        return;
      case "":
      case "list":
        openMenu(cmd);
        return;
      default:
        cmd.reply("Usage: sm_shop <list|buy [item]|balance>");
    }
  });
  commands.registerAdmin("sm_ttt_give", GENERIC_ADMIN_FLAG, (cmd) => {
    if (cmd.argCount < 2) {
      cmd.reply(`[ttt] items: ${shop.allItems().map((item) => item.id).join(", ")}`);
      cmd.reply("[ttt] usage: sm_ttt_give <slot|name> <item-id>");
      return;
    }

    const target = resolveTarget(core.activePlayers(), cmd.arg(0));
    if (target === null) {
      cmd.reply(`[ttt] no connected player matching "${cmd.arg(0)}"`);
      return;
    }
    const item = shop.itemById(cmd.arg(1).toLowerCase());
    if (item === null) {
      cmd.reply(`[ttt] unknown item "${cmd.arg(1)}" - try sm_ttt_give with no arguments`);
      return;
    }
    if (item.onPurchase(target.slot) === false) {
      cmd.reply(`[ttt] could not deliver ${item.name} to ${target.name}`);
      return;
    }
    cmd.reply(`[ttt] gave ${item.name} to ${target.name}`);
  });
}

function menuRuntime(): MenuRuntime | null {
  return (globalThis as unknown as { __s2pkg_menu?: MenuRuntime }).__s2pkg_menu ?? null;
}

function canPlayerPurchase(cmd: CommandInvocation, core: TttCoreApi): boolean {
  if (cmd.callerSlot < 0) {
    cmd.reply(PLAYER_ONLY);
    return false;
  }
  if (!canSlotPurchase(cmd.callerSlot, core)) {
    cmd.reply(SHOP_INACTIVE);
    return false;
  }
  return true;
}

function canSlotPurchase(slot: number, core: TttCoreApi): boolean {
  return slot >= 0 && core.gameState().state === "in_progress" && core.isAlive(slot);
}

function listEntries(slot: number, shop: TttShopApi): ShopListEntry[] {
  return shop.allItems()
    .map((item) => ({ item, purchaseResult: shop.canPurchase(slot, item.id) }))
    .filter((entry) => entry.purchaseResult !== "wrong_role")
    .sort((left, right) => {
      const leftAvailable = left.purchaseResult === "success" ? 0 : 1;
      const rightAvailable = right.purchaseResult === "success" ? 0 : 1;
      if (leftAvailable !== rightAvailable) return leftAvailable - rightAvailable;
      if (left.item.price !== right.item.price) return left.item.price - right.item.price;
      return left.item.name.localeCompare(right.item.name);
    });
}

function formatListEntry(entry: ShopListEntry, index: number, playerView: boolean): string {
  return `${index}. [${entry.item.price}] ${entry.item.name}` +
    (playerView && entry.purchaseResult !== "success" ? " (unavailable)" : "");
}

function findItem(slot: number, query: string, shop: TttShopApi): TttShopItem | null {
  const entries = listEntries(slot, shop);
  const index = Number.parseInt(query, 10);
  if (String(index) === query) return entries[index - 1]?.item ?? null;

  const itemById = shop.itemById(query.toLowerCase());
  if (itemById !== null) return itemById;

  const lowerQuery = query.toLowerCase();
  for (const entry of entries) if (entry.item.name.toLowerCase() === lowerQuery) return entry.item;
  for (const entry of entries) if (entry.item.name.toLowerCase().includes(lowerQuery)) return entry.item;
  for (const entry of entries) if (entry.item.description.toLowerCase().includes(lowerQuery)) return entry.item;
  return null;
}

function replyPurchaseResult(
  cmd: CommandInvocation,
  result: TttPurchaseResult,
  itemName: string,
  toChat = false,
): void {
  const reply = toChat ? cmd.replyToChat.bind(cmd) : cmd.reply.bind(cmd);
  switch (result) {
    case "success":
      reply(`You purchased ${itemName}.`);
      return;
    case "insufficient_funds":
      reply(`You cannot afford ${itemName}.`);
      return;
    case "wrong_role":
      reply("You cannot purchase this item with your role.");
      return;
    case "limit_reached":
      reply("You have reached this item's purchase limit.");
      return;
    case "delivery_failed":
      reply("Item delivery failed and your credits were refunded.");
      return;
    case "canceled":
      reply("Purchase canceled.");
      return;
    case "not_found":
      reply(`Could not find ${itemName}.`);
      return;
    case "not_purchasable":
      reply("You cannot purchase this item right now.");
  }
}

function resolveTarget(players: readonly TttPlayerSnapshot[], query: string): TttPlayerSnapshot | null {
  const connected = players.filter((player) => player.connected);
  const numericSlot = Number.parseInt(query, 10);
  if (String(numericSlot) === query) return connected.find((player) => player.slot === numericSlot) ?? null;

  const lowerQuery = query.toLowerCase();
  const exact = connected.find((player) => player.name.toLowerCase() === lowerQuery);
  if (exact !== undefined) return exact;
  const partialMatches = connected.filter((player) => player.name.toLowerCase().includes(lowerQuery));
  return partialMatches.length === 1 ? partialMatches[0]! : null;
}
