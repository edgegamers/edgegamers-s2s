// src/commands.ts — MAUL admin commands.
//
// Output follows SourceMod's console-table convention (basecommands/who.sp): the wide report goes
// to the caller's console with fixed column widths, and a chat caller is told to look there.

import { ADMFLAG } from "@s2script/sdk/admin";
import { Player } from "@s2script/cs2";
import { command } from "@s2script/sdk/commands";
import { HookResult } from "@s2script/sdk/events";
import type { HookResultValue } from "@s2script/sdk/events";
import type { Authenticator } from "./auth.ts";
import type { MaulBackend, PlayerLookup } from "./backend.ts";
import type { MaulConfig } from "./config.ts";
import type { Logger } from "./log.ts";
import type { RankTable } from "./types.ts";

export interface CommandDeps {
  auth: Authenticator;
  api: MaulBackend;
  log: Logger;
  getConfig: () => MaulConfig;
  getRankTable: () => RankTable;
  reloadConfig: () => void;
}

/** printf `%-<width>.<maxLen>s`: truncate, then left-align. */
function pad(text: string, width: number, maxLen: number): string {
  return text.slice(0, maxLen).padEnd(width);
}

/** Resolve an SM target string, or every connected non-bot when the pattern is empty. */
function resolve(pattern: string, callerSlot: number): Player[] {
  if (pattern.length === 0) return Player.allConnected().filter((p) => p.steamId !== "0");
  return Player.target(pattern, callerSlot);
}

/** `groups` from the info body, rendered as "rank:name" pairs. */
function groupsOf(info: PlayerLookup): string {
  const groups = info.groups;
  if (groups.length === 0) return "none";
  return groups.map((g) => `${String(g.rank)}${g.name ? ":" + g.name : ""}`).join(", ");
}

function dsOf(info: PlayerLookup): string {
  const ds = info.ds;
  if (ds?.ds !== true) return "no";
  const tier = ds.tier ?? 0;
  return `yes (tier ${String(tier)}${ds.tierName ? " " + ds.tierName : ""})`;
}

/** Register the MAUL admin commands. Load window only — call from OnPluginStart. */
export function registerCommands(deps: CommandDeps): void {
  const { auth, api, log, getConfig, getRankTable, reloadConfig } = deps;

  // sm_maul_info [target] — the cached MAUL profile and the grant derived from it.
  command.admin("sm_maul_info", ADMFLAG.GENERIC, (cmd): HookResultValue => {
    const targets = resolve(cmd.arg(0), cmd.callerSlot);
    if (targets.length === 0) { cmd.reply("[MAUL] No matching client was found."); return HookResult.Handled; }

    cmd.replyToConsole(
      "    " + pad("Name", 24, 23) + " " + pad("MAUL name", 18, 17) + " " +
      pad("Div", 6, 5) + " " + pad("Rank", 5, 4) + " " + pad("Imm", 4, 3) + " Groups",
    );

    for (const p of targets) {
      const info = auth.profileOf(p.steamId);
      if (info === null) {
        cmd.replyToConsole(
          String(p.slot + 1).padStart(2) + ". " + pad(p.playerName ?? "", 24, 23) +
          " (no MAUL lookup on record — unverified or still in flight)",
        );
        continue;
      }

      const grant = auth.grantOf(p.steamId);
      cmd.replyToConsole(
        String(p.slot + 1).padStart(2) + ". " +
        pad(p.playerName ?? "", 24, 23) + " " +
        pad(info.name, 18, 17) + " " +
        pad(info.divisionTag, 6, 5) + " " +
        pad(String(info.primaryRank), 5, 4) + " " +
        pad(String(grant?.immunity ?? 0), 4, 3) + " " +
        (grant && grant.groupNames.length > 0 ? grant.groupNames.join(",") : "none"),
      );
    }

    // A single target gets the long form too — the table alone hides DS and verification.
    if (targets.length === 1) {
      const p = targets[0]!;
      const info = auth.profileOf(p.steamId);
      if (info !== null) {
        const grant = auth.grantOf(p.steamId);
        cmd.replyToConsole("");
        cmd.replyToConsole(`  SteamID64  : ${p.steamId}`);
        cmd.replyToConsole(`  MAUL userid: ${String(info.userId)}`);
        cmd.replyToConsole(`  Division   : ${info.divisionTag}`);
        cmd.replyToConsole(`  Primary    : rank ${String(info.primaryRank)}`);
        cmd.replyToConsole(`  MAUL groups: ${groupsOf(info)}`);
        cmd.replyToConsole(`  Dedicated  : ${dsOf(info)}`);
        cmd.replyToConsole(`  Verified   : ${String(info.verified)}`);
        cmd.replyToConsole(`  Admin flags: 0x${(grant?.flags ?? 0).toString(16)}  immunity ${String(grant?.immunity ?? 0)}`);
        if (grant && grant.missingGroups.length > 0) {
          cmd.replyToConsole(`  MISSING    : ${grant.missingGroups.join(", ")} (not in admin_groups.json)`);
        }
      }
    }

    if (cmd.replySource === "chat") cmd.reply("[MAUL] See console for output.");
    return HookResult.Handled;
  });

  // sm_maul_refresh [target] — force a fresh lookup and re-apply.
  command.admin("sm_maul_refresh", ADMFLAG.BAN, (cmd): HookResultValue => {
    const targets = resolve(cmd.arg(0), cmd.callerSlot);
    if (targets.length === 0) { cmd.reply("[MAUL] No matching client was found."); return HookResult.Handled; }

    for (const p of targets) {
      auth.invalidate(p.steamId);
      void auth.verify(p.slot, p.steamId, false);
    }

    log.info(`sm_maul_refresh by slot ${String(cmd.callerSlot)} for ${String(targets.length)} player(s)`);
    cmd.reply(`[MAUL] Re-verifying ${String(targets.length)} player(s).`);
    return HookResult.Handled;
  });

  // sm_maul_reload — re-read config + ranks table, then re-verify everyone.
  command.admin("sm_maul_reload", ADMFLAG.ROOT, (cmd): HookResultValue => {
    reloadConfig();

    const players = Player.allConnected().filter((p) => p.steamId !== "0");
    for (const p of players) {
      auth.invalidate(p.steamId);
      void auth.verify(p.slot, p.steamId, false);
    }

    const ranks = String(Object.keys(getRankTable().ranks).length);
    log.info(`sm_maul_reload by slot ${String(cmd.callerSlot)}`);
    cmd.reply(`[MAUL] Reloaded (${ranks} ranks); re-verifying ${String(players.length)} player(s).`);
    return HookResult.Handled;
  });

  // sm_maul_status — plugin/API health, for "is MAUL even reachable?"
  command.admin("sm_maul_status", ADMFLAG.GENERIC, (cmd): HookResultValue => {
    const cfg = getConfig();

    cmd.replyToConsole("[MAUL] status");
    cmd.replyToConsole(`  Backend    : ${api.describe()}`);
    cmd.replyToConsole(`  API key    : ${cfg.maulKey.length > 0 ? "set (" + String(cfg.maulKey.length) + " chars)" : "NOT SET — authentication disabled"}`);
    cmd.replyToConsole(`  Ready      : ${api.isReady() ? "yes" : "NO — see Backend above"}`);
    cmd.replyToConsole(`  Ranks      : ${String(Object.keys(getRankTable().ranks).length)} loaded`);
    cmd.replyToConsole(`  Eventserver: ${String(cfg.eventserver)}   Autotag: ${String(cfg.autotag)}   Debug: ${String(cfg.debug)}`);

    const players = Player.allConnected().filter((p) => p.steamId !== "0");
    const verified = players.filter((p) => auth.isVerified(p.steamId)).length;
    cmd.replyToConsole(`  Players    : ${String(verified)}/${String(players.length)} verified`);

    if (cmd.replySource === "chat") cmd.reply("[MAUL] See console for output.");
    return HookResult.Handled;
  });
}
