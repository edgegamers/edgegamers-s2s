import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CommandInvocation } from "@s2script/sdk/commands";
import type { CtxCommands } from "@s2script/sdk/plugin";
import type { TttCoreApi, TttPlayerSnapshot } from "@edgegamers/ttt-core";
import type { TttPurchaseResult, TttShopApi, TttShopItem } from "../api.d.ts";
import { registerShopCommands } from "../src/commands.ts";

interface RegisteredCommands {
  public: Map<string, (cmd: CommandInvocation) => void>;
  admin: Map<string, (cmd: CommandInvocation) => void>;
}

interface FakeMenu {
  style: string;
  addItem(info: string, display: string, options?: { disabled?: boolean }): void;
  onSelect(handler: (event: { slot: number; info: string }) => void): void;
  display(slot: number, seconds?: number): void;
}

function createCommands(): RegisteredCommands & CtxCommands {
  const publicCommands = new Map<string, (cmd: CommandInvocation) => void>();
  const adminCommands = new Map<string, (cmd: CommandInvocation) => void>();
  return {
    public: publicCommands,
    admin: adminCommands,
    register(name, handler) { publicCommands.set(name, handler); },
    registerServer() {},
    registerAdmin(name, _flags, handler) { adminCommands.set(name, handler); },
    onClientCommand() {},
  } as RegisteredCommands & CtxCommands;
}

function command(callerSlot: number, args: readonly string[] = []): CommandInvocation & { replies: string[] } {
  const replies: string[] = [];
  return {
    callerSlot,
    replySource: callerSlot < 0 ? "server" : "chat",
    args: [...args],
    argString: args.join(" "),
    argCount: args.length,
    arg(index) { return args[index] ?? ""; },
    argInt(index, fallback = 0) {
      const value = Number.parseInt(args[index] ?? "", 10);
      return Number.isFinite(value) ? value : fallback;
    },
    argFloat(_index, fallback = 0) { return fallback; },
    argsFrom(index) { return args.slice(index).join(" "); },
    reply(message) { replies.push(message); },
    replyToChat(message) { replies.push(message); },
    replyToConsole(message) { replies.push(message); },
    replyT() {},
    replies,
  };
}

function player(slot: number, name: string): TttPlayerSnapshot {
  return {
    slot,
    steamId: `steam-${slot}`,
    name,
    connected: true,
    participating: true,
    alive: true,
    role: "ttt:traitor",
    team: "traitor",
  };
}

function createCore(options: { state?: "waiting" | "in_progress"; alive?: boolean; players?: readonly TttPlayerSnapshot[] } = {}): TttCoreApi {
  const state = options.state ?? "in_progress";
  const alive = options.alive ?? true;
  const players = options.players ?? [player(3, "Ada")];
  return {
    gameState: () => ({ state, participants: players.length, roundsThisMap: 1, winner: "", reason: "" }),
    isAlive: () => alive,
    activePlayers: () => players,
  } as unknown as TttCoreApi;
}

function item(id: string, name = id): TttShopItem {
  return { id, name, description: "", price: 40, enabled: true, onPurchase: () => undefined };
}

function createShop(overrides: Partial<TttShopApi> = {}): TttShopApi {
  const items = [item("armor", "Armor"), item("radar", "Radar")];
  return {
    registerItem() {},
    itemById: (id) => items.find((candidate) => candidate.id === id) ?? null,
    allItems: () => items,
    balanceOf: () => 75,
    addBalance() {},
    setBalance() {},
    resetRound() {},
    canPurchase: () => "success" as TttPurchaseResult,
    tryPurchase: () => "success" as TttPurchaseResult,
    ...overrides,
  };
}

describe("TTT shop commands", () => {
  it("registers shop aliases and the generic-admin item grant command", () => {
    const commands = createCommands();

    registerShopCommands(commands, createCore(), createShop());

    for (const name of [
      "sm_shop", "sm_menu", "sm_list", "sm_buy", "sm_purchase", "sm_b",
      "sm_balance", "sm_bal", "sm_credits", "sm_points",
    ]) {
      assert.equal(commands.public.has(name), true, `${name} should be public`);
    }
    assert.equal(commands.admin.has("sm_ttt_give"), true);
  });

  it("refuses a buy command outside an active round without attempting a purchase", () => {
    const commands = createCommands();
    let purchases = 0;
    registerShopCommands(commands, createCore({ state: "waiting" }), createShop({
      tryPurchase: () => { purchases += 1; return "success"; },
    }));
    const invocation = command(3, ["armor"]);

    commands.public.get("sm_buy")!(invocation);

    assert.equal(purchases, 0);
    assert.deepEqual(invocation.replies, ["The shop is only available while you are alive in an active round."]);
  });

  it("refuses a buy command from a dead player without attempting a purchase", () => {
    const commands = createCommands();
    let purchases = 0;
    registerShopCommands(commands, createCore({ alive: false }), createShop({
      tryPurchase: () => { purchases += 1; return "success"; },
    }));
    const invocation = command(3, ["armor"]);

    commands.public.get("sm_buy")!(invocation);

    assert.equal(purchases, 0);
    assert.deepEqual(invocation.replies, ["The shop is only available while you are alive in an active round."]);
  });

  it("lists role-visible items in an active round and marks unavailable entries", () => {
    const commands = createCommands();
    const armor = item("armor", "Armor");
    const c4 = item("c4", "C4");
    const radar = item("radar", "Radar");
    registerShopCommands(commands, createCore(), createShop({
      allItems: () => [c4, armor, radar],
      canPurchase: (_slot, id) => id === "c4" ? "wrong_role" : id === "radar" ? "insufficient_funds" : "success",
    }));
    const invocation = command(3);

    commands.public.get("sm_list")!(invocation);

    assert.deepEqual(invocation.replies, [
      "1. [40] Armor",
      "2. [40] Radar (unavailable)",
      "You have 75 credits.",
    ]);
  });

  it("revalidates round state and liveness when a menu selection is made", () => {
    const commands = createCommands();
    let select: ((event: { slot: number; info: string }) => void) | undefined;
    let purchases = 0;
    let state: "in_progress" | "waiting" = "in_progress";
    let alive = true;
    (globalThis as unknown as { __s2pkg_menu: { Menu: new () => FakeMenu; MenuStyle: { Chat: string } } }).__s2pkg_menu = {
      Menu: class {
        style = "";
        addItem() {}
        onSelect(handler: (event: { slot: number; info: string }) => void) { select = handler; }
        display() {}
      },
      MenuStyle: { Chat: "chat" },
    };
    const core = {
      gameState: () => ({ state, participants: 1, roundsThisMap: 1, winner: "", reason: "" }),
      isAlive: () => alive,
      activePlayers: () => [player(3, "Ada")],
    } as unknown as TttCoreApi;
    registerShopCommands(commands, core, createShop({
      tryPurchase: () => { purchases += 1; return "success"; },
    }));
    const invocation = command(3);

    commands.public.get("sm_shop")!(invocation);
    state = "waiting";
    alive = false;
    select!({ slot: 3, info: "armor" });

    assert.equal(purchases, 0);
    assert.deepEqual(invocation.replies, [
      "You have 75 credits.",
      "The shop is only available while you are alive in an active round.",
    ]);
  });

  it("grants a named public item to a uniquely matched connected player", () => {
    const commands = createCommands();
    let grantedTo = -1;
    const armor = { ...item("armor", "Armor"), onPurchase: (slot: number) => { grantedTo = slot; } };
    registerShopCommands(commands, createCore({ players: [player(3, "Ada"), player(7, "Grace")] }), createShop({
      itemById: (id) => id === "armor" ? armor : null,
    }));
    const invocation = command(-1, ["gra", "armor"]);

    commands.admin.get("sm_ttt_give")!(invocation);

    assert.equal(grantedTo, 7);
    assert.deepEqual(invocation.replies, ["[ttt] gave Armor to Grace"]);
  });
});
