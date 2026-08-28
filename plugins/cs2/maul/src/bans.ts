import { Player } from "@s2script/cs2";
import { Bans } from "@s2script/sdk/bans";
import { Clients } from "@s2script/sdk/clients";
import { HookResult } from "@s2script/sdk/events";
import type { MaulBackend, PlayerLookup } from "./backend.ts";
import type { Logger } from "./log.ts";

interface HookableBan {
  steamId: string;
  source: number;
  minutes: number;
  reason: string;
  command: string;
}

interface HookableUnban {
  steamId: string;
  command: string;
}

type OptionalBanHooks = typeof Bans & {
  onBan?: (handler: (ban: HookableBan) => number | void) => void;
  onRemoveBan?: (handler: (unban: HookableUnban) => number | void) => void;
};

export interface BanRoutingStatus {
  available: boolean;
  reason: string;
}

export interface BanDeps {
  api: MaulBackend;
  log: Logger;
  rankOf(steamId: string): number;
  profileOf(steamId: string): PlayerLookup | null;
}

const ADMIN_WITNESS_MIN_RANK = 20;

function adminUserId(profile: PlayerLookup | null): number {
  return profile?.userId ?? 0;
}

function collectAdminWitnesses(deps: BanDeps, banner: string, target: string): { steamId: string; userId: number }[] {
  const admins: { steamId: string; userId: number }[] = [];

  for (const client of Clients.all()) {
    if (client.isBot || client.steamId === "0" || client.steamId === banner || client.steamId === target) continue;
    if (deps.rankOf(client.steamId) < ADMIN_WITNESS_MIN_RANK) continue;

    admins.push({
      steamId: client.steamId,
      userId: adminUserId(deps.profileOf(client.steamId)),
    });
  }

  return admins;
}

function resolveBanner(source: number): string | null {
  if (source < 0) return "";

  const steamId = Clients.fromSlot(source)?.steamId ?? "";
  return steamId === "" || steamId === "0" ? null : steamId;
}

function targetHandle(steamId: string): string {
  return Player.all().find((player) => player.steamId === steamId)?.playerName ?? steamId;
}

export function registerBanHooks(deps: BanDeps): BanRoutingStatus {
  const { api, log } = deps;
  const hookable = Bans as OptionalBanHooks;
  if (typeof hookable.onBan !== "function" || typeof hookable.onRemoveBan !== "function") {
    log.warn("this s2script core has no vetoable ban hooks (Bans.onBan) - bans will persist locally and will not reach MAUL");
    return { available: false, reason: "Bans.onBan unavailable" };
  }

  hookable.onBan((ban) => {
    const banner = resolveBanner(ban.source);
    if (banner === null) return HookResult.Continue;

    const handle = targetHandle(ban.steamId);
    const bannerProfile = deps.profileOf(banner);

    void api
      .ban({
        steamId: ban.steamId,
        handle,
        bannerIdentity: banner,
        bannerUserId: adminUserId(bannerProfile),
        minutes: ban.minutes,
        reason: ban.reason,
        admins: collectAdminWitnesses(deps, banner, ban.steamId),
        target: deps.profileOf(ban.steamId),
        note: ban.command,
      })
      .then((result) => {
        if (result.ok) {
          log.info(`routed ban for ${ban.steamId} (${handle}) to MAUL`);
          return;
        }

        log.error(
          `failed to route ban for ${ban.steamId} (${handle}) to MAUL: minutes=${ban.minutes} reason="${ban.reason}" admin="${banner}" - ${result.reason}`,
        );
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        log.error(
          `failed to route ban for ${ban.steamId} (${handle}) to MAUL: minutes=${ban.minutes} reason="${ban.reason}" admin="${banner}" - ${message}`,
        );
      });

    return HookResult.Handled;
  });

  hookable.onRemoveBan((unban) => {
    if (Bans.get(unban.steamId) === null) {
      log.info(`local unban for ${unban.steamId} is a no-op; MAUL-owned bans must be lifted in MAUL`);
      return;
    }

    log.info(`local ban for ${unban.steamId} will be cleared only from the local ban store`);
  });

  return { available: true, reason: "Bans.onBan active" };
}
