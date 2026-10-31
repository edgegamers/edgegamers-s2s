import {plainPhraseFor, type LogPresentation} from "@edgegamers/jailbreak-shared";
import {logEntry} from '@edgegamers/jailbreak-shared';
/**
 * The round log (Jailbreak.Logs): a timestamped list of what happened this round — damage,
 * kills, grenades, button presses, breakables, rebels, C4s, plus lines other plugins append with
 * `core.log()`. `!logs` prints it to an admin's console; at round end it is dumped to every
 * console. Every line is also emitted as the OnLog forward for external sinks.
 */
import { Admin, ADMFLAG, Clients, HookResult } from "@s2script/sdk";
import type { CommandInvocation, HookResultValue, OutputEvent } from "@s2script/sdk";
import { GameRules, Player } from "@s2script/cs2";
import type { GameEvents } from "@s2script/cs2";
import { config } from "@s2script/sdk";
import { isAlive, teamName } from "@edgegamers/jailbreak-shared";
import { LogBook, LOG_BANNER_BEGIN, LOG_BANNER_END, formatLine, playerLabel } from "./log-book";
import { bus, playerByEntityIndex } from "./bus";
import { isRebel } from "./rebels";
import { currentRound, startedAt } from "./round";
import { msgFor } from "./messages";

const book = new LogBook();

/** Seconds since freeze time ended (RoundUtil.GetTimeElapsed); wall-clock fallback. */
function elapsed(): number {
  const rules = GameRules.get();
  const t = rules?.timeElapsed;
  if (t !== null && t !== undefined) return Math.max(0, Math.floor(t - (rules?.freezeTime ?? 0)));
  const s = startedAt();
  return s > 0 ? Math.max(0, Math.floor(Date.now() / 1000) - s) : 0;
}

export function log(message: string, presentation?: LogPresentation): void {
  const line = book.add(elapsed(), message, presentation);
  bus()?.emit("OnLog", { round: currentRound(), at: line.at, message: line.message });
}

/** Log label for whoever is in `slot` now ("" if empty). */
export function describe(slot: number): string {
  const p = Player.fromSlot(slot);
  if (!p) return "";
  return playerLabel({
    name: p.playerName ?? "",
    userId: p.userId,
    team: teamName(p.teamNum),
    rebel: isRebel(slot),
  });
}

export function clearLogs(): void {
  book.clear();
}

/** Dump the round log to the server console and every player's console (round end). */
export function dumpToAll(): void {
  const lines = [...LOG_BANNER_BEGIN, ...book.formatted(), ...LOG_BANNER_END];
  for (const l of lines) console.log(l);
  for (const c of Clients.all()) {
    if (c.isBot) continue;
    for (const l of playerLines(c.slot)) c.print(l);
  }
}

// ---- !logs ---------------------------------------------------------------------------------

const LOG_FLAGS = ADMFLAG.BAN | ADMFLAG.GENERIC | ADMFLAG.KICK;

function mayViewLogs(slot: number): boolean {
  if (slot < 0) return true;
  const admin = Admin.forSlot(slot);
  // RequiresPermissionsOr("@css/ban", "@css/generic", "@css/kick"): any one of them (or root).
  if (admin && ((admin.flags & LOG_FLAGS) !== 0 || admin.hasFlags(ADMFLAG.ROOT))) return true;
  return config.getBool("logs_allow_dead") && !isAlive(Player.fromSlot(slot));
}

export function logsCommand(cmd: CommandInvocation): HookResultValue {
  if (!mayViewLogs(cmd.callerSlot)) {
    cmd.reply(msgFor(cmd.callerSlot).logsNoPermission());
    return HookResult.Handled;
  }
  for (const line of playerLines(cmd.callerSlot)) cmd.replyToConsole(line);
  if (cmd.replySource === "chat") cmd.replyToChat(msgFor(cmd.callerSlot).logsPrinted(book.size));
  return HookResult.Handled;
}

// ---- Listeners (LogDamageListeners / LogEntityListeners) ------------------------------------

export function onGrenadeThrown(ev: GameEvents["grenade_thrown"]): void {
  const slot = ev.getPlayerSlot("userid");
  if (slot < 0 || !Player.fromSlot(slot)) return;
  log(...logEntry("JB_LOG_THREW_A", [String(describe(slot)), String(ev.getString("weapon"))]));
}

export function onPlayerHurt(ev: GameEvents["player_hurt"]): void {
  const victim = ev.getPlayerSlot("userid");
  if (victim < 0 || !Player.fromSlot(victim)) return;
  const attacker = ev.getPlayerSlot("attacker");
  const dmg = ev.getInt("dmg_health");
  if (attacker < 0 || !Player.fromSlot(attacker)) log(...logEntry("JB_LOG_THE_WORLD_HURT_FOR_DAMAGE", [String(describe(victim)), String(dmg)]));
  else log(...logEntry("JB_LOG_PLAYER_HURT", [String(describe(attacker)), String(describe(victim)), String(dmg)]));
}

export function onPlayerDeath(ev: GameEvents["player_death"]): void {
  const victim = ev.getPlayerSlot("userid");
  if (victim < 0 || !Player.fromSlot(victim)) return;
  const attacker = ev.getPlayerSlot("attacker");
  if (attacker < 0 || !Player.fromSlot(attacker)) log(...logEntry("JB_LOG_THE_WORLD_KILLED", [String(describe(victim))]));
  else log(...logEntry("JB_LOG_KILLED", [String(describe(attacker)), String(describe(victim))]));
}

export function onItemPickup(ev: GameEvents["item_pickup"]): void {
  if (ev.getBool("silent")) return;
  const slot = ev.getPlayerSlot("userid");
  if (slot < 0 || !Player.fromSlot(slot)) return;
  log(...logEntry("JB_LOG_PICKED_UP_A", [String(describe(slot)), String(ev.getString("item"))]));
}

function entityOutput(verb: string, ev: OutputEvent): void {
  if (!ev.activator) return;
  const p = playerByEntityIndex(ev.activator.index);
  if (!p) return;
  const name = ev.caller?.name || "Unlabeled";
  const target = ev.caller?.target || "None";
  log(...logEntry("JB_LOG_EVENT", [String(describe(p.slot)), String(verb), String(name), String(target)], [1]));
}

export function onButtonPressed(ev: OutputEvent): void {
  entityOutput("pressed a button", ev);
}

export function onBreakableBroken(ev: OutputEvent): void {
  entityOutput("broke an entity", ev);
}

function playerLines(slot:number):string[] {
  return [LOG_BANNER_BEGIN[0],plainPhraseFor(slot,"JB_LOG_BEGIN"),LOG_BANNER_BEGIN[2],
    ...book.all().map(line=>{
      const p=line.presentation;if(!p)return formatLine(line);
      const args=p.args.map((value,i)=>p.labels?.includes(i)?plainPhraseFor(slot,String(value)):value);
      const text=plainPhraseFor(slot,p.key,...args);
      return formatLine({at:line.at,message:text===p.key?line.message:text});
    }),LOG_BANNER_END[0],plainPhraseFor(slot,"JB_LOG_END"),LOG_BANNER_END[2]];
}
