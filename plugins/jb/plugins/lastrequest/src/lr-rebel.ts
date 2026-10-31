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
import { msg } from "./messages";
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

  if (!settings.rebelOn) return tell(msg.rebelDisabled());
  if (p.teamNum !== Team.Prisoner) return tell(msg.rebelCt());
  if (!isEnabled() || !isAlive(p)) return tell(msg.notEnabled());
  if (isInLR(slot) || isRebelling(slot)) return tell(msg.cannotLR("You are already in an LR"));
  const alivePrisoners = Player.all().filter((q) => q.teamNum === Team.Prisoner && isAlive(q)).length;
  if (alivePrisoners > 1) return tell(msg.cannotLR("You must be the last alive to !rebel"));

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

  Chat.toAll(msg.rebel(me.name, hp));
  markRebel(p.slot, 0, "lastrequest");
  rebelling.add(p.slot);

  me.setHealth(hp);
  me.strip();
  me.give(settings.rebelWeapon);
  me.give("weapon_knife");
  log(`${me.name} chose to LR rebel with ${hp} HP`);
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
