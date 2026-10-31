/**
 * Admin debug commands (C# `css_debug lr` / `css_debug lg`, Jailbreak.Debug). Core owns the other
 * debug subcommands; these two live here because they drive this plugin's state.
 *
 *   sm_lrdebug                          type menu → any living player
 *   sm_lrdebug enable|disable           force LR on/off
 *   sm_lrdebug <type>                   player menu (every living player)
 *   sm_lrdebug <type> <player>          you vs them (you are the prisoner if you are a T)
 *   sm_lrdebug <type> <prisoner> <guard>
 *   sm_lgdebug [guard]                  start last guard (default: the first living guard)
 */
import type { CommandInvocation } from "@s2script/sdk";
import { Player } from "@s2script/cs2";
import { isAlive, Team } from "@edgegamers/jailbreak-shared";
import type { LRType } from "../api";
import { parseLRType } from "./logic";
import { disableLR, enableLR, initiateLastRequest, isInLR } from "./manager";
import { showPlayerMenu, showTypeMenu } from "./menus";
import { msgFor } from "./messages";
import { startLastGuard } from "./lastguard";
import { chatTo } from "./lr-command";

const TITLE = "[Debug] Last Request";

function target(pattern: string, caller: number, reply: (m: string) => void): Player | null {
  const found = Player.target(pattern, caller, true);
  if (found.length === 0) {
    reply(msgFor(caller).playerNotFound(pattern));
    return null;
  }
  return found[0];
}

function run(caller: number, typeArg: string, fromArg: string, toArg: string, reply: (m: string) => void): void {
  const me = Player.fromSlot(caller);
  if (!me) return;

  if (typeArg === "") {
    showTypeMenu(caller, TITLE, () => true, (t) => run(caller, t, "", "", chatTo(caller)));
    return;
  }
  if (fromArg === "" && toArg === "") {
    switch (typeArg.toLowerCase()) {
      case "enable":
        reply(enableLR() ? msgFor(me.slot).debugEnabled : msgFor(me.slot).debugEnableRefused);
        return;
      case "disable":
        disableLR();
        reply(msgFor(me.slot).debugDisabled);
        return;
    }
  }

  const type: LRType | null = parseLRType(typeArg);
  if (type === null) return reply(msgFor(me.slot).invalid(typeArg));

  if (fromArg === "") {
    showPlayerMenu(caller, TITLE, true, isInLR, (t) => run(caller, type, `#${t.userId}`, "", chatTo(caller)));
    return;
  }

  const from = target(fromArg, caller, reply);
  if (!from) return;
  if (toArg === "") {
    // They aren't necessarily on different teams, but this is debug so that's OK (C#).
    if (me.teamNum === Team.Prisoner) initiateLastRequest(me, from, type);
    else initiateLastRequest(from, me, type);
    return;
  }
  const to = target(toArg, caller, reply);
  if (to) initiateLastRequest(from, to, type);
}

export function lrDebugCommand(cmd: CommandInvocation): void {
  if (cmd.callerSlot < 0) return cmd.reply(msgFor(cmd.callerSlot).debugUsage);
  run(cmd.callerSlot, cmd.arg(0), cmd.arg(1), cmd.arg(2), (m) => cmd.reply(m));
}

export function lgDebugCommand(cmd: CommandInvocation): void {
  let guard: Player | null = Player.all().find((p) => p.teamNum === Team.Guard && isAlive(p)) ?? null;
  if (cmd.argCount >= 1) guard = target(cmd.arg(0), cmd.callerSlot, (m) => cmd.reply(m));
  if (!guard) return;
  const name = guard.playerName ?? "?";
  cmd.reply(startLastGuard(guard) ? msgFor(cmd.callerSlot).debugLastGuard(name) : msgFor(cmd.callerSlot).debugLastGuardRefused(name));
}
