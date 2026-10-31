import { command, config, createScope, publish, use } from "@s2script/sdk";
import type { Client } from "@s2script/sdk";
import { Events } from "@s2script/cs2";
import type { PeaceReason, WardenRemovedReason } from "../api";
import { commandsRoundStart, registerCommands, SOCCER_MODEL } from "./commands";
import { loadConfig } from "./config";
import { isWarmup, killRoundTimers, setPublisher } from "./env";
import { removeAllIcons } from "./icons";
import { clearMarker, filterPing, initMarkers, markerOnPing } from "./markers";
import { clearPaint, paintFrame } from "./paint";
import {
  isPeace,
  peaceMute,
  peaceOnDeath,
  peaceOnDisconnect,
  peaceOnSpawn,
  peaceOnVoice,
  peaceRoundEnd,
  peaceRoundStart,
  unPeaceMute,
} from "./peace";
import {
  guaranteeWarden,
  initSelection,
  isInQueue,
  selectionMapStart,
  selectionOnDisconnect,
  selectionRoundEnd,
  selectionRoundStart,
} from "./selection";
import {
  isSpecialTreatment,
  revokeSpecialTreatment,
  setSpecialTreatment,
  specialOnDeath,
  specialOnDisconnect,
  specialRoundStart,
} from "./special-treatment";
import {
  getWarden,
  hasWarden,
  isWarden,
  removeWarden,
  setWarden,
  wardenMapStart,
  wardenRoundEnd,
  wardenRoundStart,
} from "./warden";

/**
 * @edgegamers/jailbreak-warden — wiring only. The warden, warden selection, warden commands, markers, paint, icons,
 * special treatment and peace mute each live in their own module.
 */
export function OnPluginStart(): void {
  loadConfig();
  config.onChange(() => loadConfig());

  const core = use("@edgegamers/jailbreak-core");
  // Per-round state resets on core's OnRoundStart (after core reset its own), not raw round_start.
  core.on("OnRoundStart", () => {
    killRoundTimers();
    peaceRoundStart();
    specialRoundStart();
    removeAllIcons();
    clearMarker();
    clearPaint();
    commandsRoundStart();
    wardenRoundStart();
    selectionRoundStart(isWarmup());
  });
  core.on("OnRoundEnd", () => {
    killRoundTimers();
    selectionRoundEnd();
    wardenRoundEnd();
    peaceRoundEnd();
  });
  core.on("OnRebelChanged", (ev) => {
    if (ev.rebel) revokeSpecialTreatment(ev.player.slot, false);
  });

  setPublisher(
    publish("@edgegamers/jailbreak-warden", {
      getWarden: (): number => getWarden(),
      hasWarden: (): boolean => hasWarden(),
      isWarden: (slot: number): boolean => isWarden(slot),
      setWarden: (slot: number): boolean => setWarden(slot),
      removeWarden: (reason: WardenRemovedReason): boolean => removeWarden(reason),
      guaranteeWarden: (steamId: string): boolean => guaranteeWarden(steamId),
      isInQueue: (slot: number): boolean => isInQueue(slot),
      isSpecialTreatment: (slot: number): boolean => isSpecialTreatment(slot),
      setSpecialTreatment: (slot: number, granted: boolean): boolean => setSpecialTreatment(slot, granted),
      isPeace: (): boolean => isPeace(),
      peaceMute(reason: PeaceReason): void {
        peaceMute(reason);
      },
      unPeaceMute(): void {
        unPeaceMute();
      },
    }),
  );

  initSelection();
  initMarkers();
  registerCommands();

  Events.on("player_death", (ev) => {
    const slot = ev.getPlayerSlot("userid");
    if (slot < 0) return;
    if (isWarden(slot)) removeWarden("death");
    specialOnDeath(slot);
    peaceOnDeath(slot);
  });
  Events.on("player_spawn", (ev) => {
    const slot = ev.getPlayerSlot("userid");
    if (slot >= 0) peaceOnSpawn(slot);
  });
  Events.on("player_team", (ev) => {
    const slot = ev.getPlayerSlot("userid");
    if (slot < 0 || ev.getBool("disconnect")) return;
    if (isWarden(slot)) removeWarden("team_change");
  });
  Events.on("player_ping", (ev) => {
    markerOnPing(ev.getPlayerSlot("userid"), ev.getFloat("x"), ev.getFloat("y"), ev.getFloat("z"));
  });
  // Only the warden may ping (the C# player_ping command listener).
  command.onClientCommand("player_ping", (slot) => filterPing(slot));

  const scope = createScope();
  scope.server.onGameFrame(paintFrame);
  scope.clients.onVoice((c) => peaceOnVoice(c.slot));
  scope.server.onPrecache((pc) => {
    pc.add(SOCCER_MODEL);
  });
}

export function OnClientDisconnect(client: Client): void {
  const slot = client.slot;
  if (isWarden(slot)) removeWarden("disconnect");
  selectionOnDisconnect(client.userId);
  specialOnDisconnect(slot);
  peaceOnDisconnect(slot);
}

export function OnMapStart(_map: string): void {
  wardenMapStart();
  selectionMapStart();
  clearMarker();
  clearPaint();
}

export function OnPluginEnd(): void {
  unPeaceMute();
  removeAllIcons();
  clearMarker();
  clearPaint();
}
