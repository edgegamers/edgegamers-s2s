import {logEntry} from '@edgegamers/jailbreak-shared';
import {forRecipients} from '@edgegamers/jailbreak-shared';
import {plainPhraseFor as labelFor,phraseFor} from '@edgegamers/jailbreak-shared';
import {broadcastText} from '@edgegamers/jailbreak-shared';
/**
 * LR rebel (C# `LastRequestRebelCommand` / `LastRequestRebelManager`): the last prisoner alive may
 * `!rebel` instead of taking an LR — they become a rebel with HP pooled from the living guards and
 * a heavy weapon. Dropping a weapon afterwards takes their HP back down to what they had before.
 */
import { Chat } from "@s2script/sdk";
import type { CommandInvocation } from "@s2script/sdk";
import { Player } from "@s2script/cs2";
import { isAlive, Team } from "@edgegamers/jailbreak-shared";
import { log, markRebel } from "@edgegamers/jailbreak-core";
import { rebelHealth } from "./logic";
import { isEnabled, isInLR } from "./manager";
import { closeMenu } from "./menus";
import { msgFor } from "./messages";
import { Participant } from "./players";
import { settings } from "./settings";

const rebelling = new Set<number>();
/** slot → HP before rebelling (consumed by the first weapon drop). */
const healthBefore = new Map<number, number>();

export const isRebelling = (slot: number): boolean => rebelling.has(slot);

/** `!rebel`. */
export function rebelCommand(cmd: CommandInvocation): void {
  const slot = cmd.callerSlot;
  const p = Player.fromSlot(slot);
  if (!p) return;
  const tell = (m: string): void => cmd.replyToChat(m);

  if (!settings.rebelOn) return tell(msgFor(slot).rebelDisabled());
  if (p.teamNum !== Team.Prisoner) return tell(msgFor(slot).rebelCt());
  if (!isEnabled() || !isAlive(p)) return tell(msgFor(slot).notEnabled());
  if (isInLR(slot) || isRebelling(slot)) return tell(msgFor(slot).cannotLR(labelFor(slot,"JB_LASTREQUEST_LABEL_YOU_ARE_ALREADY_IN_AN_LR")));
  const alivePrisoners = Player.all().filter((q) => q.teamNum === Team.Prisoner && isAlive(q)).length;
  if (alivePrisoners > 1) return tell(msgFor(slot).cannotLR(labelFor(slot,"JB_LASTREQUEST_LABEL_YOU_MUST_BE_THE_LAST_ALIVE_TO_REBEL")));

  healthBefore.set(slot, p.pawn?.health ?? 0);
  startRebelling(p);
}

/** C# `StartLRRebelling`. */
export function startRebelling(p: Player): void {
  closeMenu(p.slot);
  const me = Participant.of(p);
  const guardHealths = Player.all()
    .filter((q) => q.teamNum === Team.Guard && isAlive(q))
    .map((q) => q.pawn?.health ?? 0);
  const hp = p.pawn
    ? rebelHealth(guardHealths, p.pawn.health ?? 0, settings.rebelCtMaxHp, settings.rebelTHpRatio, settings.rebelTMaxHp)
    : 101;

  broadcastText(forRecipients((recipient,value0,value1) => msgFor(recipient).rebel(value0, value1), me.name,hp));
  markRebel(p.slot, 0, "lastrequest");
  rebelling.add(p.slot);

  me.setHealth(hp);
  me.strip();
  me.give(settings.rebelWeapon);
  me.give("weapon_knife");
  log(...logEntry("JB_LOG_CHOSE_TO_LR_REBEL_WITH_HP", [String(me.name), String(hp)]));
}

/** A rebel dropped a weapon: HP back down to what they had before rebelling (once). */
export function onWeaponDrop(owner: Player): void {
  const hp = healthBefore.get(owner.slot);
  if (hp === undefined) return;
  healthBefore.delete(owner.slot);
  const pawn = owner.pawn;
  if (pawn && pawn.health !== null) pawn.health = Math.min(hp, pawn.health);
}

export function onDisconnect(slot: number): void {
  rebelling.delete(slot);
  healthBefore.delete(slot);
}

/** Round end (C# `OnRoundEnd`). */
export function reset(): void {
  rebelling.clear();
  healthBefore.clear();
}
