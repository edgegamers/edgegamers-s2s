// ArcadeScripts for s2script. Derived from ArcadeScripts-CSS by Supergosciuツ (GPL-3.0).
// See LICENSE and NOTICE. Port of Scripts/Decathlon/Decathlon.cs (decathlon.nut).
import type { EntityRef } from '@s2script/sdk';
import { Script } from '../script';
import type { Runtime } from '../runtime';
import { fire } from '../util';
import { clamp, damageTexture, routeWinners } from './podium';

const DESTINATIONS = ['decathlon_destination1', 'decathlon_destination2', 'decathlon_destination3', 'decathlon_destination4', 'decathlon_destination5'];

export class Decathlon extends Script {
  private damage = 0;
  private winners = 0;
  private winnersSetting = 4;
  private damageTriggers: EntityRef[] = [];
  private damageSign: EntityRef | null = null;
  private winnersSign: EntityRef | null = null;

  constructor(owner: EntityRef, rt: Runtime) {
    super(owner, rt);
    this.fn('AddToWinnersSetting', ['int'], this.addToWinnersSetting);
    this.fn('AddToDamage', ['int'], this.addToDamage);
    this.fn('ResetWinners', [], this.resetWinners);
    this.fn('AddToWinners', [], this.addToWinners);
    this.entityNames = ['decathlon_damage_sign_model', 'decathlon_damage', 'decathlon_winners_sign_model', ...DESTINATIONS, 'decathlon_winner_tp'];
  }

  override onAllEntitiesSpawned(): void {
    this.damageSign = this.first('decathlon_damage_sign_model');
    this.damageTriggers = [...this.all('decathlon_damage')];
    this.winnersSign = this.first('decathlon_winners_sign_model');
  }

  addToDamage(delta: number): void {
    this.damage = clamp(this.damage + delta, 0, 20);
    fire(this.damageSign, 'Skin', { value: damageTexture(this.damage) });
    for (const trigger of this.damageTriggers) fire(trigger, this.damage === 0 ? 'Disable' : 'Enable');
    for (const trigger of this.damageTriggers) fire(trigger, 'SetDamage', { value: String(this.damage * 2) });
  }

  private updateTeleports(): void {
    routeWinners(DESTINATIONS.map((n) => this.first(n)), this.winners, this.winnersSetting, [this.first('decathlon_winner_tp')]);
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
