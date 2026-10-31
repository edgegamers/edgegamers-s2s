/**
 * @edgegamers/jailbreak-guards — wiring only. Guard queue, ratio, priority and CT bans live in their
 * own modules; this file connects them to core, the SDK lifecycle and the published contract.
 */
import { command, config, createScope, publish, use } from "@s2script/sdk";
import type { Client } from "@s2script/sdk";
import { Clients } from "@s2script/sdk";
import { Team } from "@edgegamers/jailbreak-shared";
import { isPermanent, minutesLeft } from "./bans";
import { registerCommands, resetCommandState } from "./commands";
import { loadSettings, settings } from "./config";
import { activeBan, armExpiry, clearExpiry, remind } from "./ctbans";
import { now, playerBySteam, setPublisher } from "./env";
import { effectiveOf, flushAll, onPlayerGone, onPlayerReady, reloadUnloaded, startAccrual } from "./players";
import { leaveQueue, queue } from "./queueing";
import { onStoreConnected, openStore, pendingWrites, pruneBans } from "./store";
import { mapStart, noteModeChanged, onJoinTeam, roundEnd, roundStart } from "./teams";

function ready(steamId: string): void {
  onPlayerReady(steamId, (e) => {
    if (e.ban) armExpiry(e.ban);
    // The ban may only be known now (slow load / DB was down): enforce it like round start would.
    const ban = activeBan(steamId);
    if (!ban) return;
    leaveQueue(steamId);
    const p = playerBySteam(steamId);
    if (p && p.teamNum === Team.Guard) {
      remind(p.slot, ban);
      p.changeTeam(Team.Prisoner);
    }
  });
}

export function OnPluginStart(): void {
  loadSettings();
  config.onChange(() => {
    loadSettings();
    startAccrual();
  });

  setPublisher(
    publish("@edgegamers/jailbreak-guards", {
      isCTBanned: (steamId: string): boolean => activeBan(steamId) !== null,
      getBan(steamId: string) {
        const b = activeBan(steamId);
        return b ? { reason: b.reason, minutesLeft: minutesLeft(b, now()), permanent: isPermanent(b) } : null;
      },
      getPriority: (steamId: string): number => effectiveOf(steamId),
      queuePosition: (steamId: string): number => queue.position(steamId),
      queueSize: (): number => queue.size(),
    }),
  );

  const core = use("@edgegamers/jailbreak-core");
  core.on("OnRoundStart", () => roundStart());
  core.on("OnRoundEnd", () => roundEnd());
  core.on("OnModeChanged", (ev) => noteModeChanged(ev.mode));

  command.onClientCommand("jointeam", (slot, argString) => onJoinTeam(slot, argString));
  registerCommands();

  // Open first, then seed: loads that fail before the connection is up are restarted on connect.
  onStoreConnected(reloadUnloaded);
  openStore();

  const scope = createScope();
  scope.clients.onFullyConnect((c) => {
    if (!c.isBot) ready(c.steamId);
  });
  for (const c of Clients.all()) if (!c.isBot && c.steamId !== "0") ready(c.steamId);

  startAccrual();
}

export function OnClientDisconnect(client: Client): void {
  const steamId = client.steamId;
  if (steamId === "0") return;
  leaveQueue(steamId);
  clearExpiry(steamId);
  onPlayerGone(steamId);
}

export function OnMapStart(_map: string): void {
  mapStart();
  resetCommandState();
  pruneBans(now() - settings().pruneAfterDays * 86400);
}

export function OnPluginEnd(): void {
  flushAll();
  const n = pendingWrites();
  if (n > 0) console.log(`[guards] unloading with ${n} pending DB write${n === 1 ? "" : "s"}`);
}
