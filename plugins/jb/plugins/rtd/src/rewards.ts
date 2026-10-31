/**
 * What each reward does in game (the C# `Rewards/*.cs`). The pool itself — names, weights, team
 * restrictions — is data in pool.ts; here each spec gets `enabled` / `prepare` / `grant`.
 *
 * Lifecycle (C# IRTDReward): `prepare` runs when the player rolls (credits are paid right then),
 * `grant` runs shortly after the player's next spawn, only while they are alive.
 */
import { Chat, Entity, after } from "@s2script/sdk";
import { Player } from "@s2script/cs2";
import type { Pawn } from "@s2script/cs2";
import { Colors, Team, isAlive, setPawnColor } from "@edgegamers/jailbreak-shared";
import { giveBomb, skipRandomBombNextRound } from "@edgegamers/jailbreak-core";
import type { Rgb } from "@edgegamers/jailbreak-shared";
import { POOL, isJackpot, requiredTeam, rewardDescription, rewardName } from "./pool.ts";
import type { RewardSpec } from "./pool.ts";
import { WEAPON_GROUPS, isKnife } from "./weapons.ts";
import { addSpy, addTickBlock, blockGroup } from "./effects.ts";
import { deps, gangsReady } from "./deps.ts";
import { msg } from "./messages.ts";

export interface Reward {
  /** Index into POOL (stable; used for hot-reload handoff). */
  readonly poolIndex: number;
  readonly spec: RewardSpec;
  readonly weight: number;
  readonly name: string;
  /** Chat-ready second line. */
  readonly description: string;
  /** In the pool right now (optional provider present, …). */
  enabled(): boolean;
  /** May this player receive it (team restriction)? */
  canGrant(player: Player): boolean;
  /** At roll time. False = the roll is refused and nothing is stored. */
  prepare(player: Player): boolean;
  /** At spawn time; the player is alive. */
  grant(player: Player): boolean;
}

function teamOk(spec: RewardSpec, player: Player): boolean {
  const team = requiredTeam(spec);
  if (team === null) return true;
  return player.teamNum === (team === "prisoner" ? Team.Prisoner : Team.Guard);
}

function enabledFor(spec: RewardSpec): boolean {
  switch (spec.kind) {
    case "credit":
      return gangsReady();
    case "guaranteedWarden":
      return deps.warden !== null;
    default:
      return true;
  }
}

function prepareFor(spec: RewardSpec, player: Player): boolean {
  if (spec.kind === "bomb") {
    // C# BombReward.PrepareReward: no random round-start bomb next round (this player gets it).
    skipRandomBombNextRound();
    return true;
  }
  if (spec.kind !== "credit") return true;
  // C#: credits are paid at roll time, not at spawn.
  if (!gangsReady() || deps.gangs === null) return false;
  try {
    deps.gangs.grantPlayer(player.steamId, spec.amount, "rtd");
  } catch {
    return false;
  }
  if (isJackpot(spec)) Chat.toAll(msg.jackpot(player.playerName ?? "", spec.amount));
  return true;
}

/** Re-resolve a player by userId later and strip their weapons (C# NoWeaponReward ran 64/128/256 ticks later). */
function stripLater(userId: number, delaysMs: number[]): void {
  for (const ms of delaysMs) {
    after(ms, () => {
      const p = Player.fromUserId(userId);
      if (p && isAlive(p)) p.pawn?.stripWeapons();
    });
  }
}

function tint(pawn: Pawn, color: Rgb, alpha: number): boolean {
  // C# SetColor: an opaque colour keeps the pawn's current alpha.
  const current = pawn.render;
  const a = alpha === 255 && current !== null ? (current >>> 24) & 0xff : alpha;
  return setPawnColor(pawn, color, a);
}

const SPAWN_CLASSES = ["info_teleport_destination", "info_player_terrorist", "info_player_counterterrorist"];

function randomTeleport(pawn: Pawn): boolean {
  const points: number[][] = [];
  for (const cls of SPAWN_CLASSES) {
    for (const ref of Entity.findByClass(cls)) {
      const o = ref.origin;
      if (o) points.push([o.x, o.y, o.z]);
    }
  }
  if (points.length === 0) return false;
  return pawn.ref.teleport(points[Math.floor(Math.random() * points.length)]);
}

function grantFor(spec: RewardSpec, player: Player): boolean {
  const pawn = player.pawn;
  if (!pawn || !pawn.isValid) return false;
  switch (spec.kind) {
    case "nothing":
    case "credit": // already paid in prepare
      return true;
    case "weapon":
      return pawn.giveNamedItem(spec.weapon) !== null;
    case "ammoWeapon": {
      const w = pawn.giveNamedItem(spec.weapon);
      // Reserve ammo is not settable in this SDK (Weapon.setAmmo defers `reserve`); clip only.
      return w !== null && w.setAmmo(spec.primary, spec.secondary);
    }
    case "fakeBomb":
      return pawn.giveNamedItem("weapon_c4") !== null;
    case "hp":
      pawn.health = spec.hp;
      return true;
    case "armor":
      pawn.armorValue = spec.armor;
      return true;
    case "cannotUse": {
      blockGroup(player.userId, spec.group);
      const items = WEAPON_GROUPS[spec.group].items;
      if ([...items].some((w) => isKnife(w))) pawn.stripWeapons();
      return true;
    }
    case "cannotScope":
      addTickBlock("scope", player.userId);
      return true;
    case "cannotLeftKnife":
      addTickBlock("leftKnife", player.userId);
      return true;
    case "cannotRightKnife":
      addTickBlock("rightKnife", player.userId);
      return true;
    case "noWeapon":
      stripLater(player.userId, [1000, 2000, 4000]);
      return true;
    case "color":
      return tint(pawn, Colors.Green, 255);
    case "transparent":
      return tint(pawn, Colors.White, 70);
    case "guaranteedWarden":
      if (deps.warden === null) return false;
      try {
        return deps.warden.guaranteeWarden(player.steamId);
      } catch {
        return false;
      }
    case "chatSpy":
      addSpy(player.userId);
      return true;
    case "randomTeleport":
      return randomTeleport(pawn);
    case "bomb": {
      // C# BombReward.GrantReward: core's jihad C4 64 ticks (1 s) later. Fake Bomb stays a plain C4.
      const userId = player.userId;
      after(1000, () => {
        const p = Player.fromUserId(userId);
        if (p) giveBomb(p.slot);
      });
      return true;
    }
  }
}

function build(spec: RewardSpec, weight: number, poolIndex: number): Reward {
  return {
    poolIndex,
    spec,
    weight,
    name: rewardName(spec),
    description: rewardDescription(spec, (t, c) => `${msg.colorCode[c]}${t}${msg.grey}`),
    enabled: () => enabledFor(spec),
    canGrant: (p) => teamOk(spec, p),
    prepare: (p) => prepareFor(spec, p),
    grant: (p) => grantFor(spec, p),
  };
}

/** Every reward, in pool order (including currently-disabled ones). */
export const REWARDS: readonly Reward[] = POOL.map((e, i) => build(e.spec, e.weight, i));

/** The rewards in the pool right now (C# `generator.ToList()`); indices shown by !rtdstats. */
export function enabledRewards(): Reward[] {
  return REWARDS.filter((r) => r.enabled());
}
