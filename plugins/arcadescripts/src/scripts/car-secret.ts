// ArcadeScripts for s2script. Derived from ArcadeScripts-CSS by Supergosciuツ (GPL-3.0).
// See LICENSE and NOTICE. Port of Scripts/CarSecret/CarSecret.cs (car_secret.nut).
import { every } from '@s2script/sdk';
import type { EntityRef, Timer } from '@s2script/sdk';
import { Script } from '../script';
import type { Runtime } from '../runtime';
import { fire, ownerOf, pawnAlive, pawnOf, same, teleport, valid, vec } from '../util';

const ITEM_LOCATION = vec(-63.231995, -275.15799, -698.593018);
const SPEED_BONUS = 1.4;

function setSpeed(ref: EntityRef | null, speed: number): void {
  const pawn = pawnOf(ref);
  if (pawnAlive(pawn)) pawn.velocityModifier = speed;
}

export class CarSecret extends Script {
  private timer: Timer | null = null;
  private player: EntityRef | null = null;
  private item: EntityRef | null = null;
  private carModel: EntityRef | null = null;

  constructor(owner: EntityRef, rt: Runtime) {
    super(owner, rt);
    this.fn('SetItemLocation', [], this.setItemLocation);
    this.fn('Update', [], this.update);
    this.fn('PickUp', ['entity'], this.pickUp);
    this.entityNames = ['secret_car_item', 'secret_car_model'];
  }

  override onAllEntitiesSpawned(): void {
    this.item = this.first('secret_car_item');
    this.carModel = this.first('secret_car_model');
  }

  setItemLocation(): void {
    if (!this.item) return;
    teleport(this.item, ITEM_LOCATION);
    fire(this.carModel, 'Alpha', { value: '255' });
  }

  pickUp(activator: EntityRef | null): void {
    if (!activator) return;
    // New owner: remove the bonus from the old one.
    if (!same(activator, this.player)) setSpeed(this.player, 1);
    this.player = activator;
    setSpeed(this.player, SPEED_BONUS);
    this.timer?.kill();
    this.timer = every(200, () => this.rt.guard(this, () => this.update()));
  }

  update(): void {
    if (!this.player) {
      this.stop();
      return;
    }
    // Item deleted or has no owner.
    if (!valid(this.item) || !valid(ownerOf(this.item))) {
      this.stop();
      setSpeed(this.player, 1);
      this.player = null;
    }
  }

  private stop(): void {
    this.timer?.kill();
    this.timer = null;
  }

  override remove(): void {
    this.stop();
    super.remove();
  }
}
