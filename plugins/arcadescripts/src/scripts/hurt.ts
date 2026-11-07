// ArcadeScripts for s2script. Derived from ArcadeScripts-CSS by Supergosciuツ (GPL-3.0).
// See LICENSE and NOTICE. Port of Scripts/Hurt/Hurt.cs (hurt.nut).
//
// Upstream spawns one point_hurt per damage profile, renames it to a custom weapon class for the
// kill feed, sets its owner, and rewrites the attacker in an OnTakeDamage hook. s2script cannot
// rename an entity's class or write its owner handle, so this port deals the same damage directly
// through the game's damage path with the same attacker. Kill credit is preserved; the custom
// kill-feed icons are not.
import type { EntityRef } from '@s2script/sdk';
import type { Pawn } from '@s2script/cs2';
import { Script } from '../script';
import type { Runtime } from '../runtime';
import { pawnOf, players, randomInt, same } from '../util';

const DAMAGE_TYPE = 16;
/** Damage per hurter key (upstream point_hurt `damage` keyvalues). */
const HURTERS: Readonly<Record<string, number>> = { '1': 500, '2': 9, '3': 3, '4': 20, '5': 10, '6': 500 };

export class Hurt extends Script {
  private readonly attackers = new Map<string, Pawn>();

  constructor(owner: EntityRef, rt: Runtime) {
    super(owner, rt);
    this.fn('HurtActivator', ['entity', 'string'], this.hurtActivator);
    this.fn('SetAttacker', ['entity', 'string'], this.setAttacker);
    this.constants = { HurterOne: '1', HurterTwo: '2', HurterThree: '3', HurterFour: '4', HurterFive: '5', HurterSix: '6' };
  }

  hurtActivator(activator: EntityRef | null, hurter: string): void {
    const pawn = pawnOf(activator);
    if (pawn) this.hurtPlayer(hurter, pawn);
  }

  setAttacker(activator: EntityRef | null, hurter: string): void {
    const pawn = pawnOf(activator);
    if (pawn) this.attackers.set(hurter, pawn);
  }

  private otherPlayer(target: Pawn): Pawn | null {
    const others = players().filter(({ player, pawn }) =>
      player.pawnIsAlive === true && player.teamNum !== target.teamNum && !same(pawn.ref, target.ref));
    return others.length === 0 ? null : others[randomInt(0, others.length - 1)]!.pawn;
  }

  hurtPlayer(hurter: string, target: Pawn): void {
    const damage = HURTERS[hurter];
    if (damage === undefined) throw new Error(`unknown hurter ${hurter}`);
    const stored = this.attackers.get(hurter);
    const attacker = (stored?.isValid ? stored : null) ?? this.otherPlayer(target) ?? target;
    target.ref.takeDamage(damage, { attacker: attacker.ref, inflictor: attacker.ref, damageType: DAMAGE_TYPE, position: target.origin ? [target.origin.x, target.origin.y, target.origin.z] : null });
  }
}
