// ArcadeScripts for s2script. Derived from ArcadeScripts-CSS by Supergosciuツ (GPL-3.0).
// See LICENSE and NOTICE. Port of Scripts/CellRewards/CellRewards.cs (cellrewards).
import type { EntityRef } from '@s2script/sdk';
import { Script } from '../script';
import type { Runtime } from '../runtime';
import { fire, keyOf, originOf, pawnOf, randomFloat, randomInt, setTarget, teleport, valid } from '../util';

const ODDS_DOUBLE_ARMORY = 0.0625;
const ODDS_SINGLE_ARMORY = 0.25;
const ODDS_DOUBLE_MAP = 0.0625;
const ODDS_SINGLE_MAP = 0.6875;
const ODDS_DOUBLE_GUN = 0.0625;
const ODDS_SINGLE_GUN = 0.626;

const GUN_TEMPLATES: Readonly<Record<string, string>> = {
  cell_vent_glock_template: 'cell_vent_glock',
  cell_vent_p250_template: 'cell_vent_p250',
  cell_vent_hkp_template: 'cell_vent_hkp',
};

/** 2 with the double odds, else 1 with the single odds, else 0 (each roll is independent, as upstream). */
const roll = (double: number, single: number): number =>
  randomFloat(0, 1) < double ? 2 : randomFloat(0, 1) < single ? 1 : 0;

export class CellRewards extends Script {
  private armoryLeft = 0;
  private mapLeft = 0;
  private gunsLeft = 0;
  private armorLeft = 0;
  private gunTemplates: { template: EntityRef; gun: string }[] = [];
  private readonly winners = new Set<string>();
  private decoys: EntityRef[] = [];
  private tps: EntityRef[] = [];
  private triggers: EntityRef[] = [];
  private decoyTemplate: EntityRef | null = null;
  private readonly gunEntities = new Map<string, EntityRef>();
  private readonly gunWinners = new Map<string, EntityRef>();

  constructor(owner: EntityRef, rt: Runtime) {
    super(owner, rt);
    this.fn('Setup', [], this.setup);
    this.fn('UseTeleport', ['entity'], this.useTeleport);
    this.fn('ReceiveGun', ['entity'], this.receiveGun);
    this.fn('DisableRewards', [], this.disableRewards);
    this.entityNames = ['cell_vent_tp', 'cell_vent_trigger', ...Object.keys(GUN_TEMPLATES), 'cell_vent_decoy_template'];
  }

  override onAllEntitiesSpawned(): void {
    this.tps = [...this.all('cell_vent_tp')];
    this.triggers = [...this.all('cell_vent_trigger')];
    for (const [name, gun] of Object.entries(GUN_TEMPLATES)) {
      for (const template of this.all(name)) this.gunTemplates.push({ template, gun });
    }
    this.decoyTemplate = this.first('cell_vent_decoy_template');
  }

  override onEntitySpawned(entity: EntityRef): void {
    const name = entity.name;
    if (!name) return;
    if (Object.values(GUN_TEMPLATES).includes(name)) this.gunEntities.set(name, entity);
    if (name.startsWith('cell_vent_decoy')) this.decoys.push(entity);
  }

  setup(): void {
    this.armoryLeft = roll(ODDS_DOUBLE_ARMORY, ODDS_SINGLE_ARMORY);
    this.mapLeft = roll(ODDS_DOUBLE_MAP, ODDS_SINGLE_MAP);
    const guns = roll(ODDS_DOUBLE_GUN, ODDS_SINGLE_GUN);
    if (guns > 0) this.gunsLeft = guns;
    this.armorLeft = 3;
    this.updateTeleportsAndTriggers();
  }

  private updateTeleportsAndTriggers(): void {
    if (this.armoryLeft > 0) return;
    if (this.mapLeft > 0) {
      for (const tp of this.tps) setTarget(tp, 'cell_vent_tpdest');
      return;
    }
    for (const tp of this.tps) fire(tp, 'Disable');
    // Small delay so the teleported player does not also get a gun.
    for (const trigger of this.triggers) fire(trigger, 'Enable', { delay: 0.1 });
  }

  disableRewards(): void {
    this.armoryLeft = 0;
    this.mapLeft = 0;
    this.gunsLeft = 0;
    for (const tp of this.tps) fire(tp, 'Disable');
    for (const trigger of this.triggers) fire(trigger, 'Disable');
  }

  useTeleport(activator: EntityRef | null): void {
    if (!activator) return;
    this.winners.add(keyOf(activator));
    if (this.armoryLeft > 0) this.armoryLeft--;
    else if (this.mapLeft > 0) this.mapLeft--;
    this.updateTeleportsAndTriggers();
  }

  receiveGun(activator: EntityRef | null): void {
    const pawn = pawnOf(activator);
    if (!pawn || this.winners.has(keyOf(pawn.ref))) return;
    this.winners.add(keyOf(pawn.ref));
    if (this.gunsLeft === 0 || this.gunTemplates.length === 0) {
      this.receiveDecoy(pawn.ref);
      if (this.armorLeft > 0) {
        pawn.giveNamedItem('item_assaultsuit');
        this.armorLeft--;
      }
      return;
    }
    const index = randomInt(0, this.gunTemplates.length - 1);
    const { template, gun } = this.gunTemplates[index]!;
    this.gunTemplates.splice(index, 1);
    fire(template, 'ForceSpawn');
    this.after(0.05, () => this.teleportGun(gun));
    this.gunWinners.set(gun, pawn.ref);
    this.gunsLeft--;
  }

  private teleportGun(gun: string): void {
    const winner = this.gunWinners.get(gun);
    const weapon = this.gunEntities.get(gun);
    if (!valid(winner) || !weapon) return;
    teleport(weapon, originOf(winner));
  }

  private receiveDecoy(activator: EntityRef): void {
    fire(this.decoyTemplate, 'ForceSpawn');
    this.after(0.05, () => {
      const decoy = this.decoys[0];
      if (!valid(decoy)) return;
      this.decoys.shift();
      teleport(decoy, originOf(activator));
    });
  }
}
