import { phrase } from "./messages.ts";
import { chatText, consoleText, type Text } from "@edgegamers/jailbreak-shared";
import { replyChat } from "@edgegamers/jailbreak-shared";
/**
 * `!lr [type] [guard]` (C# `LastRequestCommand`) and `!endrace` (C# `EndRaceCommand`).
 * With no arguments it opens the type menu, with a type the guard menu; menu picks re-run the
 * same checks, so nothing that changed in between slips through.
 */
import type { CommandInvocation } from "@s2script/sdk";
import { Clients } from "@s2script/sdk";
import { Player } from "@s2script/cs2";
import { isAlive, Team } from "@edgegamers/jailbreak-shared";
import type { LRType } from "../api";
import { isAvailable, meetsTier, requiredTier } from "./games";
import { lrName, parseLRType } from "./logic";
import { getActiveLR, initiateLastRequest, isBusy, isEnabled, isInLR } from "./manager";
import { showPlayerMenu, showTypeMenu, wouldHavePlayers } from "./menus";
import { guardName, msg } from "./messages";
import { isRebelling } from "./lr-rebel";

const TYPE_MENU_TITLE = "Last Request";
const PLAYER_MENU_TITLE = (type: LRType): string => `${lrName(type)} — choose a guard`;

/** Run the `!lr` flow for `slot`. `reply` goes to the player's chat. */
export function lastRequest(slot: number, typeArg: string, targetArg: string, reply: (m: Text) => void): void {
  const me = Player.fromSlot(slot);
  if (!me) return;
  if (!isEnabled()) return reply(msg.notEnabled());
  if (me.teamNum !== Team.Prisoner) return reply(msg.cannotLR(phrase("jailbreak.lastrequest.caller_not_prisoner")));
  if (!isAlive(me)) return reply(msg.cannotLR(phrase("jailbreak.lastrequest.caller_not_alive")));
  if (!wouldHavePlayers()) return reply(msg.cannotLR(phrase("jailbreak.lastrequest.no_opponents_available")));
  if (isBusy(slot) || isRebelling(slot)) return reply(msg.cannotLR(phrase("jailbreak.lastrequest.caller_already_in_lr")));

  if (typeArg === "") {
    showTypeMenu(
      slot,
      TYPE_MENU_TITLE,
      isAvailable,
      (type) => lastRequest(slot, type, "", chatTo(slot)),
      (type) => (meetsTier(type, slot) ? null : `Tier ${String(requiredTier(type))}+`),
    );
    return;
  }

  const type = parseLRType(typeArg);
  if (type === null) return reply(msg.invalid(typeArg));
  if (!isAvailable(type)) return reply(msg.unavailable(type));
  if (!meetsTier(type, slot)) return reply(msg.needsTier(type, requiredTier(type)));

  if (targetArg === "") {
    showPlayerMenu(slot, PLAYER_MENU_TITLE(type), false, isInLR, (target) =>
      lastRequest(slot, type, `#${target.userId}`, chatTo(slot)),
    );
    return;
  }

  const targets = Player.target(targetArg, slot, false);
  if (targets.length === 0) return reply(msg.playerNotFound(targetArg));
  if (targets.length > 1) return reply(msg.playerFoundMultiple(targetArg));
  const guard = targets[0];
  const name = guardName(guard.playerName ?? "?");
  if (guard.teamNum !== Team.Guard) return reply(msg.cannotLRWith(name, phrase("jailbreak.lastrequest.target_not_guard")));
  if (!isAlive(guard)) return reply(msg.cannotLRWith(name, phrase("jailbreak.lastrequest.target_not_alive")));
  if (isBusy(guard.slot)) return reply(msg.cannotLRWith(name, phrase("jailbreak.lastrequest.target_already_in_lr")));

  if (!initiateLastRequest(me, guard, type)) reply(msg.initFailed());
}

export function lrCommand(cmd: CommandInvocation): void {
  if (cmd.callerSlot < 0) return;
  lastRequest(cmd.callerSlot, cmd.arg(0), cmd.arg(1), (m) => replyChat(cmd, m));
}

/** Open the `!lr` menu for a prisoner as LR turns on (no complaints if they can't). */
export function openLRFor(slot: number): void {
  lastRequest(slot, "", "", () => {});
}

/** `!endrace`: the prisoner fixes the race finish line. */
export function endRaceCommand(cmd: CommandInvocation): void {
  const slot = cmd.callerSlot;
  if (slot < 0) return;
  const lr = getActiveLR(slot);
  if (!lr || lr.type !== "race") return replyChat(cmd, msg.notInRace());
  if (lr.state !== "pending") return replyChat(cmd, msg.notPending());
  lr.execute();
}

/** Chat a player by slot (used for menu-driven flows outside a command). */
export function chatTo(slot: number): (m: Text) => void {
  return (m) => Clients.fromSlot(slot)?.chat(chatText(m, slot));
}
