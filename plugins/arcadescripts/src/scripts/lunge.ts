// ArcadeScripts for s2script. Derived from ArcadeScripts-CSS by Supergosciuツ (GPL-3.0).
// See LICENSE and NOTICE. Port of Scripts/Lunge/Lunge.cs (lunge.nut).
import { Server } from '@s2script/sdk';
import type { EntityRef } from '@s2script/sdk';
import type { Pawn } from '@s2script/cs2';
import { Script } from '../script';
import type { Runtime } from '../runtime';
import { fire, forward, inBox, keyOf, ownerOf, pawnAlive, pawnOf, rotationOf, same, scale, setMessage, slotOf, vec } from '../util';
import { STRAFE_JUMP_AREAS } from './strafe-jump';

const STRENGTH = 900;
const COOLDOWN = 3;

/** Upstream renames holders to `secret_lunger`/`secret_grabber` from map I/O; restore the default. */
export function resetName(pawn: Pawn | null, name: string): void {
  if (pawn?.isValid && pawn.ref.name === name) fire(pawn.ref, 'KeyValue', { value: 'targetname default' });
}

export class Lunge extends Script {
  private nextAllowed = 0;
  private item: EntityRef | null = null;
  private player: Pawn | null = null;
  private origin: EntityRef | null = null;
  private timer: EntityRef | null = null;

  constructor(owner: EntityRef, rt: Runtime) {
    super(owner, rt);
    this.fn('UpdateHUD', [], this.updateHUD);
    this.fn('PickUp', ['entity'], this.pickUp);
    this.fn('DoLunge', [], this.doLunge);
    this.entityNames = ['secret_lunge_timer', 'secret_lunge_origin'];
  }

  override onAllEntitiesSpawned(): void {
    this.origin = this.first('secret_lunge_origin');
    this.timer = this.first('secret_lunge_timer');
  }

  override onEntitySpawned(entity: EntityRef): void {
    if (entity.name === 'secret_lunge_item') this.item = entity;
  }

  private disable(pawn: Pawn | null, disableTimer: boolean): void {
    resetName(pawn, 'secret_lunger');
    this.player = null;
    if (disableTimer) fire(this.timer, 'Disable');
  }

  pickUp(activator: EntityRef | null): void {
    if (!activator) return;
    if (!same(activator, this.player?.ref)) this.disable(this.player, false);
    this.player = pawnOf(activator);
    this.nextAllowed = Server.gameTime + 0.5;
  }

  doLunge(): void {
    const player = this.player;
    if (Server.gameTime < this.nextAllowed || !player || !this.item) return;
    if (!same(ownerOf(this.item), player.ref)) {
      this.disable(player, true);
      return;
    }
    if (this.inDisabledArea(player)) return;

    this.nextAllowed = Server.gameTime + COOLDOWN;
    const push = scale(forward(rotationOf(this.origin) ?? vec(0, 0, 0)), STRENGTH);
    player.applyAbsVelocityImpulse([push.x, push.y, push.z + 10]);
  }

  updateHUD(): void {
    const player = this.player;
    if (!this.item || !pawnAlive(player) || !same(ownerOf(this.item), player.ref)) {
      this.disable(player, true);
      return;
    }
    const now = Server.gameTime;
    const text = now < this.nextAllowed ? `${Math.trunc(this.nextAllowed - now + 1.01)}s until lunge ready.` : 'Lunge ready!';
    setMessage(slotOf(player), text, 2);
  }

  private inDisabledArea(pawn: Pawn): boolean {
    const origin = pawn.origin;
    if (origin && STRAFE_JUMP_AREAS.some(([min, max]) => inBox(origin, min, max))) return true;
    return this.rt.inGame.has(keyOf(pawn.ref));
  }
}
