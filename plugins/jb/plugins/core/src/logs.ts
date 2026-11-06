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
import { msg } from "./messages";

const book = new LogBook();

/** Seconds since freeze time ended (RoundUtil.GetTimeElapsed); wall-clock fallback. */
function elapsed(): number {
  const rules = GameRules.get();
  const t = rules?.timeElapsed;
  if (t !== null && t !== undefined) return Math.max(0, Math.floor(t - (rules?.freezeTime ?? 0)));
  const s = startedAt();
  return s > 0 ? Math.max(0, Math.floor(Date.now() / 1000) - s) : 0;
}

export function log(message: string): void {
  const line = book.add(elapsed(), message);
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
    for (const l of lines) c.print(l);
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
    cmd.reply(msg.logsNoPermission());
    return HookResult.Handled;
  }
  for (const l of LOG_BANNER_BEGIN) cmd.replyToConsole(l);
  for (const l of book.all()) cmd.replyToConsole(formatLine(l));
  for (const l of LOG_BANNER_END) cmd.replyToConsole(l);
  if (cmd.replySource === "chat") cmd.replyToChat(msg.logsPrinted(book.size));
  return HookResult.Handled;
}

// ---- Listeners (LogDamageListeners / LogEntityListeners) ------------------------------------

export function onGrenadeThrown(ev: GameEvents["grenade_thrown"]): void {
  const slot = ev.getPlayerSlot("userid");
  if (slot < 0 || !Player.fromSlot(slot)) return;
  log(`${describe(slot)} threw a ${ev.getString("weapon")}`);
}

export function onPlayerHurt(ev: GameEvents["player_hurt"]): void {
  const victim = ev.getPlayerSlot("userid");
  if (victim < 0 || !Player.fromSlot(victim)) return;
  const attacker = ev.getPlayerSlot("attacker");
  const dmg = ev.getInt("dmg_health");
  if (attacker < 0 || !Player.fromSlot(attacker)) log(`The world hurt ${describe(victim)} for ${dmg} damage`);
  else log(`${describe(attacker)} hurt ${describe(victim)} for ${dmg} damage`);
}

export function onPlayerDeath(ev: GameEvents["player_death"]): void {
  const victim = ev.getPlayerSlot("userid");
  if (victim < 0 || !Player.fromSlot(victim)) return;
  const attacker = ev.getPlayerSlot("attacker");
  if (attacker < 0 || !Player.fromSlot(attacker)) log(`The world killed ${describe(victim)}`);
  else log(`${describe(attacker)} killed ${describe(victim)}`);
}

export function onItemPickup(ev: GameEvents["item_pickup"]): void {
  if (ev.getBool("silent")) return;
  const slot = ev.getPlayerSlot("userid");
  if (slot < 0 || !Player.fromSlot(slot)) return;
  log(`${describe(slot)} picked up a ${ev.getString("item")}`);
}

function entityOutput(verb: string, ev: OutputEvent): void {
  if (!ev.activator) return;
  const p = playerByEntityIndex(ev.activator.index);
  if (!p) return;
  const name = ev.caller?.name || "Unlabeled";
  const target = ev.caller?.target || "None";
  log(`${describe(p.slot)} ${verb}: ${name} -> ${target}`);
}

export function onButtonPressed(ev: OutputEvent): void {
  entityOutput("pressed a button", ev);
}

export function onBreakableBroken(ev: OutputEvent): void {
  entityOutput("broke an entity", ev);
}
