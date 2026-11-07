// ArcadeScripts for s2script. Derived from ArcadeScripts-CSS by Supergosciuツ (GPL-3.0).
// See LICENSE and NOTICE. Port of Scripts/ItemInArea/ItemInArea.cs (item_in_area.nut).
import type { EntityRef } from '@s2script/sdk';
import { Script } from '../script';
import type { Runtime } from '../runtime';
import { fire, same } from '../util';

export class ItemInArea extends Script {
  private trigger: EntityRef | null = null;
  private template: EntityRef | null = null;

  constructor(owner: EntityRef, rt: Runtime) {
    super(owner, rt);
    this.fn('CheckForItem', ['entity', 'entity'], this.checkForItem);
    this.entityNames = ['secret_concussion_trigger', 'secret_concussion_template'];
  }

  override onAllEntitiesSpawned(): void {
    this.trigger = this.first('secret_concussion_trigger');
    this.template = this.first('secret_concussion_template');
  }

  checkForItem(caller: EntityRef | null, activator: EntityRef | null): void {
    if (!activator || !same(caller, this.trigger)) return;
    if (this.rt.classOf(activator) === 'weapon_deagle') {
      fire(this.trigger, 'Disable');
      fire(this.template, 'ForceSpawn');
    }
  }
}
