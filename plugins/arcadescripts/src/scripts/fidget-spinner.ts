// ArcadeScripts for s2script. Derived from ArcadeScripts-CSS by Supergosciuツ (GPL-3.0).
// See LICENSE and NOTICE. Port of Scripts/FidgetSpinner/FidgetSpinner.cs (fidgetspinner.nut).
import type { EntityRef } from '@s2script/sdk';
import { Script } from '../script';
import type { Runtime } from '../runtime';
import { fire, length2DSqr, num, ownerOf, valid, velocityOf } from '../util';

const MIN_SPEED_TO_SPIN = 37500;
const INCREASE = 0.1;
const DECREASE = -0.05;

export class FidgetSpinner extends Script {
  private speed = 0;
  private item: EntityRef | null = null;
  private rotating: EntityRef | null = null;
  private timer: EntityRef | null = null;

  constructor(owner: EntityRef, rt: Runtime) {
    super(owner, rt);
    this.fn('Setup', [], this.setup);
    this.fn('UpdateSpeed', [], this.updateSpeed);
    this.entityNames = ['fidgetspinner_timer'];
  }

  override onAllEntitiesSpawned(): void {
    this.timer = this.first('fidgetspinner_timer');
  }

  override onEntitySpawned(entity: EntityRef): void {
    const name = entity.name;
    if (name === 'fidgetspinner_item') this.item = entity;
    else if (name === 'fidgetspinner_model') this.rotating = entity;
  }

  setup(): void {
    fire(this.timer, 'Enable', { delay: 1 });
  }

  private addToSpeed(delta: number): void {
    if (delta === DECREASE && this.speed === 0) return;
    // Upstream accumulates in single precision; round so 0.1 steps land on exact values.
    this.speed = Math.min(1, Math.max(0, Math.round((this.speed + delta) * 1000) / 1000));
    fire(this.rotating, 'SetSpeed', { value: num(this.speed), activator: this.rotating, caller: this.rotating });
  }

  updateSpeed(): void {
    if (!valid(this.item)) {
      fire(this.timer, 'Disable');
      return;
    }
    const owner = ownerOf(this.item);
    if (!valid(owner)) {
      this.addToSpeed(DECREASE);
      return;
    }
    const velocity = velocityOf(owner);
    this.addToSpeed(velocity && length2DSqr(velocity) >= MIN_SPEED_TO_SPIN ? INCREASE : DECREASE);
  }
}
