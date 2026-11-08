// ArcadeScripts for s2script. Derived from ArcadeScripts-CSS by Supergosciuツ (GPL-3.0).
// See LICENSE and NOTICE. Port of Scripts/Surf/Surf.cs (surf.nut).
import type { EntityRef } from '@s2script/sdk';
import { Script } from '../script';
import type { Runtime } from '../runtime';
import { fire, teleport, vec } from '../util';
import { clamp, damageTexture, routeWinners } from './podium';

const DESTINATIONS = ['decathlon_destination1', 'decathlon_destination2', 'decathlon_destination3', 'decathlon_destination4', 'decathlon_destination5'];

export class Surf extends Script {
  private damage = 0;
  private winners = 0;
  private winnersSetting = 4;
  private damageSign: EntityRef | null = null;
  private winnersSign: EntityRef | null = null;
  private damageTrigger: EntityRef | null = null;

  constructor(owner: EntityRef, rt: Runtime) {
    super(owner, rt);
    this.fn('AddToWinnersSetting', ['int'], this.addToWinnersSetting);
    this.fn('AddToDamage', ['int'], this.addToDamage);
    this.fn('StopActivator', ['entity'], this.stopActivator);
    this.fn('ResetWinners', [], this.resetWinners);
    this.fn('AddToWinners', [], this.addToWinners);
    this.entityNames = ['surf_damage_sign_model', 'surf_damage', 'surf_winners_sign_model', ...DESTINATIONS, 'surf_winner_tp'];
  }

  override onAllEntitiesSpawned(): void {
    this.damageSign = this.first('surf_damage_sign_model');
    this.damageTrigger = this.first('surf_damage');
    this.winnersSign = this.first('surf_winners_sign_model');
  }

  addToDamage(delta: number): void {
    this.damage = clamp(this.damage + delta, 0, 20);
    fire(this.damageSign, 'Skin', { value: damageTexture(this.damage) });
    fire(this.damageTrigger, this.damage === 0 ? 'Disable' : 'Enable');
    fire(this.damageTrigger, 'SetDamage', { value: String(this.damage * 2) });
  }

  stopActivator(activator: EntityRef | null): void {
    if (activator) teleport(activator, null, null, vec(0, 0, 0));
  }

  private updateTeleports(): void {
    routeWinners(DESTINATIONS.map((n) => this.first(n)), this.winners, this.winnersSetting, [this.first('surf_winner_tp')]);
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
}
