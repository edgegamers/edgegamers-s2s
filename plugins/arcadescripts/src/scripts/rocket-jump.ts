// ArcadeScripts for s2script. Derived from ArcadeScripts-CSS by Supergosciuツ (GPL-3.0).
// See LICENSE and NOTICE. Port of Scripts/RocketJump/RocketJump.cs (rocketjump.nut).
import { Server } from '@s2script/sdk';
import type { EntityRef } from '@s2script/sdk';
import { Script } from '../script';
import type { Runtime } from '../runtime';
import { fire, forward, originOf, ownerOf, pawnOf, rotationOf, same, scale, teleport, valid, vec } from '../util';

const BOOST = 600;

export class RocketJump extends Script {
  private lastRocket = 0;
  private item: EntityRef | null = null;
  private player: EntityRef | null = null;
  private direction: EntityRef | null = null;
  private sound: EntityRef | null = null;

  constructor(owner: EntityRef, rt: Runtime) {
    super(owner, rt);
    this.fn('SetRocketJumper', ['entity', 'entity'], this.setRocketJumper);
    this.fn('DoRocketJump', ['entity'], this.doRocketJump);
    this.entityNames = ['rocketjump_sound', 'rocketjump_origin'];
  }

  override onAllEntitiesSpawned(): void {
    this.sound = this.first('rocketjump_sound');
    this.direction = this.first('rocketjump_origin');
  }

  setRocketJumper(activator: EntityRef | null, caller: EntityRef | null): void {
    if (!activator || !caller) return;
    this.item = caller;
    this.player = activator;
  }

  doRocketJump(activator: EntityRef | null): void {
    // If the shotgun was thrown or stripped, don't do anything.
    if (!activator || !same(this.player, activator) || !valid(this.item) || !same(ownerOf(this.item), activator)) return;
    const time = Server.gameTime;
    if (time < this.lastRocket + 0.7) return;

    teleport(this.sound, originOf(this.player));
    fire(this.sound, 'PlaySound', { activator: this.sound, caller: this.sound });
    this.lastRocket = time;
    const facing = forward(rotationOf(this.direction) ?? vec(0, 0, 0));
    const boost = scale(vec(-facing.x, -facing.y, -facing.z), BOOST);
    pawnOf(activator)?.applyAbsVelocityImpulse([boost.x, boost.y, boost.z]);
  }
}
