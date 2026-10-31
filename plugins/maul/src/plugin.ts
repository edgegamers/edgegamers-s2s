import { loadPhrases, kickReasonFor } from "./phrases.ts";
import { watchDecluttr, decluttrCall } from '../../decluttr/src/owner.ts';
// src/plugin.ts — composition root for the MAUL authentication port.
//
// Ports the authentication / admin-permission path of maul-actain to s2script. It speaks EITHER
// MAUL API, chosen by the `api_version` config: the v1 header-style client in src/api.ts, or the
// maul3 v2 client in src/api-v2.ts. Behavioral source of truth is the SourceMod implementation at
// ../../sm/maul/scripting/maul_authentication.sp.
//
// Design: docs/design/maul-auth-design.md
//
// Authoring shape: SourceMod-style named publics. The host subscribes every exported `On*` public
// BEFORE it runs OnPluginStart, so the publics read the module-level `maul` and no-op until
// OnPluginStart has built it. Commands, game-event hooks, config.onChange and the BaseBans watch
// are load-window registrations and live inside OnPluginStart.

import { hook } from "@s2script/sdk/plugin";
import { config } from "@s2script/sdk/config";
import { Clients } from "@s2script/sdk/clients";
import { Chat } from "@s2script/sdk/chat";
import { HookResult } from "@s2script/sdk/events";
import { after } from "@s2script/sdk/timers";
import { Server } from "@s2script/sdk/server";
import type { Client } from "@s2script/sdk/clients";
import { MaulApi } from "./api.ts";
import { MaulV2Api } from "./api-v2.ts";
import { PresenceReporter } from "./presence.ts";
import type { MaulBackend } from "./backend.ts";
import { Authenticator } from "./auth.ts";
import { registerBanHooks } from "./bans.ts";
import { registerCommands } from "./commands.ts";
import { loadRankTable, readConfig } from "./config.ts";
import { createLogger } from "./log.ts";
import { NameManager } from "./names.ts";
import type { MaulConfig } from "./config.ts";
import type { RankTable } from "./types.ts";

/** Everything OnPluginStart builds; null until then (and if it threw). */
interface Maul {
  api: MaulBackend;
  names: NameManager;
  auth: Authenticator;
  presence: PresenceReporter | null;
}

let cfg: MaulConfig;
const log = createLogger(() => cfg.debug);
let rankTable: RankTable = { ranks: {} };
let rankTableLoaded = false;
let maul: Maul | null = null;

function reloadRankTable(): void {
  const result = loadRankTable(rankTableLoaded ? rankTable : null);
  rankTable = result.table;
  rankTableLoaded = true;

  const count = String(Object.keys(result.table.ranks).length);
  if (result.status === "created") log.info(`wrote the default ranks table (${count} ranks)`);
  else if (result.status === "kept-last-good")
    log.error(`ranks table is malformed — keeping the last-good table (${count} ranks)`);
  else log.info(`loaded ranks table (${count} ranks)`);
}

function reloadConfig(): void {
  cfg = readConfig();
  reloadRankTable();
  log.info("config reloaded");
}

/** Verify every connected client MAUL has not answered for yet. */
function sweepUnverified(auth: Authenticator): void {
  for (const client of Clients.all()) {
    if (client.isBot || client.steamId === "0") continue;
    if (auth.isVerified(client.steamId)) continue;
    void auth.verify(client.slot, client.steamId, false);
  }
}

export function OnPluginStart(): void {
  loadPhrases();
  cfg = readConfig();
  reloadRankTable();

  // Backend is chosen once at load; api_version changes need a plugin reload, not just a config
  // re-read, because the two clients hold different state (v1 an endpoint, v2 a JWT).
  const api: MaulBackend = cfg.apiVersion === "v2"
    ? new MaulV2Api(() => cfg, log)
    : new MaulApi(() => cfg, log);
  log.info(`using the MAUL ${cfg.apiVersion} API: ${api.describe()}`);

  // Constructed here rather than further down because presence reports MAUL names and calls into
  // this from its very first snapshot — which `presence.start()` below can reach before the rest of
  // OnPluginStart has run.
  const names = new NameManager(log, (slot, desired) => decluttrCall(desired, provider => provider.sanitizeName(slot, desired)));
  watchDecluttr(() => names.reapplyAll());

  // Presence is a v2-only push channel: it needs the JWT the v2 client already manages, and v1 has
  // no equivalent endpoint. Off unless asked for, so an upgraded server does not silently start
  // reporting its roster.
  const presence: PresenceReporter | null =
    cfg.presence && api instanceof MaulV2Api
      ? new PresenceReporter({
          getConfig: () => cfg,
          log,
          getToken: () => api.accessToken(),
          getGameIdType: () => api.gameIdType(),
          getMap: () => Server.mapName,
          getMaxPlayers: () => Server.maxPlayers,
          // What this player is actually called in the server, autotag included.
          enforcedName: (steamId) => names.nameOf(steamId),
          schedule: (ms, fn) => {
            const t = after(ms, fn);
            return { cancel: () => { t.kill(); } };
          },
          // MAUL relaying an operator's line into the server. Always goes to everyone: `chat.send`
          // carries a channel, but "team" has no meaning for a message that originates outside the
          // game — MAUL is on nobody's team.
          onChatSend: (message) => {
            Chat.toAll(message);
            log.info(`relayed a MAUL chat message: ${message}`);
          },
          // Kicks target a SteamID because that is what MAUL's roster is keyed
          // to; slots are an engine detail MAUL never sees.
          onKick: (steamId, reason, isDefault) => {
            for (const client of Clients.all()) {
              if (!client.isValid() || client.steamId !== steamId) continue;
              client.kick(kickReasonFor(client.slot,reason,isDefault));
              return true;
            }
            return false;
          },
          // `Server.command` returns void — it queues the line to the server
          // console for the next frame. `true` here therefore means DISPATCHED,
          // which is exactly what the ack claims and no more.
          onCommand: (line) => {
            Server.command(line);
            return true;
          },
        })
      : null;

  const auth = new Authenticator({
    api,
    names,
    log,
    getConfig: () => cfg,
    getRankTable: () => rankTable,
  });

  maul = { api, names, auth, presence };

  if (presence !== null) {
    log.info(`presence reporting on, every ${String(cfg.presenceIntervalMs)}ms`);
    presence.start();
  } else if (cfg.presence) {
    log.warn("presence is enabled but api_version is not v2 — presence needs the v2 WebSocket");
  }

  config.onChange(reloadConfig);

  // Bans route to MAUL instead of bans.json (SM maul_commands.sp OnBanClient parity), once a
  // compatible @s2script/basebans is loaded.
  registerBanHooks({
    api,
    log,
    rankOf: (steamId) => auth.profileOf(steamId)?.primaryRank ?? 0,
    profileOf: (steamId) => auth.profileOf(steamId),
  });

  registerCommands({
    auth,
    api,
    log,
    getConfig: () => cfg,
    getRankTable: () => rankTable,
    reloadConfig,
  });

  if (cfg.maulKey.length === 0) {
    log.error("no maul_key configured — authentication is disabled until one is set");
  }

  // v1 keys requests on the server's ip/port, read from cvars that are not always available at
  // load; OnMapStart retries each map until they resolve. v2 identifies the server by API key alone.
  if (api instanceof MaulApi) api.resolveEndpoint();

  // Team membership. The runtime exposes no team getter on Client, so this event
  // is the only source — MAUL's roster shows teams entirely on the back of it.
  //
  // `disconnect` is set when the "team change" is really someone leaving; the
  // slot is cleared either way by OnClientDisconnect, so this handler only has
  // to care about live moves.
  hook.on("player_team", (ev) => {
    const slot = ev.getPlayerSlot("userid");
    if (slot < 0) return;
    presence?.setTeam(slot, ev.getInt("team"));
  });

  // A player renaming themselves out of their MAUL name.
  //
  // The pre-hook cannot cancel the rename (`Handled` suppresses the client broadcast; the server
  // still applies the change), but suppressing the broadcast still matters: it keeps the server
  // from announcing an impersonated tag to everyone in the window before we revert it.
  //
  // The corrective write is deferred a frame rather than issued inside the hook — an engine write
  // from within the event dispatcher is exactly the shape the framework documents a re-entrancy
  // skip for.
  hook.onPre("player_changename", (ev) => {
    // `ev` is valid only synchronously — read every field before deferring anything.
    const slot = ev.getPlayerSlot("userid");
    if (slot < 0) return;

    const newName = ev.getString("newname");

    const client = Clients.fromSlot(slot);
    if (client === null || client.isBot || client.steamId === "0") return;

    const { steamId, userId } = client;
    if (!names.needsEnforcement(steamId, newName)) return;

    after(1, () => {
      if (names.enforce(slot, steamId, userId)) {
        log.debug(`re-imposed MAUL name for ${steamId} after rename to "${newName}"`);
      }
    });

    return HookResult.Handled;
  });

  // Backstop for renames the event does not cover — the engine restoring client-supplied names
  // across round transitions. Also retries anyone whose lookup never completed (actain's
  // OnRoundStart).
  hook.on("round_start", () => {
    after(1000, () => {
      names.reapplyAll();
      sweepUnverified(auth);
    });
  });

  // Clients already connected at load get no OnClientPostAdminCheck — seed them explicitly.
  sweepUnverified(auth);

  log.info("authentication ready");
}

/** The ledger closes the socket regardless; stopping first keeps presence from scheduling a reconnect. */
export function OnPluginEnd(): void {
  maul?.presence?.stop();
}

export function OnMapStart(): void {
  if (maul?.api instanceof MaulApi) maul.api.resolveEndpoint();
}

// Steam ticket validated: the first point at which the SteamID is trustworthy.
export function OnClientPostAdminCheck(client: Client): void {
  if (maul === null || client.isBot) return;

  // steamId "0" = unauthenticated (bot, or `sv_lan 1`, where CS2 runs no Steam auth at all).
  // Skipping is correct — permissions must never rest on an unverified id — but say so, or a
  // silent return is indistinguishable from the handler never firing.
  if (client.steamId === "0") {
    log.warn(
      `slot ${String(client.slot)} ("${client.name}") has no authenticated SteamID — skipping. ` +
        `Steam auth is off; check sv_lan (must be 0) and that the server has a GSLT.`,
    );
    return;
  }

  const { slot, steamId } = client;
  log.info(`starting verification for ${steamId} on slot ${String(slot)}`);
  void maul.auth.verify(slot, steamId, true);

  // Reported here rather than at connect: this is the first point the SteamID is trustworthy, and
  // MAUL opens a session on this event. A player admitted and then kicked for a ban never reaches
  // it, so no spurious session is opened for them.
  maul.presence?.playerJoined(client);
}

// PRE-hook: fires before the line is broadcast, and returning a HookResult here could suppress it.
// We only observe — MAUL is a record of what was said, not a filter — so nothing is returned and
// the say proceeds exactly as it would have.
export function OnClientSayCommand(slot: number, text: string, teamonly: boolean): void {
  const presence = maul?.presence ?? null;
  if (presence === null) return;
  const client = Clients.fromSlot(slot);
  if (client === null || client.steamId === "0") return;
  presence.playerChat(client, text, teamonly);
}

// `client` is a read-only identity snapshot, valid only synchronously — everything below reads it
// before returning.
export function OnClientDisconnect(client: Client): void {
  if (maul === null) return;
  // Cleared for EVERY client, including unauthenticated ones and bots: the
  // engine reuses slots, and a stale entry here would hand the next player in
  // this slot the previous occupant's team.
  maul.presence?.forgetTeam(client.slot);

  if (client.steamId === "0") return;
  // Before the local caches are dropped — the frame needs the steamId and handle.
  maul.presence?.playerLeft(client);
  maul.names.forget(client.steamId);
  maul.auth.forget(client.steamId);
}
