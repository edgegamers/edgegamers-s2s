import { HookResult } from "@s2script/sdk";
import type { Client } from "@s2script/sdk";
import { Events, Player } from "@s2script/cs2";
import { registerAdminCommands } from "./admincommands";
import { command } from "./commands";
import { FunEffects } from "./effects";
import { registerFunCommands } from "./funcommands";
import { loadPhrases } from "./phrases";
import { clearMenus, disconnectMenus, registerMenu } from "./menu";
import * as teleport from "./teleport";

const effects = new FunEffects();

export function OnPluginStart(): void {
  loadPhrases();
  registerAdminCommands();
  registerFunCommands(effects);
  effects.start();
  Events.on("player_death", ev => effects.removeSlot(ev.getPlayerSlot("userid")));
  command("sm_kill", cmd => {
    if (cmd.callerSlot < 0) { cmd.replyT("extracommands.kill.player_only"); return HookResult.Handled; }
    const pawn = Player.fromSlot(cmd.callerSlot)?.pawn;
    if (!pawn?.isValid || pawn.health === null || pawn.health <= 0) {
      cmd.replyT("extracommands.target.unavailable"); return HookResult.Handled;
    }
    pawn.slay();
    cmd.replyT("extracommands.kill.confirm");
    return HookResult.Handled;
  });
  registerMenu();
}

export function OnGameFrame(): void { effects.frame(); }
export function OnClientDisconnect(client: Client): void {
  disconnectMenus(client);
  effects.disconnect(client);
  teleport.OnClientDisconnect(client);
}
export function OnMapStart(): void { clearMenus(); effects.clear(); teleport.OnMapStart(); }
export function OnMapEnd(): void { clearMenus(); effects.clear(); teleport.OnMapEnd(); }
export function OnPluginEnd(): void { clearMenus(true); effects.clear(true); teleport.OnPluginEnd(); }
