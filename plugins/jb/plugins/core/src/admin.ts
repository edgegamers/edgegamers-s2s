import { phrase } from "./messages.ts";
import { reply as replyMessage } from "@edgegamers/jailbreak-shared";
/**
 * `sm_debug <subcommand>` (Jailbreak.Debug, root only) — the subcommands core owns:
 * markrebel, pardon, endround, settime, testnearopen, color. LR / last guard / ST / RTD debug
 * subcommands belong to their plugins.
 */
import { HookResult, Server } from "@s2script/sdk";
import type { CommandInvocation, HookResultValue } from "@s2script/sdk";
import { GameRules, Player } from "@s2script/cs2";
import { setPawnColor } from "@edgegamers/jailbreak-shared";
import { markRebel, unmarkRebel } from "./rebels";
import { openNearest, toPoint } from "./cells";
import { log, describe } from "./logs";
import { msg } from "./messages";

type Sub = (cmd: CommandInvocation) => void;

/** Resolve a SourceMod-style target (`@t`, `#12`, name) to players the caller may target. */
function targets(cmd: CommandInvocation, n: number): Player[] | null {
  const pattern = cmd.arg(n);
  const found = Player.target(pattern, cmd.callerSlot, true);
  if (found.length === 0) {
    replyMessage(cmd, msg.playerNotFound(pattern));
    return null;
  }
  return found;
}

function label(cmd: CommandInvocation, n: number, found: Player[]): string {
  return found.length === 1 ? (found[0].playerName ?? "unknown") : cmd.arg(n);
}

const subs: Record<string, Sub> = {
  // css_debug markrebel <target> [seconds]
  markrebel(cmd) {
    if (cmd.argCount < 2) return replyMessage(cmd, phrase("jailbreak.core.debug_rebel_target_required"));
    const found = targets(cmd, 1);
    if (!found) return;
    let duration = -1;
    if (cmd.argCount >= 3) {
      duration = Number.parseInt(cmd.arg(2), 10);
      if (!Number.isFinite(duration)) return replyMessage(cmd, phrase("jailbreak.core.debug_rebel_duration_invalid"));
    }
    for (const p of found) markRebel(p.slot, duration, "admin");
    replyMessage(cmd, phrase("jailbreak.core.debug_rebel_marked", label(cmd, 1, found), duration));
  },

  // css_debug pardon <target>
  pardon(cmd) {
    if (cmd.argCount < 2) return replyMessage(cmd, phrase("jailbreak.core.debug_pardon_target_required"));
    const found = targets(cmd, 1);
    if (!found) return;
    for (const p of found) unmarkRebel(p.slot, "admin");
    replyMessage(cmd, phrase("jailbreak.core.debug_pardoned", label(cmd, 1, found)));
  },

  // css_debug endround
  endround(cmd) {
    Server.command("mp_ignore_round_win_conditions 0");
    const ok = GameRules.get()?.setTimeRemaining(0) ?? false;
    log(`An admin ended the round.`);
    replyMessage(cmd, ok ? phrase("jailbreak.core.debug_round_ended") : phrase("jailbreak.core.debug_round_rules_unavailable"));
  },

  // css_debug settime <seconds>
  settime(cmd) {
    if (cmd.argCount !== 2) return replyMessage(cmd, phrase("jailbreak.core.debug_time_required"));
    const time = Number.parseInt(cmd.arg(1), 10);
    if (!Number.isFinite(time)) return replyMessage(cmd, phrase("jailbreak.core.debug_time_invalid"));
    const ok = GameRules.get()?.setTimeRemaining(time) ?? false;
    replyMessage(cmd, ok ? phrase("jailbreak.core.debug_time_set", time) : phrase("jailbreak.core.debug_time_rules_unavailable"));
  },

  // css_debug testnearopen
  testnearopen(cmd) {
    const origin = Player.fromSlot(cmd.callerSlot)?.pawn?.origin;
    if (!origin) return replyMessage(cmd, phrase("jailbreak.core.debug_alive_required"));
    const ok = openNearest(toPoint(origin));
    if (ok) log(`${describe(cmd.callerSlot)} test-opened the nearest button.`);
    replyMessage(cmd, phrase("jailbreak.core.debug_cells_attempted"));
  },

  // css_debug color [<alpha> | [alpha] <red> <green> <blue>]
  color(cmd) {
    const pawn = Player.fromSlot(cmd.callerSlot)?.pawn;
    if (cmd.argCount < 2 || !pawn) return replyMessage(cmd, phrase("jailbreak.core.debug_color_usage"));
    const nums = cmd.args.slice(1).map((a) => Number.parseInt(a, 10));
    if (nums.some((v) => !Number.isFinite(v))) return replyMessage(cmd, phrase("jailbreak.core.debug_color_number_invalid"));
    let [a, r, g, b] = [255, 255, 255, 255];
    if (nums.length === 1) a = nums[0];
    else if (nums.length === 3) [r, g, b] = nums;
    else if (nums.length === 4) [a, r, g, b] = nums;
    else return replyMessage(cmd, phrase("jailbreak.core.debug_color_argument_count_invalid"));
    setPawnColor(pawn, { r, g, b }, a);
    replyMessage(cmd, phrase("jailbreak.core.debug_color_set", a, r, g, b));
  },
};

export function debugCommand(cmd: CommandInvocation): HookResultValue {
  const name = cmd.arg(0).toLowerCase();
  if (name === "") {
    for (const key of Object.keys(subs)) replyMessage(cmd, key);
    return HookResult.Handled;
  }
  const sub = subs[name];
  if (!sub) {
    replyMessage(cmd, phrase("jailbreak.core.debug_subcommand_invalid"));
    return HookResult.Handled;
  }
  sub(cmd);
  return HookResult.Handled;
}
