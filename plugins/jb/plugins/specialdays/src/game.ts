/**
 * Thin engine helpers the days share (the C# PlayerExtensions / RoundUtil / PlayerUtil bits).
 * Every helper re-checks the pawn and degrades to a no-op on a stale player.
 */
import { Chat, Clients, Entity, Server } from "@s2script/sdk";
import type { EntityRef } from "@s2script/sdk";
import { GameRules, MoveType_t, Player } from "@s2script/cs2";
import type { Pawn } from "@s2script/cs2";
import { alivePlayers, isAlive, setPawnColor, Team, teamColored as teamColoredName } from "@edgegamers/jailbreak-shared";
import type { Rgb } from "@edgegamers/jailbreak-shared";
import type { Vec3 } from "./geometry.ts";
import { pickupBypass } from "./pickup.ts";

export { isAlive, Team };

/** Every living player (optionally one team). */
export const alive = (teamNum?: number): Player[] => alivePlayers(teamNum);
/** Every connected player on T or CT. */
export const playing = (): Player[] =>
  Player.all().filter((p) => p.teamNum === Team.Prisoner || p.teamNum === Team.Guard);
export const onTeam = (teamNum: number): Player[] => Player.all().filter((p) => p.teamNum === teamNum);

/** A live, fully spawned pawn, or null. */
export function livePawn(p: Player | null | undefined): Pawn | null {
  const pawn = p?.pawn ?? null;
  return pawn && pawn.isValid ? pawn : null;
}

export function originOf(p: Player | null | undefined): Vec3 | null {
  const o = livePawn(p)?.origin;
  return o ? { x: o.x, y: o.y, z: o.z } : null;
}

export function teleport(p: Player, to: Vec3, zeroVelocity = false): void {
  livePawn(p)?.ref.teleport([to.x, to.y, to.z], null, zeroVelocity ? [0, 0, 0] : null);
}

/** Set the absolute velocity. */
export function setVelocity(p: Player, v: Vec3): void {
  livePawn(p)?.ref.teleport(null, null, [v.x, v.y, v.z]);
}

/** PlayerExtensions.Freeze / UnFreeze. */
export function freeze(p: Player): void {
  const pawn = livePawn(p);
  if (pawn) pawn.moveType = MoveType_t.OBSOLETE;
}
export function unfreeze(p: Player): void {
  const pawn = livePawn(p);
  if (pawn) pawn.moveType = MoveType_t.WALK;
}

/** PlayerExtensions.SetSpeed (velocity modifier). */
export function setSpeed(p: Player, speed: number): void {
  const pawn = livePawn(p);
  if (pawn) pawn.velocityModifier = speed;
}

export function setHealth(p: Player, hp: number): void {
  const pawn = livePawn(p);
  if (pawn) pawn.health = hp;
}
export function setMaxHealth(p: Player, hp: number): void {
  const pawn = livePawn(p);
  if (pawn) pawn.maxHealth = hp;
}
export function setArmor(p: Player, armor: number): void {
  const pawn = livePawn(p);
  if (pawn) pawn.armorValue = armor;
}

/** Tint the player (alpha < 255 is see-through). */
export function setColor(p: Player, color: Rgb, alpha = 255): void {
  setPawnColor(livePawn(p), color, alpha);
}

/** Pawn.TakesDamage (C# Enable/DisableDamage). */
export function setTakesDamage(p: Player, takes: boolean): void {
  const pawn = livePawn(p);
  if (pawn) pawn.takesDamage = takes;
}

export function strip(p: Player): void {
  livePawn(p)?.stripWeapons();
}

/** Give an item. Our own gives skip our pickup gate (the C# hooked CanAcquire after its own gives). */
export function give(p: Player, item: string): void {
  const pawn = livePawn(p);
  if (!pawn || item === "") return;
  pickupBypass(() => pawn.giveNamedItem(item));
}

/** Kill the player (CommitSuicide). */
export function slay(p: Player): void {
  livePawn(p)?.slay();
}

/** Teleport `p` onto `target`'s position. */
export function teleportOnto(p: Player, target: Player): void {
  const o = originOf(target);
  if (o) teleport(p, o);
}

// ── chat ─────────────────────────────────────────────────────────────────────────────────────────

export function toAll(lines: string | readonly string[]): void {
  for (const l of typeof lines === "string" ? [lines] : lines) Chat.toAll(l);
}
export function toSlot(slot: number, lines: string | readonly string[]): void {
  for (const l of typeof lines === "string" ? [lines] : lines) Chat.toSlot(slot, l);
}
export function toTeam(teamNum: number, lines: string | readonly string[]): void {
  for (const p of onTeam(teamNum)) toSlot(p.slot, lines);
}

// ── round clock (RoundUtil) ──────────────────────────────────────────────────────────────────────

export function timeRemaining(): number {
  return Math.floor(GameRules.get()?.timeRemaining ?? 0);
}
export function setTimeRemaining(seconds: number): void {
  GameRules.get()?.setTimeRemaining(seconds);
}
export function addTimeRemaining(seconds: number): void {
  GameRules.get()?.addTimeRemaining(seconds);
}
export function timeElapsed(): number {
  return GameRules.get()?.timeElapsed ?? 0;
}

/** Server time in seconds (C# Server.CurrentTime). */
export const now = (): number => Server.gameTime;

// ── map points ───────────────────────────────────────────────────────────────────────────────────

/** Origins of every entity of a class (spawn points, teleport destinations). */
export function originsOf(className: string): Vec3[] {
  const out: Vec3[] = [];
  for (const ref of Entity.findByClass(className)) {
    const o = ref.origin;
    if (o) out.push({ x: o.x, y: o.y, z: o.z });
  }
  return out;
}
export const tSpawns = (): Vec3[] => originsOf("info_player_terrorist");
export const ctSpawns = (): Vec3[] => originsOf("info_player_counterterrorist");
export const teleportDestinations = (): Vec3[] => originsOf("info_teleport_destination");


/** "Name" coloured by team, for chat. */
export function nameOf(p: Player): string {
  return teamColoredName(p.playerName ?? "?", p.teamNum);
}

/** Bots have no client console and are skipped by the C# `IsReal()` checks. */
export function isBot(p: Player): boolean {
  return Clients.fromSlot(p.slot)?.isBot ?? false;
}

/** The player whose pawn is `ref` (damage attackers/victims are pawn refs), or null. */
export function playerOfPawn(ref: EntityRef | null): Player | null {
  if (!ref) return null;
  for (const p of Player.all()) {
    const pawn = p.pawn;
    if (pawn && pawn.ref.index === ref.index && pawn.ref.id === ref.id) return p;
  }
  return null;
}
