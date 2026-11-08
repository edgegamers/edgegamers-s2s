// ArcadeScripts for s2script. Derived from ArcadeScripts-CSS by Supergosciuツ (GPL-3.0).
// See LICENSE and NOTICE. Port of Scripts/Flight/Flight.cs (flight.nut).
import { Server } from '@s2script/sdk';
import type { EntityRef } from '@s2script/sdk';
import type { Pawn } from '@s2script/cs2';
import { Script } from '../script';
import type { Runtime } from '../runtime';
import { forward, inBox, keyOf, ownerOf, pawnOf, rotationOf, same, scale, setMessage, slotOf, valid, vec } from '../util';
import { STRAFE_JUMP_AREAS } from './strafe-jump';

const TOGGLE_TIME = 6;
const SECRET_SPEED = 0.5;
const DODGE_AREA = [vec(2176, -1824, -1024), vec(2688, 3744, -800)] as const;

export class Flight extends Script {
  private enabled = false;
  private nextToggle = 0;
  private item: EntityRef | null = null;
  private player: Pawn | null = null;
  private origin: EntityRef | null = null;

  constructor(owner: EntityRef, rt: Runtime) {
    super(owner, rt);
    this.fn('StartFlight', [], this.startFlight);
    this.fn('PickUp', ['entity'], this.pickUp);
    this.fn('RegisterItem', [], this.registerItem);
    this.fn('ToggleEnabled', ['entity'], this.toggleEnabled);
    this.entityNames = ['secret_flight_origin'];
  }

  override onAllEntitiesSpawned(): void {
    this.origin = this.first('secret_flight_origin');
  }

  override onEntitySpawned(entity: EntityRef): void {
    if (entity.name === 'secret_flight_c4') this.item = entity;
  }

  registerItem(): void {
    this.nextToggle = Server.gameTime;
  }

  toggleEnabled(activator: EntityRef | null): void {
    const player = this.player;
    if (!player || !same(player.ref, activator) || Server.gameTime < this.nextToggle) return;
    this.nextToggle = Server.gameTime + TOGGLE_TIME;
    if (this.inDisabledArea(player)) return;
    this.enabled = !this.enabled;
    if (this.enabled) this.enable();
    else this.disable();
  }

  private enable(): void {
    this.modifySpeed(SECRET_SPEED);
    this.player?.setGravityScale(0.01);
    this.updateHUDText();
  }

  private disable(): void {
    this.modifySpeed(1);
    this.player?.setGravityScale(1);
    this.updateHUDText();
  }

  pickUp(activator: EntityRef | null): void {
    const pawn = pawnOf(activator);
    if (!pawn) return;
    this.player = pawn;
    this.enabled = true;
    this.enable();
  }

  private updateHUDText(): void {
    if (!this.player || !valid(this.item) || !ownerOf(this.item)) return;
    const now = Server.gameTime;
    const ready = now < this.nextToggle ? `(${Math.trunc(this.nextToggle - now + 1.01)}s)` : '(Ready!)';
    setMessage(slotOf(this.player), `Right click to toggle flight ${this.enabled ? 'off' : 'on'} ${ready}`, 4);
  }

  startFlight(): void {
    this.updateHUDText();
    const player = this.player;
    if (!player || !this.enabled) return;
    if (this.item) {
      if (!same(ownerOf(this.item), player.ref)) {
        this.modifySpeed(1);
        this.disable();
        this.player = null;
        return;
      }
      if (this.inDisabledArea(player)) {
        this.enabled = false;
        this.disable();
        return;
      }
    }
    const v = scale(forward(rotationOf(this.origin) ?? vec(0, 0, 0)), 600);
    player.setVelocity(v.x, v.y, v.z + 10);
    this.modifySpeed(SECRET_SPEED);
  }

  private modifySpeed(speed: number): void {
    if (this.player?.isValid) this.player.velocityModifier = speed;
  }

  private inDisabledArea(pawn: Pawn): boolean {
    const origin = pawn.origin;
    if (origin && [...STRAFE_JUMP_AREAS, DODGE_AREA].some(([min, max]) => inBox(origin, min, max))) return true;
    return this.rt.inGame.has(keyOf(pawn.ref));
  }
}
