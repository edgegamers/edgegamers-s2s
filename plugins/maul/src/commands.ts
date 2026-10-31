// src/commands.ts — MAUL admin commands.
//
// Output follows SourceMod's console-table convention (basecommands/who.sp): the wide report goes
// to the caller's console with fixed column widths, and a chat caller is told to look there.

import { plainPhraseFor, replyPhrase } from "./phrases.ts";
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
function groupsOf(info: PlayerLookup, slot: number): string {
  const groups = info.groups;
  if (groups.length === 0) return plainPhraseFor(slot, "MAUL_NONE");
  return groups.map((g) => `${String(g.rank)}${g.name ? ":" + g.name : ""}`).join(", ");
}

function dsOf(info: PlayerLookup, slot: number): string {
  const ds = info.ds;
  if (ds?.ds !== true) return plainPhraseFor(slot, "MAUL_NO");
  const tier = ds.tier ?? 0;
  return plainPhraseFor(slot, "MAUL_DS_TIER", tier, ds.tierName ? " " + ds.tierName : "");
}

/** Register the MAUL admin commands. Load window only — call from OnPluginStart. */
export function registerCommands(deps: CommandDeps): void {
  const { auth, api, log, getConfig, getRankTable, reloadConfig } = deps;

  // sm_maul_info [target] — the cached MAUL profile and the grant derived from it.
  command.admin("sm_maul_info", ADMFLAG.GENERIC, (cmd): HookResultValue => {
    const t = (key: string, ...args: (string | number)[]) => plainPhraseFor(cmd.callerSlot, "MAUL_" + key, ...args);
    const targets = resolve(cmd.arg(0), cmd.callerSlot);
    if (targets.length === 0) { replyPhrase(cmd, "MAUL_NO_MATCH"); return HookResult.Handled; }

    cmd.replyToConsole(t("INFO_HEADING"));
    cmd.replyToConsole(
      "    " + pad(t("COLUMN_NAME"), 24, 23) + " " + pad(t("COLUMN_MAUL_NAME"), 18, 17) + " " +
      pad(t("COLUMN_DIVISION"), 6, 5) + " " + pad(t("COLUMN_RANK"), 5, 4) + " " + pad(t("COLUMN_IMMUNITY"), 4, 3) + " " + t("COLUMN_GROUPS"),
    );

    for (const p of targets) {
      const info = auth.profileOf(p.steamId);
      if (info === null) {
        cmd.replyToConsole(
          String(p.slot + 1).padStart(2) + ". " + pad(p.playerName ?? "", 24, 23) +
          t("NO_LOOKUP"),
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
        (grant && grant.groupNames.length > 0 ? grant.groupNames.join(",") : t("NONE")),
      );
    }

    // A single target gets the long form too — the table alone hides DS and verification.
    if (targets.length === 1) {
      const p = targets[0]!;
      const info = auth.profileOf(p.steamId);
      if (info !== null) {
        const grant = auth.grantOf(p.steamId);
        cmd.replyToConsole("");
        cmd.replyToConsole(t("STEAM_ID", p.steamId));
        cmd.replyToConsole(t("USER_ID", info.userId));
        cmd.replyToConsole(t("DIVISION", info.divisionTag));
        cmd.replyToConsole(t("PRIMARY", info.primaryRank));
        cmd.replyToConsole(t("GROUPS", groupsOf(info, cmd.callerSlot)));
        cmd.replyToConsole(t("DEDICATED", dsOf(info, cmd.callerSlot)));
        cmd.replyToConsole(t("VERIFIED", t(info.verified ? "YES" : "NO")));
        cmd.replyToConsole(t("ADMIN_FLAGS", (grant?.flags ?? 0).toString(16), grant?.immunity ?? 0));
        if (grant && grant.missingGroups.length > 0) {
          cmd.replyToConsole(t("MISSING_GROUPS", grant.missingGroups.join(", ")));
        }
      }
    }

    if (cmd.replySource === "chat") replyPhrase(cmd, "MAUL_SEE_CONSOLE");
    return HookResult.Handled;
  });

  // sm_maul_refresh [target] — force a fresh lookup and re-apply.
  command.admin("sm_maul_refresh", ADMFLAG.BAN, (cmd): HookResultValue => {
    const targets = resolve(cmd.arg(0), cmd.callerSlot);
    if (targets.length === 0) { replyPhrase(cmd, "MAUL_NO_MATCH"); return HookResult.Handled; }

    for (const p of targets) {
      auth.invalidate(p.steamId);
      void auth.verify(p.slot, p.steamId, false);
    }

    log.info(`sm_maul_refresh by slot ${String(cmd.callerSlot)} for ${String(targets.length)} player(s)`);
    replyPhrase(cmd, "MAUL_REVERIFY", targets.length);
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
    replyPhrase(cmd, "MAUL_RELOADED", ranks, players.length);
    return HookResult.Handled;
  });

  // sm_maul_status — plugin/API health, for "is MAUL even reachable?"
  command.admin("sm_maul_status", ADMFLAG.GENERIC, (cmd): HookResultValue => {
    const t = (key: string, ...args: (string | number)[]) => plainPhraseFor(cmd.callerSlot, "MAUL_" + key, ...args);
    const cfg = getConfig();

    cmd.replyToConsole(t("STATUS_HEADING"));
    cmd.replyToConsole(t("BACKEND_LABEL") + api.describe());
    cmd.replyToConsole(t("API_KEY", cfg.maulKey.length > 0 ? t("KEY_SET", cfg.maulKey.length) : t("KEY_MISSING")));
    cmd.replyToConsole(t("READY", api.isReady() ? t("YES") : t("NOT_READY")));
    cmd.replyToConsole(t("RANKS", Object.keys(getRankTable().ranks).length));
    cmd.replyToConsole(t("OPTIONS", t(cfg.eventserver ? "YES" : "NO"), t(cfg.autotag ? "YES" : "NO"), t(cfg.debug ? "YES" : "NO")));

    const players = Player.allConnected().filter((p) => p.steamId !== "0");
    const verified = players.filter((p) => auth.isVerified(p.steamId)).length;
    cmd.replyToConsole(t("PLAYERS", verified, players.length));

    if (cmd.replySource === "chat") replyPhrase(cmd, "MAUL_SEE_CONSOLE");
    return HookResult.Handled;
  });
}
