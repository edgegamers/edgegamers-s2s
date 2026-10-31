/** CT ban lifecycle: issue, revoke, expiry timers, repeat penalty, broadcasts, forwards. */
import { after, Chat } from "@s2script/sdk";
import type { Timer } from "@s2script/sdk";
import { Player } from "@s2script/cs2";
import { Team } from "@edgegamers/jailbreak-shared";
import { isActive, isPermanent, minutesLeft, repeatPenalty, revokedDuration, secondsLeft, type Ban } from "./bans";
import { settings } from "./config";
import { broadcast, now, playerBySteam, playerRef, pub, toSteam } from "./env";
import { msgFor } from "./messages";
import { entry, rankOfSlot, setBanCached, setPriority } from "./players";
import { atLeast } from "./ranks";
import { banHistory, writeBan, writeBanDuration } from "./store";

const timers = new Map<string, Timer>();

/** The cached ban for an online player, if it still restricts them. */
export function activeBan(steamId: string): Ban | null {
  const b = entry(steamId)?.ban ?? null;
  return b && isActive(b, now()) ? b : null;
}

export function remind(slot: number, ban: Ban): void {
  Chat.toSlot(slot, isPermanent(ban) ? msgFor(slot).reminderPermanent(ban.reason) : msgFor(slot).reminder(minutesLeft(ban, now()), ban.reason));
}

export function clearExpiry(steamId: string): void {
  timers.get(steamId)?.kill();
  timers.delete(steamId);
}

const MAX_DELAY_MS = 2147483647;

/** Arm the expiry timer for a timed, active ban of an online (cached) player (permanent bans never expire). */
export function armExpiry(ban: Ban): void {
  clearExpiry(ban.steamId);
  if (!entry(ban.steamId)) return;
  if (!isActive(ban, now()) || isPermanent(ban)) return;
  const steamId = ban.steamId;
  const delay = Math.max(0, secondsLeft(ban, now())) * 1000 + 1000;
  if (delay > MAX_DELAY_MS) {
    timers.set(
      steamId,
      after(MAX_DELAY_MS, () => {
        timers.delete(steamId);
        if (isActive(ban, now())) armExpiry(ban);
      }),
    );
    return;
  }
  timers.set(
    steamId,
    after(delay, () => {
      timers.delete(steamId);
      const p = playerBySteam(steamId);
      if (p) broadcast(recipient => msgFor(recipient).expired(p.playerName ?? steamId));
      applyPenalty(steamId);
    }),
  );
}

function applyPenalty(steamId: string): void {
  const s = settings();
  banHistory(steamId)
    .then((hist) => {
      const pen = repeatPenalty(hist, now(), s.penaltyWindowHours, s.penaltyMinBans);
      if (!pen) return;
      const e = entry(steamId);
      if (!e || !e.loaded) {
        console.log(`guards: skipped repeat-ban penalty for ${steamId} (not loaded)`);
        return;
      }
      setPriority(steamId, (e.priority ?? 0) - pen.minutes);
      toSteam(steamId, recipient=>msgFor(recipient).penalty(pen.count, s.penaltyWindowHours, pen.minutes));
    })
    .catch(() => undefined);
}

/** Create a ban (already capped by the caller), apply it to the cache, persist, announce, fire OnCTBan. */
export function issueBan(
  target: { steamId: string; name: string },
  adminSlot: number,
  seconds: number,
  reason: string,
): { ban: Ban; written: boolean } {
  const admin = adminSlot >= 0 ? (Player.fromSlot(adminSlot)?.steamId ?? "0") : "0";
  const ban: Ban = { steamId: target.steamId, admin, reason, duration: seconds, timestamp: now() };
  setBanCached(target.steamId, ban);
  armExpiry(ban);
  const written = writeBan(ban);

  const p = playerBySteam(target.steamId);
  if (p && (seconds === 0 || seconds > settings().immediateMoveMinutes * 60) && p.teamNum !== Team.Prisoner) {
    p.changeTeam(Team.Prisoner);
  }
  const adminName = adminSlot >= 0 ? (Player.fromSlot(adminSlot)?.playerName ?? "Console") : "Console";
  const minutes = Math.floor(seconds / 60);
  for (const viewer of Player.allConnected()) {
    const isAdmin = atLeast(rankOfSlot(viewer.slot), "eg");
    const line = isPermanent(ban)
      ? isAdmin ? msgFor(viewer.slot).ctbanAdminPermanent(target.name, adminName, reason) : msgFor(viewer.slot).ctbanPublicPermanent(target.name, reason)
      : isAdmin ? msgFor(viewer.slot).ctbanAdmin(target.name, minutes, adminName, reason) : msgFor(viewer.slot).ctbanPublic(target.name, minutes, reason);
    Chat.toSlot(viewer.slot, line);
  }
  pub()?.emit("OnCTBan", {
    target: p ? playerRef(p.slot) : null,
    targetSteamId: target.steamId,
    adminSteamId: admin,
    minutes,
    permanent: seconds === 0,
    reason,
  });
  return { ban, written };
}

/** Revoke `ban` (negate its duration), update the cache, announce, fire OnCTUnban. */
export function unban(ban: Ban, targetName: string, by: string): boolean {
  const revoked: Ban = { ...ban, duration: revokedDuration(ban) };
  setBanCached(ban.steamId, revoked);
  clearExpiry(ban.steamId);
  const written = writeBanDuration(revoked);
  for (const viewer of Player.allConnected()) {
    const isAdmin = atLeast(rankOfSlot(viewer.slot), "eg");
    Chat.toSlot(viewer.slot, isAdmin ? msgFor(viewer.slot).unctbanAdmin(targetName, by) : msgFor(viewer.slot).unctbanPublic(targetName));
  }
  pub()?.emit("OnCTUnban", { targetSteamId: ban.steamId, by });
  return written;
}
