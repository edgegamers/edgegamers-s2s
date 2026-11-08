// ArcadeScripts for s2script. Derived from ArcadeScripts-CSS by Supergosciuツ (GPL-3.0).
// See LICENSE and NOTICE. Port of Scripts/StrafeJump/StrafeJump.cs (strafe_jump.nut).
import type { EntityRef } from '@s2script/sdk';
import { Script } from '../script';
import type { Runtime } from '../runtime';
import { fire, inBox, originOf, pawnAlive, players, teleport, vec, velocityOf } from '../util';
import { clamp, damageTexture, routeWinners } from './podium';

const DESTINATIONS = ['blob_teleport1', 'blob_teleport2', 'blob_teleport3', 'blob_teleport4', 'blob_teleport5'];
const HURT_TRIGGERS = ['sj_easy_damage', 'sj_medium_damage', 'sj_hard_damage', 'sj_fail_damage'];
/** The easy and hard strafe-jump courses (shared with Lunge and Flight). */
export const STRAFE_JUMP_AREAS = [
  [vec(1024, -1312, -16072), vec(1536, -800, -511)],
  [vec(1088, -6720, -16072), vec(1600, -6208, 16000)],
] as const;

export class StrafeJump extends Script {
  private damage = 0;
  private winners = 0;
  private winnersSetting = 4;
  private hurtTriggers: (EntityRef | null)[] = [];
  private damageSign: EntityRef | null = null;
  private winnersSign: EntityRef | null = null;

  constructor(owner: EntityRef, rt: Runtime) {
    super(owner, rt);
    this.fn('Recall', [], this.recall);
    this.fn('AddToWinnersSetting', ['int'], this.addToWinnersSetting);
    this.fn('StopActivatorZ', ['entity'], this.stopActivatorZ);
    this.fn('AddToDamage', ['int'], this.addToDamage);
    this.fn('ResetWinners', [], this.resetWinners);
    this.fn('AddToWinners', [], this.addToWinners);
    this.entityNames = [...HURT_TRIGGERS, 'sj_damage_sign_model', 'sj_winners_sign_model', ...DESTINATIONS, 'sj_easy_win_teleport', 'sj_hard_win_teleport', 'sj_tp_dest'];
  }

  override onAllEntitiesSpawned(): void {
    this.hurtTriggers = HURT_TRIGGERS.map((n) => this.first(n)).filter((e) => e !== null);
    this.damageSign = this.first('sj_damage_sign_model');
    this.winnersSign = this.first('sj_winners_sign_model');
  }

  private updateTeleports(): void {
    routeWinners(DESTINATIONS.map((n) => this.first(n)), this.winners, this.winnersSetting,
      [this.first('sj_easy_win_teleport'), this.first('sj_hard_win_teleport')]);
  }

  addToWinners(): void {
    this.winners++;
    this.updateTeleports();
  }

  resetWinners(): void {
    this.winners = 0;
    this.updateTeleports();
  }

  addToWinnersSetting(delta: number): void {
    this.winnersSetting = clamp(this.winnersSetting + delta, 1, 32);
    fire(this.winnersSign, 'Skin', { value: String(this.winnersSetting) });
    if (this.winners > 0) this.updateTeleports();
  }

  addToDamage(delta: number): void {
    this.damage = clamp(this.damage + delta, 0, 20);
    fire(this.damageSign, 'Skin', { value: damageTexture(this.damage) });
    for (const trigger of this.hurtTriggers) fire(trigger, 'SetDamage', { value: String(this.damage * 2) });
  }

  stopActivatorZ(activator: EntityRef | null): void {
    const v = velocityOf(activator);
    if (v) teleport(activator, null, null, vec(v.x, v.y, 0));
  }

  recall(): void {
    const destination = originOf(this.first('sj_tp_dest'));
    for (const { pawn } of players()) {
      const origin = pawn.origin;
      if (pawnAlive(pawn) && origin && STRAFE_JUMP_AREAS.some(([min, max]) => inBox(origin, min, max))) {
        teleport(pawn.ref, destination, null, vec(0, 0, 0));
      }
    }
  }
}
