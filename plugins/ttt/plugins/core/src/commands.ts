import {tellAllWith} from "./cs2/pawn";
import { plainPhraseFor as tr, phraseFor } from "../../../packages/contracts/phrases.ts";
/**
 * Chat/console commands — the port of `CommandManager`, `TTTCommand`, `LogsCommand`,
 * `KarmaCommand`, `ShopCommand`, `BuyCommand`, `ListCommand`, `BalanceCommand` and the test
 * commands under `TTT/CS2/Command/Test`.
 *
 * The C# had its own command manager layered over CounterStrikeSharp's: a `Dictionary<string,
 * ICommand>` of DI-registered command objects, each with `Aliases`/`Usage`/`RequiredFlags`, an
 * async `Execute` returning a result enum the manager then translated into a reply. s2script's
 * `ctx.commands` already provides registration, chat triggers, admin gating and reply routing, so
 * commands here register directly against it.
 */

import { command } from "@s2script/sdk/commands";
import { fileReport, pendingReports, reportsAvailable } from "./core/reports-provider";
const FileResult={Ok:0,RateLimited:1,SelfReport:2,Duplicate:3,EmptyReason:4} as const;
const REPORTS_PER_ROUND=3;
import { answerPending } from "./core/reports-provider";
import type { CommandInvocation } from "@s2script/sdk/commands";
import { ADMFLAG, Admin } from "@s2script/sdk/admin";
import { ChatColors } from "@s2script/cs2";
import { GameState, MAX_SLOTS, RoleId } from "./core/enums";
import { cfg } from "./core/cvars";
import { msg, msgFor } from "./core/msgs";
import * as reg from "./core/registry";
import { getHealth, setHealth, teamOf, tell, tellAll } from "./cs2/pawn";
import { game, inWarmup, startGame, endGame } from "./game/game";
import { reserveRole, roleName, roleNameFor } from "./game/roles";
import { printLogsTo } from "./game/logger";
import { allBodies } from "./cs2/bodies";
import { Entity } from "@s2script/sdk/entity";
import { damageDiag, killWithGadget } from "./cs2/combat";
import { applyMapContext, clearMapContexts } from "./cs2/feedback";
import { Voice } from "@s2script/sdk/voice";
import {grantShopItem} from "./shop/items";
import { Menu, MenuCancelReason, MenuStyle } from "@s2script/sdk/menu";
import { adminSetKarma, karmaAvailable, karmaOf, timeoutRemaining } from "./karma/karma";
import {
  addBalance, allItems, balanceOf, canPurchase, itemById, PurchaseResult, sortedFor, tryPurchase,
  type ShopItem,
} from "./shop/shop";
import { roundIds, specialAvailable, startSpecialRounds } from "./special/rounds";
import { getTttHud } from "./cs2/ttthud";

/** Reusable buffer for the shop listing — one allocation for the plugin's lifetime. */
const listBuffer: ShopItem[] = [];

// --- the shop menu ------------------------------------------------------------------------------
// Built on the SDK `Menu` rather than a bespoke "remember what I printed and watch chat for a
// digit" scheme, which is what this used to be. That matters for correctness, not just tidiness:
// `Menu` guarantees ONE open menu per slot and supersedes the previous one, so a player who opens
// the shop while the nominate menu is up cannot have a single "2" understood by both. A hand-rolled
// digit interceptor sits outside that guarantee and would double-fire against any other menu on the
// server.
//
// Pagination (7 per chat page), the number keys, the Exit control and the timeout all come from the
// framework too.

/** Try the Panorama shop. False = no HUD available, caller should fall back. */
function openShopHud(slot: number): boolean {
  const ui = getTttHud();
  if (!ui) return false;
  return ui.openShop(slot);
}

/**
 * Dismiss the shop sheet if one is up. Returns true when there was something to close.
 *
 * Called BEFORE any round-state or liveness gate, and deliberately so: a player must never be
 * stuck with a panel they cannot get rid of. Dying with the shop open, or the round ending under
 * it, would otherwise leave the sheet on screen with the mouse captured and every dismissal path
 * gated off. `hideAll` rather than just `close` because it also drops any other pooled panel this
 * player has up and releases the cursor — the middle mouse button is the escape hatch, so it has
 * to actually clear the screen.
 */
function closeShopIfOpen(slot: number): boolean {
  const ui = getTttHud();
  if (!ui || !ui.isShopOpen(slot)) return false;
  ui.closeShop(slot);
  ui.hideAll(slot);
  return true;
}

/**
 * Open the shop for `slot` — Panorama first, the chat menu second.
 *
 * The buy-menu route (`cs2/buymenu.ts`) comes through here rather than through `!shop`, because it
 * has to answer a keypress that arrives at any moment in the round. Outside a live round it says so
 * instead of drawing a store whose every row is unbuyable: `canPurchase` already refuses everything
 * unless `inProgress()`, so an "open" shop there would be a menu that does nothing when clicked.
 */
export function openShopFor(slot: number): void {
  if (slot < 0) return;
  if (closeShopIfOpen(slot)) return;          // a second press means "put it away"
  if (game.state !== GameState.InProgress) {
    tell(slot, msgFor(slot, "SHOP_INACTIVE"));
    return;
  }
  if (!openShopHud(slot)) openShopMenu(slot);
}

/** Open the shop menu for `slot`. Shared by `!shop`, `!list` and the ping shortcut. */
function openShopMenu(slot: number): void {
  if (slot < 0) return;
  if (game.state !== GameState.InProgress) {
    tell(slot, msgFor(slot, "SHOP_INACTIVE"));
    return;
  }
  const role = reg.roleOf(slot);
  if (role === RoleId.None) return;

  const items = sortedFor(slot, listBuffer);
  const bal = balanceOf(slot);
  tell(slot, msgFor(slot, "SHOP_LIST_FOOTER", roleNameFor(slot, role), bal));
  if (items.length === 0) return;

  const m = new Menu(tr(slot, "SHOP_MENU_TITLE"));
  m.style = MenuStyle.Chat; // non-freezing: the player is mid-round and being hunted
  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;
    // Unaffordable and role-locked items stay VISIBLE but disabled, for the same reason cooldown
    // maps stay in the nominate menu: a catalogue that silently omits things cannot be learned from.
    // `disabled` also keeps them off the number keys, so nothing is bought by accident.
    // The chat menu renderer prints each line through Chat.toSlot, so colour bytes in the DISPLAY
    // string render as they would in any other chat line. Price in amber, name in green when it can
    // be bought and red when it cannot — the same read as the old flat listing.
    const ok = canPurchase(slot, item) === PurchaseResult.Success && item.price <= bal;
    const name = msgFor(slot, item.nameKey);
    m.addItem(item.id, tr(slot, ok ? "SHOP_MENU_ITEM" : "SHOP_MENU_ITEM_UNAFFORDABLE", item.price, name), { disabled: !ok });
  }

  // Picking a row does NOT spend anything — it opens the confirm step below. The Panorama shop has
  // worked this way since a single physical click was found to reach the server more than once
  // (one press, two healthshots); this menu is the same shop reached a different way, so it gets
  // the same protection. A mis-pick now costs a keypress instead of credits.
  m.onSelect((e) => {
    const item = itemById(e.info);
    if (item !== undefined) confirmPurchase(e.slot, item);
  });

  m.onCancel((e) => {
    // Only the two closes the PLAYER caused are worth a word. `NewMenu` means they opened something
    // else and are looking at it — telling them the shop closed would be noise about a thing they
    // just did on purpose — and `Disconnect` has nobody left to tell.
    if (e.reason === MenuCancelReason.Exit) tell(e.slot, msgFor(e.slot, "SHOP_MENU_CLOSED"));
    else if (e.reason === MenuCancelReason.Timeout) tell(e.slot, msgFor(e.slot, "SHOP_MENU_EXPIRED"));
  });

  m.display(slot, MENU_SECONDS);
  openMenus[slot] = m;
}

/**
 * Second, deliberate press before any credits move.
 *
 * Everything is re-validated HERE rather than trusted from display time: the menu was painted at
 * least one keypress ago, and in that window the player can have been shot, the round can have
 * ended, and their balance can have moved. Confirming is the only moment whose answer matters.
 */
function confirmPurchase(slot: number, item: ShopItem): void {
  if (game.state !== GameState.InProgress || !reg.isAlive(slot)) {
    tell(slot, msgFor(slot, "SHOP_INACTIVE"));
    return;
  }

  const m = new Menu(tr(slot, "SHOP_CONFIRM_TITLE", tr(slot, item.nameKey), item.price));
  m.style = MenuStyle.Chat;   // non-freezing, same as the shop it came from
  m.addItem("yes", tr(slot,"SHOP_CONFIRM_YES"));
  m.addItem("no", tr(slot,"SHOP_CONFIRM_NO"));

  m.onSelect((e) => {
    if (e.info !== "yes") { openShopMenu(e.slot); return; }
    // Re-checked a second time: this menu was itself open for a keypress.
    if (game.state !== GameState.InProgress || !reg.isAlive(e.slot)) {
      tell(e.slot, msgFor(e.slot, "SHOP_INACTIVE"));
      return;
    }
    if (tryPurchase(e.slot, item) !== PurchaseResult.Success) return; // prints its own refusal
    tell(e.slot, msgFor(e.slot, "SHOP_PURCHASED", msgFor(e.slot, item.nameKey)));
    const desc = tr(e.slot, item.descKey);
    if (desc !== "" && desc !== item.descKey) {
      tell(e.slot, msgFor(e.slot, "SHOP_PURCHASED_DETAIL", desc));
    }
  });

  // Only Exit is worth a word: a timeout on the CONFIRM step means they walked away from a
  // purchase they never made, and Disconnect has nobody left to tell.
  m.onCancel((e) => {
    if (e.reason === MenuCancelReason.Exit) tell(e.slot, msgFor(e.slot, "SHOP_MENU_CLOSED"));
  });

  m.display(slot, MENU_SECONDS);
  openMenus[slot] = m;
}

/** How long the shop menu stays open with no selection. */
const MENU_SECONDS = 30;

/** The live shop menu per slot, so a round boundary can close it. */
const openMenus: (Menu | null)[] = new Array<Menu | null>(MAX_SLOTS).fill(null);

/**
 * Close every open shop menu — round boundary and map change.
 *
 * A menu printed last round must not stay answerable into this one: its contents came from the old
 * role and balance, so a stale number would buy something the player never saw offered.
 */
export function resetShopMenus(): void {
  for (let i = 0; i < MAX_SLOTS; i++) {
    const m = openMenus[i];
    if (m !== null) m.close(i);
    openMenus[i] = null;
  }
}

/**
 * Open the shop from a middle-mouse ping.
 *
 * Through `openShopFor`, so the ping gets the SAME shop as `!shop` and the buy menu: the Panorama
 * sheet with credits, per-row detail and select-then-confirm, falling back to the plain `Menu` list
 * only when there is no HUD to draw on. It used to call `openShopMenu` directly, which meant the
 * one input a player has spare mid-round silently got the thinner of the two shops.
 */
export function onPlayerPing(slot: number): void {
  if (slot < 0 || slot >= MAX_SLOTS) return;
  // Closing comes first and is never gated — see `closeShopIfOpen`. Only OPENING requires a live
  // round and a live player.
  if (closeShopIfOpen(slot)) return;
  if (game.state !== GameState.InProgress || !reg.isAlive(slot)) return;
  openShopFor(slot);
}

/** The version string reported by `!ttt`. */
const VERSION = "0.1.0";

/** Register every TTT command. */
export function registerCommands(): void {
  command("sm_ttt", (cmd) => {
    if (cmd.arg(0).toLowerCase() !== "status") {
      cmd.reply(msgFor(cmd.callerSlot, "CMD_TTT", VERSION));
      return;
    }
    // `ttt` is a public command, but `ttt status` lists every player's ROLE — handing that to any
    // player would give away the whole game. Admins and the server console only.
    if (!isAdmin(cmd.callerSlot)) {
      cmd.reply(msgFor(cmd.callerSlot, "GENERIC_NO_PERMISSION"));
      return;
    }

    // A plain-text dump of the round state — the operator's window into what the plugin thinks is
    // happening; TTT's own chat output is invisible from an rcon console.
    const states = ["WAITING", "COUNTDOWN", "IN_PROGRESS", "FINISHED"];
    const active = reg.activeSlots();
    cmd.reply(
      phraseFor(cmd.callerSlot, "CHAT_STATE_PLAYERS_WARMUP_PARTICIPANTS_ROUNDSTHISMAP", states[game.state] ?? game.state, active.length, cfg.minPlayers, String(inWarmup()), game.participants, game.roundsThisMap),
    );
    cmd.reply(
      phraseFor(cmd.callerSlot, "CHAT_ALIVE_INNOCENT_TRAITOR_DETECTIVE", reg.aliveCount(RoleId.Innocent), reg.aliveCount(RoleId.Traitor), reg.aliveCount(RoleId.Detective)),
    );
    const bodies = allBodies();
    let live = 0;
    for (let i = 0; i < bodies.length; i++) if (bodies[i]!.ref.isValid()) live++;
    cmd.reply(
      phraseFor(cmd.callerSlot, "CHAT_BODIES_LIVE_ENTITIES_IDENTIFIED", bodies.length, live, bodies.filter((b) => b.identified).length),
    );
    cmd.reply(
      msgFor(
        cmd.callerSlot,
        "CMD_WORLD_ENTITIES",
        Entity.findByClass("point_worldtext").length,
        Entity.findByClass("prop_ragdoll").length,
        Entity.findByClass("prop_dynamic").length,
      ),
    );
    const d = damageDiag;
    cmd.reply(
      phraseFor(cmd.callerSlot, "CHAT_DAMAGE_PREHOOK_FALLBACK_CANCELED_APPLIED", d.hits, d.fallbackHits, d.canceled, d.applied),
    );
    // `rewrites` is the effect counter: a voice rule that never rewrites is not doing anything.
    const v = Voice.stats();
    cmd.reply(
      (v === null ? phraseFor(cmd.callerSlot, "CHAT_VOICE_UNSUPPORTED_ON_THIS_RUNTIME") : phraseFor(cmd.callerSlot, "CHAT_VOICE_CALLS_RULES_REWRITES", v.calls, v.entries, v.rewrites)),
    );
    for (let i = 0; i < active.length; i++) {
      const slot = active[i]!;
      cmd.reply(
        phraseFor(cmd.callerSlot, "CHAT_ROLE_ALIVE_ENGINE_HP_TEAM_CREDITS_KARMA", slot, reg.nameOf(slot), roleNameFor(cmd.callerSlot, reg.roleOf(slot)) || tr(cmd.callerSlot, "LABEL_NONE"), String(reg.isAlive(slot)), String(reg.computeAlive(slot)), getHealth(slot), teamOf(slot), balanceOf(slot), karmaOf(slot)),
      );
    }
  });

  command("sm_logs", (cmd) => {
    // Admins only — the log names every role, kill and purchase of the round, so a player reading
    // it mid-round has solved the game. `isAdmin` lets the server console through, which is right:
    // an operator reading their own console is not a participant.
    if (!isAdmin(cmd.callerSlot)) {
      cmd.reply(msgFor(cmd.callerSlot, "GENERIC_NO_PERMISSION"));
      return;
    }
    // NO game-state gate. An admin rules on a report during the NEXT round, or between maps, or
    // while the server is idle — which is exactly when the old gate refused. The browser opens on
    // the most recent round and pages back through the archive from there.
    const slot = cmd.callerSlot;
    // Viewing the logs while alive is announced, exactly as the original did — it is an
    // information advantage the rest of the server is entitled to know about.
    if (slot >= 0 && reg.isAlive(slot)) {
      tellAllWith((recipient,name) => msgFor(recipient,"LOGS_VIEWED_ALIVE",name),reg.nameOf(slot));
    } else if (slot >= 0) {
      cmd.reply(msgFor(cmd.callerSlot, "LOGS_VIEWED_INFO"));
    }
    // The pageable browser for a player; the flat console dump for rcon.
    if (slot < 0 || getTttHud()?.openLogBrowser(slot) !== true) printLogsTo(slot);
  });

  // Fallbacks for the yes/no prompt, for anyone who closed the HUD prompt or has no HUD.
  // The Panorama prompt is the primary path; these exist so a missed click does not lose the report.
  command("sm_rdmyes", (cmd) => {
    const slot = cmd.callerSlot;
    if (slot < 0) { cmd.reply(msgFor(slot, "GENERIC_PLAYER_ONLY")); return; }
    if (!answerPending(slot, true)) cmd.reply(msgFor(slot, "RDM_ASK_EXPIRED"));
  });

  command("sm_rdmno", (cmd) => {
    const slot = cmd.callerSlot;
    if (slot < 0) { cmd.reply(msgFor(slot, "GENERIC_PLAYER_ONLY")); return; }
    if (!answerPending(slot, false)) cmd.reply(msgFor(slot, "RDM_ASK_EXPIRED"));
  });

  command("sm_karma", (cmd) => {
    if (cmd.callerSlot < 0) {
      cmd.reply(msgFor(cmd.callerSlot, "GENERIC_PLAYER_ONLY"));
      return;
    }
    cmd.reply(msgFor(cmd.callerSlot, "KARMA_COMMAND", karmaOf(cmd.callerSlot)));
  });

  // ── shop ──────────────────────────────────────────────────────────────────
  const balance = (cmd: CommandInvocation): void => {
    if (cmd.callerSlot < 0) {
      cmd.reply(msgFor(cmd.callerSlot, "GENERIC_PLAYER_ONLY"));
      return;
    }
    cmd.reply(msgFor(cmd.callerSlot, "COMMAND_BALANCE", balanceOf(cmd.callerSlot)));
  };

  const list = (cmd: CommandInvocation): void => {
    const slot = cmd.callerSlot;
    // The shop opens with the round. Browsing during the countdown showed the catalogue before
    // anyone had a role, which both leaks the Traitor list and invites buying into a role you have
    // not been dealt. Console (slot < 0) still lists everything, for operators.
    if (slot >= 0 && game.state !== GameState.InProgress) {
      cmd.reply(msgFor(slot, "SHOP_INACTIVE"));
      return;
    }
    const items = slot < 0 ? (allItems() as ShopItem[]) : sortedFor(slot, listBuffer);
    const bal = slot < 0 ? Number.MAX_SAFE_INTEGER : balanceOf(slot);

    for (let i = 0; i < items.length; i++) {
      const item = items[i]!;
      const affordable =
        (slot < 0 || canPurchase(slot, item) === PurchaseResult.Success) && item.price <= bal;
      cmd.replyToChat(formatItem(item, i + 1, affordable, slot));
    }

    if (slot < 0 || game.state !== GameState.InProgress) return;
    const role = reg.roleOf(slot);
    if (role === RoleId.None) return;
    cmd.replyToChat(msgFor(slot, "SHOP_LIST_FOOTER", roleNameFor(slot, role), bal));
  };

  const buy = (cmd: CommandInvocation, query = cmd.argsFrom(0).trim()): void => {
    const slot = cmd.callerSlot;
    if (slot < 0) {
      cmd.reply(msgFor(cmd.callerSlot, "GENERIC_PLAYER_ONLY"));
      return;
    }
    if (game.state !== GameState.InProgress || !reg.isAlive(slot)) {
      cmd.reply(msgFor(cmd.callerSlot, "SHOP_INACTIVE"));
      return;
    }
    if (query === "") {
      cmd.reply(msgFor(cmd.callerSlot, "GENERIC_USAGE", tr(cmd.callerSlot, "TEXT_BUY_ITEM")));
      return;
    }

    const item = findItem(slot, query);
    if (item === undefined) {
      cmd.reply(msgFor(cmd.callerSlot, "SHOP_ITEM_NOT_FOUND", query));
      return;
    }
    if (tryPurchase(slot, item) !== PurchaseResult.Success) return;
    cmd.reply(msgFor(cmd.callerSlot, "SHOP_PURCHASED", msgFor(cmd.callerSlot, item.nameKey)));
    const desc = tr(slot, item.descKey);
    if (desc !== "" && desc !== item.descKey) cmd.reply(msgFor(cmd.callerSlot, "SHOP_PURCHASED_DETAIL", desc));
  };


  // ── RDM reporting ─────────────────────────────────────────────────────────────────────────────
  // Players file; admins adjudicate. Choosing who, the yes/no prompt and every outcome are Panorama;
  // chat stays the transport for the reason because the custom HUD has no text entry — only state
  // crosses the wire. The text forms below remain for players without the HUD.

  command("sm_report", (cmd) => {
    const slot = cmd.callerSlot;
    if (slot < 0) { cmd.reply(msgFor(slot, "GENERIC_PLAYER_ONLY")); return; }
    const targetQuery = cmd.arg(0);
    const reason = cmd.argsFrom(1).trim();
    // Bare `!report` picks the player in the HUD, then asks for the reason in chat.
    if (targetQuery === "" && reportsAvailable() && getTttHud()?.openReportPicker(slot) === true) return;
    if (targetQuery === "" || reason === "") {
      cmd.reply(msgFor(slot, "GENERIC_USAGE", tr(slot, "TEXT_REPORT_PLAYER_WHAT_HAPPENED")));
      return;
    }
    const accused = resolveTarget(targetQuery);
    if (accused < 0) { cmd.reply(msgFor(slot, "GENERIC_NO_TARGET", targetQuery)); return; }

    if(!reportsAvailable()){cmd.reply(phraseFor(cmd.callerSlot, "CHAT_REPORTS_PLUGIN_IS_UNAVAILABLE"));return;}
    const { result, report, unavailable } = fileReport(slot, accused, reason);
    if(unavailable){cmd.reply(phraseFor(cmd.callerSlot, "CHAT_REPORTS_PLUGIN_IS_UNAVAILABLE_AN_ADMIN_SHOULD_VERIFY_WHETHER_THE_"));return;}

    if (result === FileResult.SelfReport)  { cmd.reply(phraseFor(cmd.callerSlot, "CHAT_YOU_CANNOT_REPORT_YOURSELF")); return; }
    if (result === FileResult.EmptyReason) { cmd.reply(phraseFor(cmd.callerSlot, "CHAT_DESCRIBE_WHAT_HAPPENED")); return; }
    if (result === FileResult.Duplicate)   { cmd.reply(phraseFor(cmd.callerSlot, "CHAT_YOU_ALREADY_REPORTED_THEM_THIS_ROUND")); return; }
    if (result === FileResult.RateLimited) {
      cmd.reply(phraseFor(cmd.callerSlot, "CHAT_REPORT_LIMIT_REACHED_PER_ROUND", REPORTS_PER_ROUND));
      return;
    }
    cmd.reply(phraseFor(cmd.callerSlot, "CHAT_REPORT_FILED_AN_ADMIN_WILL_REVIEW_IT"));
    if (report) {
      getTttHud()?.notifyAdmins("UI_RDM_NOTICE", `${report.reporterName} → ${report.accusedName}`);
    }
  });

  // Spawning the layout entity MUST happen in a command dispatch — doing it from a frame
  // segfaulted a live server at round start. So it is an explicit admin action, not implicit.
  command.admin("sm_ttt_hud", ADMFLAG.GENERIC, (cmd) => {
    const hud = getTttHud();
    if (!hud) { cmd.reply(phraseFor(cmd.callerSlot, "CHAT_HUD_UNAVAILABLE")); return; }
    const why = hud.ensure();
    cmd.reply((why === null ? phraseFor(cmd.callerSlot, "CHAT_HUD_LAYOUT_SPAWNED") : phraseFor(cmd.callerSlot, "CHAT_HUD_NOT_READY", why)));
  });

  command.admin("sm_rdm", ADMFLAG.GENERIC, (cmd) => {
    const slot = cmd.callerSlot;
    const queue = pendingReports();
    if (slot < 0) {
      // Console has no HUD; give it the queue as text rather than nothing.
      cmd.reply(phraseFor(cmd.callerSlot, "CHAT_PENDING_REPORT_S", queue.length));
      for (const r of queue) {
        cmd.reply(phraseFor(cmd.callerSlot, "CHAT_ROUND", r.id, r.reporterName, r.accusedName, r.round, r.reason));
      }
      return;
    }
    if (queue.length === 0) { cmd.reply(phraseFor(cmd.callerSlot, "CHAT_NO_PENDING_REPORTS")); return; }
    const hud = getTttHud();
    if (!hud) { cmd.reply(phraseFor(cmd.callerSlot, "CHAT_HUD_UNAVAILABLE")); return; }
    hud.openRdm(slot);
  });

  command("sm_balance", balance);
  command("sm_bal", balance);
  command("sm_credits", balance);
  command("sm_points", balance);
  // !shop — the clickable Panorama shop. Falls back to telling the player how to use the text
  // commands when they have no HUD, rather than appearing to do nothing.
  const shopMenu = (cmd: CommandInvocation): void => {
    const slot = cmd.callerSlot;
    if (slot < 0) { cmd.reply(phraseFor(cmd.callerSlot, "CHAT_SM_SHOP_NEEDS_AN_IN_GAME_CALLER")); return; }
    if (!openShopHud(slot)) openShopMenu(slot);
  };
  command("sm_shopmenu", shopMenu);

  command("sm_buy", buy);
  command("sm_purchase", buy);
  command("sm_b", buy);
  command("sm_list", list);
  // `!shop`/`!list` from a player opens the interactive menu; the console still gets the plain dump.
  // The middle-mouse ping opens the shop — the one input a CS2 player has spare mid-round that
  // costs no keyboard hand, which matters in a mode where stopping to type is how you get shot.
  //
  // `player_ping` is a CLIENT CONSOLE COMMAND, not a game event: subscribing to a game event of
  // that name (the obvious-looking thing) receives nothing, because no such event is ever fired.
  // The C# hooked it with `AddCommandListener`, and `onClientCommand` is that same seam —
  // `register` cannot be used here, because the ENGINE already owns the name and refuses to link a
  // second ConCommand to it. Observe-only: no HookResult is returned, so the ping marker is still
  // placed exactly as normal.
  command.onClientCommand("player_ping", (slot) => {
    onPlayerPing(slot);
  });

  command("sm_menu", (cmd) => {
    if (cmd.callerSlot < 0) list(cmd);
    else openShopMenu(cmd.callerSlot);
  });

  command("sm_shop", (cmd) => {
    const sub = cmd.arg(0).toLowerCase();
    switch (sub) {
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
        if (cmd.callerSlot < 0) { list(cmd); return; }
        // Custom HUD first, chat menu second. `openShopHud` returns false when the layout entity
        // has not been spawned (`sm_ttt_hud`) or the player has not mounted the workshop addon —
        // in either case the mode has to stay playable, so the chat menu is the floor.
        if (!openShopHud(cmd.callerSlot)) openShopMenu(cmd.callerSlot);
        return;
      default:
        cmd.reply(msgFor(cmd.callerSlot, "GENERIC_USAGE", tr(cmd.callerSlot, "TEXT_SHOP_LIST_BUY_ITEM_BALANCE")));
    }
  });

  // ── admin ─────────────────────────────────────────────────────────────────
  command.admin("sm_ttt_start", ADMFLAG.GENERIC, (cmd) => {
    if (game.state !== GameState.Waiting) {
      cmd.reply(msgFor(cmd.callerSlot, "GENERIC_ERROR", tr(cmd.callerSlot, "TEXT_A_ROUND_IS_ALREADY_RUNNING")));
      return;
    }
    startGame();
    cmd.reply(msgFor(cmd.callerSlot, "CMD_ROUND_STARTING"));
  });

  command.admin("sm_ttt_end", ADMFLAG.GENERIC, (cmd) => {
    if (game.state !== GameState.InProgress && game.state !== GameState.Countdown) {
      cmd.reply(msgFor(cmd.callerSlot, "GENERIC_ERROR", tr(cmd.callerSlot, "TEXT_NO_ROUND_IS_RUNNING")));
      return;
    }
    endGame(RoleId.None, "Ended by an admin");
    cmd.reply(msgFor(cmd.callerSlot, "CMD_ROUND_ENDED"));
  });

  command.admin("sm_ttt_special", ADMFLAG.GENERIC, (cmd) => {
    if (!specialAvailable()) { cmd.reply(phraseFor(cmd.callerSlot, "CHAT_SPECIAL_ROUND_PLUGIN_IS_UNAVAILABLE")); return; }
    const id = cmd.arg(0).toLowerCase();
    if (id === "") {
      cmd.reply(msgFor(cmd.callerSlot, "CMD_SPECIAL_AVAILABLE", roundIds().join(", ")));
      return;
    }
    const started = startSpecialRounds([id]);
    cmd.reply((started.length > 0 ? phraseFor(cmd.callerSlot, "CHAT_STARTED", started.join(", ")) : phraseFor(cmd.callerSlot, "CHAT_UNKNOWN_ROUND", id)));
  });

  /**
   * `ttt_karma [target] [value]` — inspect or set karma.
   *
   * Setting karma also lifts any karma timeout the new value clears. Without this an operator has
   * no way to put a benched player back in: karma and the sit-out counter are separate state, and
   * the C# build exposed neither (its `!karma` only ever read your own).
   */
  command.admin("sm_ttt_karma", ADMFLAG.GENERIC, (cmd) => {
    if (!karmaAvailable()) { cmd.reply(phraseFor(cmd.callerSlot, "CHAT_KARMA_PLUGIN_IS_UNAVAILABLE")); return; }
    if (cmd.argCount === 0) {
      const active = reg.activeSlots();
      for (let i = 0; i < active.length; i++) {
        const slot = active[i]!;
        const out = timeoutRemaining(slot);
        cmd.reply(
          phraseFor(cmd.callerSlot, "CHAT_KARMA", slot, reg.nameOf(slot), karmaOf(slot), (out > 0 ? tr(cmd.callerSlot,"LABEL_BENCHED",out) : "")),
        );
      }
      cmd.reply(msgFor(cmd.callerSlot, "CMD_USAGE_KARMA"));
      return;
    }

    const slot = resolveTarget(cmd.arg(0));
    if (slot < 0) {
      cmd.reply(msgFor(cmd.callerSlot, "CMD_NO_PLAYER_MATCH", cmd.arg(0)));
      return;
    }
    if (cmd.argCount < 2) {
      const out = timeoutRemaining(slot);
      cmd.reply(
        phraseFor(cmd.callerSlot, "CHAT_KARMA_2", reg.nameOf(slot), karmaOf(slot), (out > 0 ? tr(cmd.callerSlot,"LABEL_BENCHED",out) : "")),
      );
      return;
    }

    const value = cmd.argInt(1, -1);
    if (value < 0) {
      cmd.reply(msgFor(cmd.callerSlot, "GENERIC_USAGE", tr(cmd.callerSlot, "TEXT_TTT_KARMA_SLOT_NAME_VALUE")));
      return;
    }
    adminSetKarma(slot, value);
    cmd.reply(
      phraseFor(cmd.callerSlot, "CHAT_KARMA_SET_TO", reg.nameOf(slot), karmaOf(slot), (timeoutRemaining(slot) === 0 ? tr(cmd.callerSlot,"LABEL_TIMEOUT_CLEARED") : "")),
    );
  });

  /** `ttt_give <target> <item>` — grant a shop item for free (port of the C# `GiveItemCommand`). */
  command.admin("sm_ttt_give", ADMFLAG.GENERIC, (cmd) => {
    if (cmd.argCount === 0) {
      cmd.reply(msgFor(cmd.callerSlot, "CMD_ITEM_LIST", allItems().map((i) => i.id).join(", ")));
      cmd.reply(msgFor(cmd.callerSlot, "CMD_USAGE_GIVE"));
      return;
    }
    const slot = resolveTarget(cmd.arg(0));
    if (slot < 0) {
      cmd.reply(msgFor(cmd.callerSlot, "CMD_NO_PLAYER_MATCH", cmd.arg(0)));
      return;
    }
    const item = itemById(cmd.arg(1).toLowerCase());
    if (item === undefined) {
      cmd.reply(msgFor(cmd.callerSlot, "CMD_UNKNOWN_ITEM", cmd.arg(1)));
      return;
    }
    grantShopItem(slot,item.id);
    cmd.reply(
      msgFor(cmd.callerSlot, "CMD_GAVE_ITEM", msgFor(cmd.callerSlot, item.nameKey), reg.nameOf(slot)),
    );
  });

  /**
   * `ttt_roles` — who is who, coloured and grouped, printed to the caller's chat.
   *
   * `ttt status` answers the same question but is built for an rcon console: one dense line per
   * player, no colour. This is the in-game version — readable at a glance while spectating, which
   * is the only way to follow a round once you are dead.
   */
  command.admin("sm_ttt_roles", ADMFLAG.GENERIC, (cmd) => {
    if (game.state !== GameState.InProgress && game.state !== GameState.Finished) {
      cmd.replyToChat(msgFor(cmd.callerSlot, "GAME_LOGS_NONE"));
      return;
    }

    const active = reg.activeSlots();
    // Traitors first — they are what everyone is trying to work out.
    const order = [RoleId.Traitor, RoleId.Detective, RoleId.Innocent, RoleId.Spectator];
    let shown = 0;

    for (let r = 0; r < order.length; r++) {
      const role = order[r]!;
      const colour =
        role === RoleId.Traitor ? ChatColors.Red
        : role === RoleId.Detective ? ChatColors.Blue
        : role === RoleId.Innocent ? ChatColors.Green
        : ChatColors.Grey;

      for (let i = 0; i < active.length; i++) {
        const slot = active[i]!;
        if (reg.roleOf(slot) !== role) continue;
        const dead = !reg.isAlive(slot);
        cmd.replyToChat(
          phraseFor(cmd.callerSlot,"ROLE_LIST_ENTRY",roleNameFor(cmd.callerSlot,role),reg.nameOf(slot),dead ? tr(cmd.callerSlot,"LABEL_DEAD") : ""),
        );
        shown++;
      }
    }
    if (shown === 0) cmd.replyToChat(msgFor(cmd.callerSlot, "GAME_LOGS_NONE"));
  });

  /**
   * `sm_ttt_myrole <role>` — reserve your own role for the next assignment. ROOT only.
   *
   * Deliberately separate from `sm_ttt_setrole`, which rewrites someone's role in a LIVE round: this
   * one takes effect at the next deal, so the player goes through normal assignment and gets the
   * icons, uniform, glow and loadout that come with it. It also consumes a slot of that role's quota
   * rather than adding one, so the round's ratios stay honest.
   *
   * ROOT rather than GENERIC because choosing to be a Traitor is not moderation — it decides the
   * round for everyone in it.
   */
  /**
   * `sm_ttt_testkill <victim> [killer]` — kill someone and credit a Traitor for it. ROOT only.
   *
   * A testing aid for everything that keys off WHO killed WHOM: the DNA scanner, the corpse's killer
   * record, karma, the kill feed. Producing that state by hand otherwise means two people, two roles
   * and a real firefight.
   *
   * `killer` defaults to a living Traitor, since that is the case worth testing. It goes through
   * `markGadgetKill`, the same attribution path the tripwire and cluster fragments use, so the corpse
   * records a real killer rather than the suicide a bare health write would produce.
   */
  /**
   * `sm_ttt_credits <target> <amount>` — set someone's shop balance outright. ROOT only.
   *
   * A testing aid: role-gated items cost enough that trying one repeatedly means playing several
   * rounds to afford it. Goes through `addBalance` with the delta rather than writing the balance
   * directly, so the `balance` bus event still fires and anything listening stays consistent.
   */
  command.admin("sm_ttt_credits", ADMFLAG.ROOT, (cmd) => {
    if (cmd.arg(0) === "" || cmd.arg(1) === "") {
      cmd.reply(phraseFor(cmd.callerSlot, "CHAT_USAGE_SM_TTT_CREDITS_TARGET_AMOUNT"));
      return;
    }
    const slot = resolveTarget(cmd.arg(0));
    if (slot < 0) {
      cmd.reply(msgFor(cmd.callerSlot, "CMD_NO_PLAYER_MATCH", cmd.arg(0)));
      return;
    }
    const want = Number.parseInt(cmd.arg(1), 10);
    if (!Number.isFinite(want) || want < 0) {
      cmd.reply(phraseFor(cmd.callerSlot, "CHAT_IS_NOT_A_CREDIT_AMOUNT", cmd.arg(1)));
      return;
    }
    addBalance(slot, want - balanceOf(slot), "Admin", false);
    cmd.reply(phraseFor(cmd.callerSlot, "CHAT_NOW_HAS_CREDITS", reg.nameOf(slot), String(balanceOf(slot))));
  });

  command.admin("sm_ttt_testkill", ADMFLAG.ROOT, (cmd) => {
    if (cmd.arg(0) === "") {
      cmd.reply(phraseFor(cmd.callerSlot, "CHAT_USAGE_SM_TTT_TESTKILL_VICTIM_KILLER_KILLER_DEFAULTS_TO_A_LIVE_TRA"));
      return;
    }
    const victim = resolveTarget(cmd.arg(0));
    if (victim < 0) {
      cmd.reply(msgFor(cmd.callerSlot, "CMD_NO_PLAYER_MATCH", cmd.arg(0)));
      return;
    }
    if (!reg.isAlive(victim)) {
      cmd.reply(phraseFor(cmd.callerSlot, "CHAT_IS_ALREADY_DEAD", reg.nameOf(victim)));
      return;
    }

    let killer = -1;
    if (cmd.arg(1) !== "") {
      killer = resolveTarget(cmd.arg(1));
      if (killer < 0) {
        cmd.reply(msgFor(cmd.callerSlot, "CMD_NO_PLAYER_MATCH", cmd.arg(1)));
        return;
      }
    } else {
      const active = reg.activeSlots();
      for (let i = 0; i < active.length; i++) {
        const slot = active[i]!;
        if (slot !== victim && reg.isAlive(slot) && reg.roleOf(slot) === RoleId.Traitor) {
          killer = slot;
          break;
        }
      }
      if (killer < 0) {
        cmd.reply(phraseFor(cmd.callerSlot, "CHAT_NO_LIVING_TRAITOR_TO_CREDIT_PASS_ONE_EXPLICITLY_SM_TTT_TESTKILL_V"));
        return;
      }
    }
    if (killer === victim) {
      cmd.reply(phraseFor(cmd.callerSlot, "CHAT_KILLER_AND_VICTIM_MUST_DIFFER_OR_THE_CORPSE_RECORDS_A_SUICIDE_AND"));
      return;
    }

    killWithGadget(victim, killer, "[Test Kill]");
    cmd.reply(phraseFor(cmd.callerSlot, "CHAT_KILLED_CREDITED_TO", reg.nameOf(victim), reg.nameOf(killer), roleNameFor(cmd.callerSlot, reg.roleOf(killer))));
  });

  command.admin("sm_ttt_myrole", ADMFLAG.ROOT, (cmd) => {
    const me = cmd.callerSlot;
    if (me < 0) {
      cmd.reply(msgFor(me, "CMD_MYROLE_NO_SLOT"));
      return;
    }
    const want = cmd.arg(0).toLowerCase();
    const role =
      want === "traitor" ? RoleId.Traitor
      : want === "detective" ? RoleId.Detective
      : want === "innocent" ? RoleId.Innocent
      : want === "none" || want === "clear" ? RoleId.Spectator
      : RoleId.None;
    if (role === RoleId.None) {
      cmd.reply(msgFor(me, "CMD_MYROLE_USAGE"));
      return;
    }
    // `Spectator` is the sentinel for "cancel" here, not a role anyone can reserve.
    if (role === RoleId.Spectator) {
      reserveRole(me, RoleId.None);
      cmd.reply(msgFor(me, "CMD_MYROLE_CLEARED"));
      return;
    }
    reserveRole(me, role);
    cmd.reply(msgFor(me, "CMD_MYROLE_SET", roleNameFor(me, role)));
  });

  /*
   * `ttt_context [traitor|detective|innocent|clear]` — force a role's map context onto your own
   * pawn, the port of the C#'s `settarget` test command.
   *
   * It exists to separate two questions that otherwise fail identically. TTT-aware maps gate their
   * traitor-only doors on `filter_activator_context`, and if the context never reaches the pawn the
   * filter rejects EVERY activator — so a broken deal path and a map that never had the filter both
   * present as "the door does nothing for anybody". This applies the context with no role deal
   * involved: if the door then opens, the mechanism is sound and the fault is upstream in the deal;
   * if it still does nothing, the deal was never the problem.
   */
  command.admin("sm_ttt_context", ADMFLAG.ROOT, (cmd) => {
    const me = cmd.callerSlot;
    // A context is applied to a pawn, and the console does not have one.
    if (me < 0) {
      cmd.reply(msgFor(me, "GENERIC_PLAYER_ONLY"));
      return;
    }

    const want = cmd.arg(0).toLowerCase();
    if (want === "clear") {
      clearMapContexts(me);
      cmd.reply(phraseFor(cmd.callerSlot, "CHAT_CLEARED_TRAITOR_DETECTIVE_AND_INNOCENT_FROM_YOUR_PAWN"));
      return;
    }

    const role =
      want === "" || want === "traitor" ? RoleId.Traitor
      : want === "detective" ? RoleId.Detective
      : want === "innocent" ? RoleId.Innocent
      : RoleId.None;
    if (role === RoleId.None) {
      cmd.reply(msgFor(me, "GENERIC_USAGE", tr(me, "TEXT_TTT_CONTEXT_TRAITOR_DETECTIVE_INNOCENT_CLEAR")));
      return;
    }

    const applied = applyMapContext(me, role);
    cmd.reply(
      (applied === "" ? phraseFor(cmd.callerSlot, "CHAT_NO_LIVE_PAWN_TO_PUT_A_CONTEXT_ON") : phraseFor(cmd.callerSlot, "CHAT_APPLIED_1_TO_YOUR_PAWN_REPLACING_ANY_ROLE_CONTEXT_ALREADY_ON_IT", applied)),
    );
  });

  // ROOT, not GENERIC: this writes the registry DIRECTLY and never emits `roleAssigned`, so it hands
  // out a role that exists only in the bookkeeping — no map context, no icon or glow, no uniform, no
  // loadout, no team switch. That is useful for exercising karma and the win checks, and actively
  // misleading for anything else, which is not a footgun to leave on a generic admin flag. Use
  // `ttt_context` to test map integrations and `ttt_myrole` to reserve a real role for the next deal.
  command.admin("sm_ttt_setrole", ADMFLAG.ROOT, (cmd) => {
    const slot = cmd.argInt(0, -1);
    const roleName_ = cmd.arg(1).toLowerCase();
    const role =
      roleName_ === "traitor" ? RoleId.Traitor
      : roleName_ === "detective" ? RoleId.Detective
      : roleName_ === "innocent" ? RoleId.Innocent
      : RoleId.None;
    if (slot < 0 || !reg.isConnected(slot) || role === RoleId.None) {
      cmd.reply(msgFor(cmd.callerSlot, "GENERIC_USAGE", tr(cmd.callerSlot, "TEXT_TTT_SETROLE_SLOT_INNOCENT_TRAITOR_DETECTIVE")));
      return;
    }
    reg.setRole(slot, role);
    cmd.reply(msgFor(cmd.callerSlot, "CMD_ROLE_SET", slot, roleNameFor(cmd.callerSlot, role)));
  });
}

/** Is this caller an admin? The server console (slot < 0) always is. */
function isAdmin(slot: number): boolean {
  if (slot < 0) return true;
  return Admin.forSlot(slot)?.hasFlags(ADMFLAG.GENERIC) === true;
}

/**
 * Resolve an admin command target: a slot number, an exact name, or a unique partial name.
 * Returns -1 when nothing (or more than one thing) matches.
 */
function resolveTarget(query: string): number {
  if (query === "") return -1;

  const asSlot = parseInt(query, 10);
  if (String(asSlot) === query && reg.isConnected(asSlot)) return asSlot;

  const active = reg.activeSlots();
  const lower = query.toLowerCase();
  for (let i = 0; i < active.length; i++) {
    if (reg.nameOf(active[i]!).toLowerCase() === lower) return active[i]!;
  }
  let found = -1;
  for (let i = 0; i < active.length; i++) {
    if (reg.nameOf(active[i]!).toLowerCase().includes(lower)) {
      if (found >= 0) return -1; // ambiguous
      found = active[i]!;
    }
  }
  return found;
}

/** Find an item by list index, exact name, partial name, then description. */
function findItem(slot: number, query: string): ShopItem | undefined {
  const items = sortedFor(slot, listBuffer);

  const index = parseInt(query, 10);
  if (Number.isFinite(index) && String(index) === query) {
    return index >= 1 && index <= items.length ? items[index - 1] : undefined;
  }

  const byId = itemById(query.toLowerCase());
  if (byId !== undefined) return byId;

  const lower = query.toLowerCase();
  for (let i = 0; i < items.length; i++) {
    if (msg(items[i]!.nameKey).toLowerCase() === lower) return items[i];
  }
  for (let i = 0; i < items.length; i++) {
    if (msg(items[i]!.nameKey).toLowerCase().includes(lower)) return items[i];
  }
  for (let i = 0; i < items.length; i++) {
    if (msg(items[i]!.descKey).toLowerCase().includes(lower)) return items[i];
  }
  return undefined;
}

/** Format one shop listing line, matching the original's colour scheme. */
function formatItem(item: ShopItem, index: number, affordable: boolean, slot = -1): string {
  const name = tr(slot, item.nameKey);
  return affordable ? phraseFor(slot,"SHOP_LIST_ITEM",index,item.price,name) : phraseFor(slot,"SHOP_LIST_UNAFFORDABLE",item.price,name);
}
