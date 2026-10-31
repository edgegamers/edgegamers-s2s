import {plainPhraseFor as labelFor,phraseFor} from '@edgegamers/jailbreak-shared';
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
import { isAvailable } from "./games";
import { lrName, parseLRType } from "./logic";
import { getActiveLR, initiateLastRequest, isBusy, isEnabled, isInLR } from "./manager";
import { showPlayerMenu, showTypeMenu, wouldHavePlayers } from "./menus";
import { guardName, msgFor } from "./messages";
import { isRebelling } from "./lr-rebel";


/** Run the `!lr` flow for `slot`. `reply` goes to the player's chat. */
export function lastRequest(slot: number, typeArg: string, targetArg: string, reply: (m: string) => void): void {
  const me = Player.fromSlot(slot);
  if (!me) return;
  if (!isEnabled()) return reply(msgFor(slot).notEnabled());
  if (me.teamNum !== Team.Prisoner) return reply(msgFor(slot).cannotLR(labelFor(slot,"JB_LASTREQUEST_LABEL_YOU_ARE_NOT_A_PRISONER")));
  if (!isAlive(me)) return reply(msgFor(slot).cannotLR(labelFor(slot,"JB_LASTREQUEST_LABEL_YOU_ARE_NOT_ALIVE")));
  if (!wouldHavePlayers()) return reply(msgFor(slot).cannotLR(labelFor(slot,"JB_LASTREQUEST_LABEL_NO_PLAYERS_AVAILABLE_TO_LR")));
  if (isBusy(slot) || isRebelling(slot)) return reply(msgFor(slot).cannotLR(labelFor(slot,"JB_LASTREQUEST_LABEL_YOU_ARE_ALREADY_IN_AN_LR")));

  if (typeArg === "") {
    showTypeMenu(slot, msgFor(slot).typeMenuTitle, isAvailable, (type) => lastRequest(slot, type, "", chatTo(slot)));
    return;
  }

  const type = parseLRType(typeArg);
  if (type === null) return reply(msgFor(slot).invalid(typeArg));
  if (!isAvailable(type)) return reply(msgFor(slot).unavailable(type));

  if (targetArg === "") {
    showPlayerMenu(slot, msgFor(slot).playerMenuTitle(type), false, isInLR, (target) =>
      lastRequest(slot, type, `#${target.userId}`, chatTo(slot)),
    );
    return;
  }

  const targets = Player.target(targetArg, slot, false);
  if (targets.length === 0) return reply(msgFor(slot).playerNotFound(targetArg));
  if (targets.length > 1) return reply(msgFor(slot).playerFoundMultiple(targetArg));
  const guard = targets[0];
  const name = guardName(guard.playerName ?? "?");
  if (guard.teamNum !== Team.Guard) return reply(msgFor(slot).cannotLRWith(name, labelFor(slot,"JB_LASTREQUEST_LABEL_THEY_ARE_NOT_A_GUARD")));
  if (!isAlive(guard)) return reply(msgFor(slot).cannotLRWith(name, labelFor(slot,"JB_LASTREQUEST_LABEL_THEY_ARE_NOT_ALIVE")));
  if (isBusy(guard.slot)) return reply(msgFor(slot).cannotLRWith(name, labelFor(slot,"JB_LASTREQUEST_LABEL_THEY_ARE_ALREADY_IN_AN_LR")));

  if (!initiateLastRequest(me, guard, type)) reply(msgFor(slot).initFailed());
}

export function lrCommand(cmd: CommandInvocation): void {
  if (cmd.callerSlot < 0) return;
  lastRequest(cmd.callerSlot, cmd.arg(0), cmd.arg(1), (m) => cmd.replyToChat(m));
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
  if (!lr || lr.type !== "race") return cmd.replyToChat(msgFor(cmd.callerSlot).notInRace());
  if (lr.state !== "pending") return cmd.replyToChat(msgFor(cmd.callerSlot).notPending());
  lr.execute();
}

/** Chat a player by slot (used for menu-driven flows outside a command). */
export function chatTo(slot: number): (m: string) => void {
  return (m) => Clients.fromSlot(slot)?.chat(m);
}
