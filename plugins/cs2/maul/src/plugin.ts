/*!
MIT License

Copyright (c) 2026 EdgeGamers, LLC

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/
import { Chat } from "@s2script/sdk/chat";
import { Clients } from "@s2script/sdk/clients";
import { HookResult } from "@s2script/sdk/events";
import { plugin } from "@s2script/sdk/plugin";
import { Server } from "@s2script/sdk/server";
import { after } from "@s2script/sdk/timers";
import type { MaulApi as PublicMaulApi, MaulProfile } from "../api";
import { MaulApi } from "./api.ts";
import { MaulV2Api } from "./api-v2.ts";
import { Authenticator } from "./auth.ts";
import { registerBanHooks, type BanRoutingStatus } from "./bans.ts";
import { registerCommands } from "./commands.ts";
import { loadRankTable, readConfig } from "./config.ts";
import { createLogger } from "./log.ts";
import { NameManager } from "./names.ts";
import { PresenceReporter } from "./presence.ts";
import type { MaulBackend, PlayerLookup } from "./backend.ts";
import type { MaulConfig } from "./config.ts";
import type { PresenceControls } from "./presence.ts";
import type { RankTable } from "./types.ts";

function toPublicProfile(steamId: string, profile: PlayerLookup): MaulProfile {
  return {
    steamId,
    found: profile.found,
    userId: profile.userId,
    name: profile.name,
    divisionTag: profile.divisionTag,
    primaryRank: profile.primaryRank,
    groups: profile.groups.map((group) => ({ ...group })),
    ds: profile.ds === undefined ? undefined : { ...profile.ds },
    verified: profile.verified,
    ban: { ...profile.ban },
  };
}

export function createPublicApi(auth: Authenticator, api: MaulBackend): PublicMaulApi {
  return {
    profile(steamId) {
      const profile = auth.profileOf(steamId);
      return profile === null ? null : toPublicProfile(steamId, profile);
    },
    grant(steamId) {
      const grant = auth.grantOf(steamId);
      return grant === null ? null : {
        groupNames: [...grant.groupNames],
        flags: grant.flags,
        immunity: grant.immunity,
        missingGroups: [...grant.missingGroups],
      };
    },
    isVerified: (steamId) => auth.isVerified(steamId),
    refresh(slot) {
      const client = Clients.fromSlot(slot);
      if (client === null || client.isBot || client.steamId === "0") return false;
      auth.invalidate(client.steamId);
      void auth.verify(client.slot, client.steamId, false);
      return true;
    },
    backend: () => ({ version: api.version, ready: api.isReady(), description: api.describe() }),
  };
}

export default plugin((ctx) => {
  let cfg: MaulConfig = readConfig();
  const log = createLogger(() => cfg.debug);
  let rankTable: RankTable = { ranks: {} };
  let rankTableLoaded = false;

  function reloadRankTable(): void {
    const result = loadRankTable(rankTableLoaded ? rankTable : undefined);
    rankTable = result.table;
    rankTableLoaded = true;

    if (result.status === "created") {
      log.info("created default MAUL rank table");
    } else if (result.status === "loaded") {
      log.debug("loaded MAUL rank table");
    } else {
      log.warn("failed to parse MAUL rank table; keeping last good table");
    }
  }

  reloadRankTable();

  const api: MaulBackend = cfg.apiVersion === "v2"
    ? new MaulV2Api(() => cfg, log)
    : new MaulApi(() => cfg, log);
  if (api instanceof MaulApi) api.resolveEndpoint();

  const names = new NameManager();
  let presence: PresenceReporter | null = null;
  if (cfg.presence && api instanceof MaulV2Api) {
    const controls: PresenceControls = {
      chat: { send: (message) => { Chat.toAll(message); } },
      player: {
        kick: (gameIdValue, reason) => {
          const client = Clients.all().find((candidate) => candidate.steamId === gameIdValue);
          if (client === undefined) return false;
          client.kick(reason);
          return true;
        },
      },
      server: {
        command: (line) => {
          Server.command(line);
          return true;
        },
      },
    };
    const presenceDeps = {
      getConfig: () => cfg,
      log,
      accessToken: () => api.accessToken(),
      server: () => ({ map: Server.mapName, maxPlayers: Server.maxPlayers }),
      controls,
    };
    presence = new PresenceReporter(presenceDeps);
    void presence.start();
  }

  const auth = new Authenticator({
    api,
    log,
    names,
    getConfig: () => cfg,
    getRankTable: () => rankTable,
  });

  function reloadConfig(): void {
    cfg = readConfig();
    reloadRankTable();
    if (api instanceof MaulApi) api.resolveEndpoint();
    log.info("config reloaded");
  }

  function sweepUnverified(): void {
    for (const client of Clients.all()) {
      if (client.isBot || client.steamId === "0" || auth.isVerified(client.steamId)) continue;
      void auth.verify(client.slot, client.steamId, false);
    }
  }

  ctx.config.onChange(reloadConfig);

  let banRoutingStatus: BanRoutingStatus = { available: false, reason: "not registered" };
  banRoutingStatus = registerBanHooks({
    api,
    log,
    rankOf: (steamId) => auth.profileOf(steamId)?.primaryRank ?? 0,
    profileOf: (steamId) => auth.profileOf(steamId),
  });

  registerCommands(ctx, {
    auth,
    api,
    log,
    getConfig: () => cfg,
    getRankTable: () => rankTable,
    getBanRoutingStatus: () => banRoutingStatus,
    isPresenceActive: () => presence?.isActive() ?? false,
    reloadConfig,
  });

  ctx.clients.onFullyConnect((client) => {
    if (client.isBot) return;
    const steamId = client.steamId;
    if (steamId === "0") {
      log.warn(`skipping MAUL verification for slot ${client.slot}: SteamID unavailable`);
      return;
    }

    void auth.verify(client.slot, steamId, true);
    presence?.playerJoined(client);
  });

  ctx.clients.onDisconnect((client) => {
    presence?.forgetTeam(client.slot);
    const steamId = client.steamId;
    if (steamId === "0") return;

    presence?.playerLeft(client);
    names.forget(steamId);
    auth.forget(steamId);
  });

  ctx.clients.onSay((slot, text, teamonly) => {
    const client = Clients.fromSlot(slot);
    if (client !== null) presence?.playerChat(client, text, teamonly);
  });

  ctx.events.on("player_team", (ev) => {
    const slot = ev.getPlayerSlot("userid");
    if (slot >= 0) presence?.setTeam(slot, ev.getInt("team"));
  });

  ctx.events.onPre("player_changename", (ev) => {
    const slot = ev.getPlayerSlot("userid");
    if (slot < 0) return;

    const steamId = Clients.fromSlot(slot)?.steamId ?? "0";
    if (steamId === "0" || !names.needsEnforcement(steamId, ev.getString("newname"))) return;

    after(1, () => names.enforce(slot, steamId));
    return HookResult.Handled;
  });

  ctx.events.on("round_start", () => {
    after(1000, () => {
      names.reapplyAll();
      sweepUnverified();
    });
  });

  sweepUnverified();
  ctx.publish<PublicMaulApi>("@edgegamers/maul", createPublicApi(auth, api));
  log.info(`loaded (${api.describe()})`);

  return {
    onUnload() {
      presence?.stop();
    },
  };
});
