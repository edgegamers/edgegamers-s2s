import {logEntry} from '@edgegamers/jailbreak-shared';
import {forRecipients} from '@edgegamers/jailbreak-shared';
import {plainPhraseFor as labelFor,phraseFor} from '@edgegamers/jailbreak-shared';
import {broadcastText} from '@edgegamers/jailbreak-shared';
import { ADMFLAG, after, Chat, command, createEntity, HookResult } from "@s2script/sdk";
import type { CommandInvocation, HookResultValue } from "@s2script/sdk";
import { Player } from "@s2script/cs2";
import { Team, isAlive } from "@edgegamers/jailbreak-shared";
import { cellsOpened, describe, log, openCells } from "@edgegamers/jailbreak-core";
import { cfg } from "./config";
import { hasFlagLetters, hasFlags, isWarmup, roundElapsed } from "./env";
import { getMarker, isInMarker, openMarkerColorMenu, openMarkerTypeMenu } from "./markers";
import { msgFor, who } from "./messages";
import { isPeace, msSinceLastPeace, peaceMute } from "./peace";
import { countdownSchedule, parseCountdown, parseRoll, rollBetween } from "./rules";
import {
  isInQueue,
  isQueueActive,
  toggleAutoWarden,
  tryEnterQueue,
  tryExitQueue,
  tryGuaranteed,
} from "./selection";
import { isSpecialTreatment, setSpecialTreatment } from "./special-treatment";
import { getWarden, hasWarden, isWarden, passCooldownEnds, removeWarden, setWarden } from "./warden";

/**
 * Every warden chat/console command (Jailbreak.Warden/Commands + the `st` debug subcommand).
 * Names keep the C# `css_*` names as `sm_*` (so `!warden`, `/w`, …), aliases preserved.
 */

export const SOCCER_MODEL = "models/props/de_dust/hr_dust/dust_soccerball/dust_soccer_ball001.vmdl";

const H = HookResult.Handled;
let chickens = 0;
let soccerBalls = 0;
let lastCountdownMs = 0;

const nameOf = (slot: number): string => {
  const p = Player.fromSlot(slot);
  return who(p?.playerName ?? "", p?.teamNum);
};

function reply(cmd: CommandInvocation, text: string): void {
  if (cmd.callerSlot >= 0) Chat.toSlot(cmd.callerSlot, text);
  else cmd.reply(text);
}

/** Register a command under several names. */
function on(names: string[], handler: (cmd: CommandInvocation) => HookResultValue | void): void {
  for (const n of names) command(n, handler);
}

export function commandsRoundStart(): void {
  chickens = 0;
  soccerBalls = 0;
}

export function registerCommands(): void {
  // ── !warden / !w: join the raffle, claim warden, or see who it is ─────────
  on(["sm_warden", "sm_w"], (cmd) => {
    const slot = cmd.callerSlot;
    const p = Player.fromSlot(slot);
    if (!p || p.teamNum !== Team.Guard || !isAlive(p)) return H;

    const ends = passCooldownEnds(slot);
    if (Date.now() < ends && !hasFlags(slot, ADMFLAG.RCON)) {
      reply(cmd, msgFor(cmd.callerSlot).onCooldown(Math.ceil((ends - Date.now()) / 1000)));
      return H;
    }
    if (isWarmup()) {
      reply(cmd, msgFor(cmd.callerSlot).cannotWardenDuringWarmup);
      return H;
    }
    if (isQueueActive()) {
      if (!isInQueue(slot)) {
        if (tryEnterQueue(slot) && !isWarden(slot)) reply(cmd, msgFor(cmd.callerSlot).joinRaffle);
      } else if (tryExitQueue(slot)) {
        reply(cmd, msgFor(cmd.callerSlot).leaveRaffle);
      }
      return H;
    }
    if (!hasWarden() && (tryGuaranteed(slot) || setWarden(slot))) return H;
    reply(cmd, msgFor(cmd.callerSlot).currentWarden(hasWarden() ? nameOf(getWarden()) : null));
    return H;
  });

  // ── !pass / !uw: resign ───────────────────────────────────────────────────
  on(["sm_pass", "sm_uw", "sm_unwarden"], (cmd) => {
    if (!isWarden(cmd.callerSlot)) return H;
    removeWarden("pass");
    return H;
  });

  // ── !fire: an admin removes the warden ────────────────────────────────────
  on(["sm_fire"], (cmd) => {
    if (cmd.callerSlot < 0) return H;
    if (!hasWarden()) {
      reply(cmd, msgFor(cmd.callerSlot).currentWarden(null));
      return H;
    }
    if (!hasFlags(cmd.callerSlot, ADMFLAG.BAN)) {
      reply(cmd, msgFor(cmd.callerSlot).noPermission(labelFor(cmd.callerSlot,"JB_WARDEN_LABEL_CSS_BAN")));
      return H;
    }
    removeWarden("fire", cmd.callerSlot);
    return H;
  });

  // ── !open / !o ────────────────────────────────────────────────────────────
  on(["sm_open", "sm_o"], (cmd) => {
    const slot = cmd.callerSlot;
    const admin = slot < 0 || hasFlags(slot, ADMFLAG.CHEATS);
    if (!admin) {
      if (!isWarden(slot)) {
        reply(cmd, msgFor(cmd.callerSlot).notWarden);
        return H;
      }
      if (roundElapsed() < cfg.openCooldown) {
        reply(cmd, msgFor(cmd.callerSlot).cannotOpenYet(cfg.openCooldown));
        return H;
      }
      if (cellsOpened()) {
        reply(cmd, msgFor(cmd.callerSlot).alreadyOpened);
        return H;
      }
    }
    const byWarden = isWarden(slot);
    if (!openCells(byWarden ? "warden" : "admin")) {
      broadcastText(recipient => msgFor(recipient).openingFailed);
      return H;
    }
    broadcastText(forRecipients((recipient,value0) => slot >= 0 && !byWarden ? msgFor(recipient).cellsOpenedBy(value0) : msgFor(recipient).cellsOpenedByWarden, nameOf(slot)));
    log(...(slot >= 0 ? logEntry("JB_LOG_OPENED_THE_CELLS", [String(describe(slot))]) : logEntry("JB_LOG_CONSOLE_OPENED_THE_CELLS", [])));
    return H;
  });

  // ── !peace ────────────────────────────────────────────────────────────────
  on(["sm_peace"], (cmd) => {
    const slot = cmd.callerSlot;
    if (isPeace()) {
      if (slot >= 0) reply(cmd, msgFor(cmd.callerSlot).peaceActive);
      return H;
    }
    const fromWarden = isWarden(slot);
    if (slot < 0 || hasFlags(slot, ADMFLAG.CHEATS)) {
      peaceMute(fromWarden ? "warden" : "admin"); // console / high admin: no cooldown
      return H;
    }
    if (!fromWarden && !hasFlags(slot, ADMFLAG.CHAT)) {
      reply(cmd, msgFor(cmd.callerSlot).notWarden);
      return H;
    }
    const since = msSinceLastPeace();
    if (since < cfg.peaceCooldown * 1000) {
      reply(cmd, msgFor(cmd.callerSlot).onCooldown(Math.ceil((cfg.peaceCooldown * 1000 - since) / 1000)));
      return H;
    }
    peaceMute(fromWarden ? "warden" : "admin");
    return H;
  });

  // ── !count: prisoners inside the marker ───────────────────────────────────
  on(["sm_count"], (cmd) => {
    const slot = cmd.callerSlot;
    if (slot < 0) return H;
    if (!isWarden(slot)) {
      reply(cmd, msgFor(cmd.callerSlot).notWarden);
      return H;
    }
    const wait = cfg.countCooldown - roundElapsed();
    if (wait > 0) {
      reply(cmd, msgFor(cmd.callerSlot).cannotCountYet(wait));
      return H;
    }
    if (!getMarker()) {
      reply(cmd, msgFor(cmd.callerSlot).noMarkerSet);
      return H;
    }
    let n = 0;
    for (const p of Player.all()) {
      if (p.teamNum !== Team.Prisoner || !isAlive(p)) continue;
      const o = p.pawn?.origin;
      if (o && isInMarker(o)) n++;
    }
    reply(cmd, msgFor(cmd.callerSlot).prisonersInMarker(n));
    return H;
  });

  // ── !countdown [seconds] ──────────────────────────────────────────────────
  on(["sm_countdown"], (cmd) => {
    const slot = cmd.callerSlot;
    const parsed = parseCountdown(cmd.arg(0), cfg.countdownMin, cfg.countdownMax, cfg.countdownDefault);
    if (!parsed.ok) {
      reply(cmd, msgFor(cmd.callerSlot).invalidParameter(parsed.arg, parsed.expected));
      return H;
    }
    if (!countdownPeace(slot, cmd)) return H;

    const duration = parsed.value;
    broadcastText(forRecipients((recipient,value0) => msgFor(recipient).countdownStarted(value0), duration));
    for (const { delay, remaining } of countdownSchedule(duration)) {
      after(delay * 1000, () => broadcastText(forRecipients((recipient,value0) => msgFor(recipient).countdownTick(value0), remaining)));
    }
    after(duration * 1000, () => broadcastText(recipient => msgFor(recipient).countdownGo));
    return H;
  });

  // ── !roll [min max] ───────────────────────────────────────────────────────
  on(["sm_roll"], (cmd) => {
    const slot = cmd.callerSlot;
    if (slot < 0) return H;
    if (!isWarden(slot)) {
      reply(cmd, msgFor(cmd.callerSlot).notWarden);
      return H;
    }
    const r = parseRoll(cmd.args);
    if (!r.ok) {
      reply(cmd, msgFor(cmd.callerSlot).invalidParameter(r.arg, labelFor(cmd.callerSlot,"JB_WARDEN_LABEL_NUMBER")));
      return H;
    }
    broadcastText(forRecipients((recipient,value0) => msgFor(recipient).roll(value0), rollBetween(r.min, r.max, Math.random)));
    return H;
  });

  // ── !chicken / !soccer ────────────────────────────────────────────────────
  on(["sm_chicken"], (cmd) => {
    spawnForWarden(cmd, "chicken", {}, () => chickens < cfg.maxChickens, () => chickens++, {
      tooMany: msgFor(cmd.callerSlot).tooManyChickens,
      failed: msgFor(cmd.callerSlot).chickenFailed,
      spawned: (recipient:number)=>msgFor(recipient).chickenSpawned,
    });
    return H;
  });
  on(["sm_soccer", "sm_spawnball"], (cmd) => {
    spawnForWarden(cmd, "prop_physics_multiplayer", { model: SOCCER_MODEL }, () => soccerBalls < cfg.maxSoccers, () => soccerBalls++, {
      tooMany: msgFor(cmd.callerSlot).tooManySoccers,
      failed: msgFor(cmd.callerSlot).soccerFailed,
      spawned: (recipient:number)=>msgFor(recipient).soccerSpawned,
    });
    return H;
  });

  // ── !treat / !st <target>: toggle special treatment ──────────────────────
  on(["sm_treat", "sm_st"], (cmd) => {
    const slot = cmd.callerSlot;
    if (slot < 0) return H;
    if (!isWarden(slot)) {
      reply(cmd, msgFor(cmd.callerSlot).notWarden);
      cmd.replyToConsole(msgFor(cmd.callerSlot).notWarden);
      return H;
    }
    if (cmd.argCount === 0) return H; // C# TODO: a prisoner picker menu
    const query = cmd.arg(0);
    const eligible = Player.target(query, slot, false).filter((p) => p.teamNum === Team.Prisoner && isAlive(p));
    if (eligible.length !== 1) {
      const text = eligible.length === 0 ? msgFor(slot).playerNotFound(query) : msgFor(slot).playerFoundMultiple(query);
      reply(cmd, text);
      cmd.replyToConsole(text);
      return H;
    }
    const target = eligible[0].slot;
    setSpecialTreatment(target, !isSpecialTreatment(target));
    return H;
  });

  // ── marker customisation ──────────────────────────────────────────────────
  on(["sm_markertype"], (cmd) => {
    if (cmd.callerSlot < 0) return H;
    const err = openMarkerTypeMenu(cmd.callerSlot);
    if (err) reply(cmd, err);
    return H;
  });
  on(["sm_markercolor"], (cmd) => {
    if (cmd.callerSlot < 0) return H;
    const err = openMarkerColorMenu(cmd.callerSlot);
    if (err) reply(cmd, err);
    return H;
  });

  // ── !aw / !autowarden ─────────────────────────────────────────────────────
  on(["sm_aw", "sm_autowarden"], (cmd) => {
    const slot = cmd.callerSlot;
    if (slot < 0) return H;
    if (!hasFlagLetters(slot, cfg.autoWardenFlag)) {
      reply(cmd, msgFor(cmd.callerSlot).noPermission(cfg.autoWardenFlag));
      return H;
    }
    reply(cmd, toggleAutoWarden(slot));
    return H;
  });

  // ── debug: sm_markst <target> (C# `css_debug st`) ─────────────────────────
  command.admin("sm_markst", ADMFLAG.ROOT, (cmd) => {
    if (cmd.argCount === 0) {
      cmd.reply(phraseFor(cmd.callerSlot,"JB_WARDEN_CHAT_SPECIFY_TARGET"));
      return H;
    }
    const targets = Player.target(cmd.arg(0), cmd.callerSlot, true);
    if (targets.length === 0) {
      cmd.reply(msgFor(cmd.callerSlot).playerNotFound(cmd.arg(0)));
      return H;
    }
    for (const p of targets) setSpecialTreatment(p.slot, !isSpecialTreatment(p.slot));
    const label = targets.length === 1 ? (targets[0].playerName ?? "") : `${targets.length} players`;
    cmd.reply(phraseFor(cmd.callerSlot,"JB_WARDEN_CHAT_TOGGLED_SPECIAL_TREATMENT_FOR", String(label)));
    return H;
  });
}

/** Countdown permission + its peace mute (C# PermCheckAndEnactPeace). */
function countdownPeace(slot: number, cmd: CommandInvocation): boolean {
  if (slot < 0 || hasFlags(slot, ADMFLAG.CHEATS)) {
    peaceMute("admin");
    lastCountdownMs = Date.now();
    return true;
  }
  const fromWarden = isWarden(slot);
  if (!fromWarden && hasFlags(slot, ADMFLAG.CHAT)) {
    peaceMute("admin");
    lastCountdownMs = Date.now();
    return true;
  }
  const since = Date.now() - lastCountdownMs;
  if (since < 60000) {
    reply(cmd, msgFor(cmd.callerSlot).onCooldown(Math.ceil((60000 - since) / 1000)));
    return false;
  }
  if (!fromWarden) {
    reply(cmd, msgFor(cmd.callerSlot).notWarden);
    return false;
  }
  peaceMute("warden");
  lastCountdownMs = Date.now();
  return true;
}

/** Spawn a prop at the warden's feet (chicken / soccer ball), capped per round. */
function spawnForWarden(
  cmd: CommandInvocation,
  className: string,
  kv: Record<string, string>,
  underCap: () => boolean,
  count: () => void,
  text: { tooMany: string; failed: string; spawned: (slot:number)=>string },
): void {
  const slot = cmd.callerSlot;
  if (slot < 0) return;
  if (!isWarden(slot)) {
    reply(cmd, msgFor(cmd.callerSlot).notWarden);
    return;
  }
  if (!underCap()) {
    reply(cmd, text.tooMany);
    return;
  }
  const o = Player.fromSlot(slot)?.pawn?.origin;
  if (!o) {
    reply(cmd, text.failed);
    return;
  }
  const ent = createEntity(className, { ...kv, origin: `${o.x} ${o.y} ${o.z}` });
  if (!ent) {
    reply(cmd, text.failed);
    return;
  }
  ent.teleport([o.x, o.y, o.z], null, null);
  broadcastText(text.spawned);
  count();
}
