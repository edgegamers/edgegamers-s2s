import { Player } from "@s2script/cs2";
import { ADMFLAG } from "@s2script/sdk/admin";
import type { PluginContext } from "@s2script/sdk/plugin";
import type { Authenticator } from "./auth.ts";
import type { BanRoutingStatus } from "./bans.ts";
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
  getBanRoutingStatus: () => BanRoutingStatus;
  isPresenceActive: () => boolean;
  reloadConfig: () => void;
}

function pad(text: string, width: number, maxLen: number): string {
  const clipped = text.length > maxLen ? text.slice(0, Math.max(0, maxLen - 1)) + "." : text;
  return clipped + " ".repeat(Math.max(0, width - clipped.length));
}

function resolve(pattern: string, callerSlot: number): Player[] {
  const query = pattern.trim();
  if (query.length === 0) return callerSlot < 0 ? [] : Player.target("@me", callerSlot);
  return Player.target(query, callerSlot);
}

function groupsOf(info: PlayerLookup): string {
  return info.groups.map((group) => `${group.rank}${group.name === undefined ? "" : `:${group.name}`}`).join(", ") || "none";
}

function dsOf(info: PlayerLookup): string {
  if (info.ds === undefined || info.ds.ds !== true) return "no";
  const tier = info.ds.tierName ?? (info.ds.tier === null || info.ds.tier === undefined ? "" : `tier ${info.ds.tier}`);
  return tier.length === 0 ? "yes" : `yes (${tier})`;
}

function targetPattern(cmd: { argCount: number; arg(index: number): string; callerSlot: number }): string {
  return cmd.argCount === 0 && cmd.callerSlot >= 0 ? "@me" : cmd.arg(0);
}

function playerName(player: Player): string {
  return player.playerName ?? "(unnamed)";
}

export function registerCommands(ctx: Pick<PluginContext, "commands">, deps: CommandDeps): void {
  ctx.commands.registerAdmin("sm_maul_info", ADMFLAG.GENERIC, (cmd) => {
    const pattern = targetPattern(cmd);
    const targets = resolve(pattern, cmd.callerSlot);
    if (targets.length === 0) {
      cmd.replyToConsole(`[maul] no connected player matching "${pattern}"`);
      return;
    }

    cmd.replyToConsole("[maul] cached player profiles:");
    for (const target of targets) {
      const info = deps.auth.profileOf(target.steamId);
      if (info === null) {
        cmd.replyToConsole(`  ${pad(playerName(target), 24, 24)} ${target.steamId} not verified`);
        continue;
      }

      const ban = info.ban.active
        ? `${info.ban.minutes <= 0 ? "permanent" : `${info.ban.minutes}m`} ${info.ban.reason}`.trim()
        : "none";
      cmd.replyToConsole(
        `  ${pad(playerName(target), 24, 24)} ${target.steamId} user=${info.userId} rank=${info.primaryRank} verified=${info.verified ? "yes" : "no"}`,
      );
      cmd.replyToConsole(`    name=${info.name || "(unknown)"} division=${info.divisionTag || "none"} ds=${dsOf(info)} ban=${ban}`);
      cmd.replyToConsole(`    groups=${groupsOf(info)}`);
    }
  });

  ctx.commands.registerAdmin("sm_maul_refresh", ADMFLAG.GENERIC, (cmd) => {
    const pattern = targetPattern(cmd);
    const targets = resolve(pattern, cmd.callerSlot);
    if (targets.length === 0) {
      cmd.replyToConsole(`[maul] no connected player matching "${pattern}"`);
      return;
    }

    for (const target of targets) {
      if (target.steamId === "0") {
        cmd.replyToConsole(`[maul] skipped ${playerName(target)}: no SteamID`);
        continue;
      }
      deps.auth.invalidate(target.steamId);
      void deps.auth.verify(target.slot, target.steamId, false);
      cmd.replyToConsole(`[maul] refreshing ${playerName(target)} (${target.steamId})`);
    }
  });

  ctx.commands.registerAdmin("sm_maul_reload", ADMFLAG.CONFIG, (cmd) => {
    deps.reloadConfig();
    cmd.replyToConsole("[maul] config reloaded");
  });

  ctx.commands.registerAdmin("sm_maul_status", ADMFLAG.GENERIC, (cmd) => {
    const cfg = deps.getConfig();
    const rankCount = Object.keys(deps.getRankTable().ranks).length;
    const banStatus = deps.getBanRoutingStatus();
    const presenceLine = cfg.apiVersion !== "v2"
      ? "unavailable under v1"
      : deps.isPresenceActive()
        ? "active"
        : cfg.presence
          ? "enabled but disconnected"
          : "disabled";

    cmd.replyToConsole("[maul] status:");
    cmd.replyToConsole(`  Backend    : ${deps.api.describe()}`);
    cmd.replyToConsole(`  API        : ${deps.api.version} (${deps.api.isReady() ? "ready" : "not ready"})`);
    cmd.replyToConsole(`  Endpoint   : ${cfg.maulUrl.length === 0 ? "unset" : cfg.maulUrl}`);
    cmd.replyToConsole(`  Ranks      : ${rankCount}`);
    cmd.replyToConsole(`  Ban route  : ${banStatus.available ? "MAUL" : "local"} (${banStatus.reason})`);
    cmd.replyToConsole(`  Presence   : ${presenceLine}`);
  });
}
