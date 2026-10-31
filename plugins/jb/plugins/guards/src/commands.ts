/** Every command (CTBans commands/*). */
import { command, HookResult, Server } from "@s2script/sdk";
import type { CommandInvocation, HookResultValue } from "@s2script/sdk";
import { Player } from "@s2script/cs2";
import { Team } from "@edgegamers/jailbreak-shared";
import { capDuration, effectiveDuration, isActive, isPermanent, isRevoked, minutesLeft, type Ban } from "./bans";
import { activeBan, issueBan, remind, unban } from "./ctbans";
import { settings } from "./config";
import { ctEmpty, isHuman, now } from "./env";
import { parseSteamId } from "./ids";
import { msg } from "./messages";
import { capOfSlot, effectiveOf, entry, rankOfSlot, rawPriority, setPriority } from "./players";
import { effectivePriority } from "./priority";
import { atLeast, maxBanSeconds } from "./ranks";
import { activeBansFromDb, banHistory, latestBan, storeReady } from "./store";
import { isLiveRound } from "./teams";
import { joinQueue, leaveQueue, markRestartUsed, queue } from "./queueing";

const H = HookResult.Handled;
const lastGuard = new Map<string, number>();

function requireEg(cmd: CommandInvocation): boolean {
  if (cmd.callerSlot < 0 || atLeast(rankOfSlot(cmd.callerSlot), "eg")) return true;
  cmd.reply(msg.noPermission("=(eG)=", "rank"));
  return false;
}

function single(cmd: CommandInvocation, n: number): Player | null {
  const found = Player.target(cmd.arg(n), cmd.callerSlot, true).filter((p) => isHuman(p.slot));
  if (found.length === 0) {
    cmd.reply(msg.playerNotFound(cmd.arg(n)));
    return null;
  }
  if (found.length > 1) {
    cmd.reply(msg.playerFoundMultiple(cmd.arg(n)));
    return null;
  }
  return found[0];
}

/**
 * A reply function safe to call after an await: it captures the caller (console, or slot + SteamID) now
 * and later only replies to console or to the same player still in that slot.
 */
function deferredReply(cmd: CommandInvocation): (line: string) => void {
  const slot = cmd.callerSlot;
  if (slot < 0) return (line) => cmd.reply(line);
  const steamId = Player.fromSlot(slot)?.steamId;
  return (line) => {
    if (steamId !== undefined && Player.fromSlot(slot)?.steamId === steamId) cmd.reply(line);
  };
}

/** Refuse to act on an online target whose cached ban/priority is not loaded yet. */
function targetLoaded(cmd: CommandInvocation, target: Player): boolean {
  if (entry(target.steamId)?.loaded) return true;
  cmd.reply(msg.targetNotLoaded(target.playerName ?? target.steamId));
  return false;
}

function issuerMax(cmd: CommandInvocation): number {
  const s = settings();
  return maxBanSeconds(cmd.callerSlot >= 0 ? rankOfSlot(cmd.callerSlot) : "root", cmd.callerSlot < 0, {
    maxMinutes: s.maxMinutes,
    managerMaxMinutes: s.managerMaxMinutes,
    allowDangerous: s.allowDangerous,
  });
}

function guard(cmd: CommandInvocation): HookResultValue {
  const slot = cmd.callerSlot;
  if (slot < 0) return cmd.reply(msg.playersOnly()), H;
  const p = Player.fromSlot(slot);
  if (!p || p.steamId === "0") return cmd.reply(msg.guardUnverified()), H;
  if (p.teamNum === Team.Guard) return cmd.reply(msg.guardAlreadyGuard()), H;
  const s = settings();
  const last = lastGuard.get(p.steamId) ?? 0;
  const wait = last + s.guardCooldown - now();
  if (wait > 0) return cmd.reply(msg.guardCooldown(wait)), H;
  lastGuard.set(p.steamId, now());

  const ban = activeBan(p.steamId);
  if (ban) return remind(slot, ban), H;
  if (!atLeast(rankOfSlot(slot), "eg")) {
    const e = entry(p.steamId);
    if (!e?.loaded) return cmd.reply(msg.guardPriorityUnavailable()), H;
    const prio = e.priority ?? 0;
    if (prio < s.minPriority) return cmd.reply(msg.guardInsufficient(prio, s.minPriority)), H;
  }
  const pos = queue.position(p.steamId);
  if (pos >= 0) return cmd.reply(msg.guardAlreadyQueued(pos + 1, queue.size())), H;

  joinQueue(slot);
  if (ctEmpty() && isLiveRound() && markRestartUsed(p.steamId)) Server.command(`mp_restartgame ${s.restartDelay}`);
  return H;
}

function leave(cmd: CommandInvocation): HookResultValue {
  if (cmd.callerSlot < 0) return cmd.reply(msg.playersOnly()), H;
  const p = Player.fromSlot(cmd.callerSlot);
  if (!p || !leaveQueue(p.steamId)) return cmd.reply(msg.leaveNotQueued()), H;
  cmd.reply(msg.leaveRemoved());
  return H;
}

function showQueue(cmd: CommandInvocation): HookResultValue {
  if (queue.size() === 0) return cmd.reply(msg.queueEmpty()), H;
  queue.ids().forEach((id, i) => {
    const p = Player.allConnected().find((x) => x.steamId === id);
    const cap = p ? capOfSlot(p.slot) : settings().normalCap;
    cmd.reply(msg.queueLine(i + 1, effectiveOf(id), cap, p?.playerName ?? id));
  });
  return H;
}

function priority(cmd: CommandInvocation): HookResultValue {
  const caller = cmd.callerSlot;
  const callerRank = caller >= 0 ? rankOfSlot(caller) : "root";
  const setting = cmd.argCount === 2 && atLeast(callerRank, "manager");
  let targets: Player[];
  if (cmd.argCount >= 1 && atLeast(callerRank, "eg")) {
    targets = Player.target(cmd.arg(0), caller, setting).filter((p) => isHuman(p.slot));
    if (targets.length === 0) return cmd.reply(msg.playerNotFound(cmd.arg(0))), H;
  } else if (caller < 0) {
    return cmd.reply(msg.usage("sm_priority <player> [priority]")), H;
  } else {
    const self = Player.fromSlot(caller);
    if (!self) return H;
    targets = [self];
  }
  if (setting) {
    if (!/^-?\d+$/.test(cmd.arg(1))) return cmd.reply(msg.invalidParam(cmd.arg(1), "number")), H;
    const value = Number.parseInt(cmd.arg(1), 10);
    for (const t of targets) setPriority(t.steamId, value);
    cmd.reply(msg.prioritySet(targets.length === 1 ? (targets[0].playerName ?? "") : cmd.arg(0), value));
    return H;
  }
  for (const t of targets) {
    const raw = rawPriority(t.steamId);
    const cap = capOfSlot(t.slot);
    cmd.reply(msg.priorityLine(t.playerName ?? "", effectivePriority(raw, cap), cap, raw ?? -1));
  }
  return H;
}

function ctban(cmd: CommandInvocation): HookResultValue {
  if (!requireEg(cmd)) return H;
  if (cmd.argCount < 3) return cmd.reply(msg.usage("sm_ctban <player> <time> <reason>")), H;
  const target = single(cmd, 0);
  if (!target || !targetLoaded(cmd, target)) return H;
  if (!/^\d+$/.test(cmd.arg(1))) return cmd.reply(msg.invalidParam(cmd.arg(1), "non-negative int")), H;
  const existing = activeBan(target.steamId);
  if (existing) {
    const name = target.playerName ?? target.steamId;
    return cmd.reply(isPermanent(existing) ? msg.ctbanAlreadyPermanent(name) : msg.ctbanAlready(name, minutesLeft(existing, now()))), H;
  }
  const capped = capDuration(Number.parseInt(cmd.arg(1), 10) * 60, issuerMax(cmd));
  if (capped.reduced) cmd.reply(msg.ctbanReduced(Math.floor(capped.seconds / 60)));
  leaveQueue(target.steamId);
  const r = issueBan({ steamId: target.steamId, name: target.playerName ?? target.steamId }, cmd.callerSlot, capped.seconds, cmd.argsFrom(2));
  if (!r.written && !storeReady()) cmd.reply(msg.savedLocally());
  return H;
}

function revoke(cmd: CommandInvocation): HookResultValue {
  if (!requireEg(cmd)) return H;
  if (cmd.argCount < 2) return cmd.reply(msg.usage("sm_revoke <player> <reason>")), H;
  const target = single(cmd, 0);
  if (!target || !targetLoaded(cmd, target)) return H;
  const existing = activeBan(target.steamId);
  if (existing) {
    const name = target.playerName ?? target.steamId;
    return cmd.reply(isPermanent(existing) ? msg.ctbanAlreadyPermanent(name) : msg.ctbanAlready(name, minutesLeft(existing, now()))), H;
  }
  leaveQueue(target.steamId);
  issueBan({ steamId: target.steamId, name: target.playerName ?? target.steamId }, cmd.callerSlot, settings().revokeMinutes * 60, cmd.argsFrom(1));
  return H;
}

function unctban(cmd: CommandInvocation): HookResultValue {
  if (!requireEg(cmd)) return H;
  if (cmd.argCount !== 1) return cmd.reply(msg.usage("sm_unctban <player|steamid>")), H;
  const online = Player.target(cmd.arg(0), cmd.callerSlot, false).filter((p) => isHuman(p.slot));
  if (online.length > 1) return cmd.reply(msg.playerFoundMultiple(cmd.arg(0))), H;
  const steamId = online[0]?.steamId ?? parseSteamId(cmd.arg(0));
  if (!steamId) return cmd.reply(msg.invalidParam(cmd.arg(0), "SteamID 3/64/CommunityID")), H;
  const name = online[0]?.playerName ?? steamId;
  const by = cmd.callerSlot >= 0 ? (Player.fromSlot(cmd.callerSlot)?.playerName ?? "Console") : "Console";
  const max = issuerMax(cmd);
  const reply = deferredReply(cmd);
  const finish = (ban: Ban | null): void => {
    if (!ban || !isActive(ban, now())) return reply(msg.unctbanNotBanned(name));
    if (max !== 0 && (ban.duration > max || ban.duration === 0)) {
      return reply(msg.unctbanTooLong(name, Math.floor(effectiveDuration(ban) / 60), Math.floor(max / 60)));
    }
    unban(ban, name, by);
  };
  const cached = online[0] ? activeBan(steamId) : null;
  if (cached) finish(cached);
  else latestBan(steamId).then(finish).catch(() => reply(msg.error("database unavailable")));
  return H;
}

function listBans(cmd: CommandInvocation): HookResultValue {
  if (!requireEg(cmd)) return H;
  const reply = deferredReply(cmd);
  const show = (bans: Ban[]): void => {
    const live = bans.filter((b) => isActive(b, now()));
    if (live.length === 0) return reply(msg.listNone());
    for (const b of live) {
      const name = Player.allConnected().find((p) => p.steamId === b.steamId)?.playerName ?? b.steamId;
      reply(isPermanent(b) ? msg.listLinePermanent(name, b.reason) : msg.listLine(name, minutesLeft(b, now()), b.reason));
    }
  };
  if (cmd.arg(0) === "1") {
    activeBansFromDb(now()).then(show).catch(() => reply(msg.error("database unavailable")));
  } else {
    show(Player.allConnected().map((p) => activeBan(p.steamId)).filter((b): b is Ban => b !== null));
  }
  return H;
}

function whenText(ts: number): string {
  const minutesAgo = Math.floor((now() - ts) / 60);
  if (minutesAgo > 1440) {
    const d = new Date(ts * 1000);
    const pad = (n: number): string => String(n).padStart(2, "0");
    return `on ${pad(d.getUTCMonth() + 1)}/${pad(d.getUTCDate())}/${d.getUTCFullYear()}`;
  }
  if (minutesAgo < 60) return `${minutesAgo} minute${minutesAgo === 1 ? "" : "s"} ago`;
  const h = Math.floor(minutesAgo / 60);
  return `${h} hour${h === 1 ? "" : "s"} ago`;
}

function stamp(): string {
  const d = new Date();
  const p = (n: number): string => String(n).padStart(2, "0");
  return `${p(d.getUTCMonth() + 1)}/${p(d.getUTCDate())}/${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
}

function history(cmd: CommandInvocation): HookResultValue {
  if (!requireEg(cmd)) return H;
  if (cmd.argCount !== 1) return cmd.reply(msg.usage("sm_ctbans <player>")), H;
  const online = Player.target(cmd.arg(0), cmd.callerSlot, false).filter((p) => isHuman(p.slot));
  if (online.length > 1) return cmd.reply(msg.playerFoundMultiple(cmd.arg(0))), H;
  const steamId = online[0]?.steamId ?? parseSteamId(cmd.arg(0));
  if (!steamId) return cmd.reply(msg.invalidParam(cmd.arg(0), "SteamID")), H;
  const name = online[0]?.playerName ?? steamId;
  const reply = deferredReply(cmd);
  banHistory(steamId)
    .then((bans) => {
      if (bans.length === 0) return reply(msg.historyNone(name));
      reply(msg.historyHeader(bans.length, name, stamp()));
      bans.forEach((b, i) => {
        const suffix = isRevoked(b) ? " (Revoked)"
          : isPermanent(b) ? ""
          : isActive(b, now()) ? ` (${minutesLeft(b, now())} minutes left)`
          : " (Expired)";
        reply(isPermanent(b)
          ? msg.historyLinePermanent(i + 1, whenText(b.timestamp), b.reason, suffix)
          : msg.historyLine(i + 1, Math.floor(effectiveDuration(b) / 60), whenText(b.timestamp), b.reason, suffix));
      });
    })
    .catch(() => reply(msg.error("database unavailable")));
  return H;
}

export function resetCommandState(): void {
  lastGuard.clear();
}

export function registerCommands(): void {
  for (const n of ["sm_guard", "sm_g"]) command(n, guard);
  for (const n of ["sm_leave", "sm_l"]) command(n, leave);
  command("sm_queue", showQueue);
  command("sm_priority", priority);
  command("sm_ctban", ctban);
  command("sm_revoke", revoke);
  command("sm_unctban", unctban);
  command("sm_lcb", listBans);
  for (const n of ["sm_ctbans", "sm_cthistory"]) command(n, history);
}
