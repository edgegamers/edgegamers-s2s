// ArcadeScripts for s2script. Derived from ArcadeScripts-CSS by Supergosciuツ (GPL-3.0).
// See LICENSE and NOTICE. Port of Scripts/Grab/Grab.cs (grab.nut).
import type { EntityRef } from '@s2script/sdk';
import type { Pawn } from '@s2script/cs2';
import { Script } from '../script';
import type { Runtime } from '../runtime';
import { add, distance, fire, forward, length, ownerOf, pawnAlive, pawnOf, players, rotationOf, same, scale, setMessage, slotOf, sub, valid, vec } from '../util';
import type { Vec } from '../util';
import { resetName } from './lunge';

const GRAB_DISTANCE = 96;

export class Grab extends Script {
  private item: EntityRef | null = null;
  private origin: EntityRef | null = null;
  private grabbed: Pawn | null = null;
  private player: Pawn | null = null;
  private ui: EntityRef | null = null;
  private readonly pressed = [false, false];

  constructor(owner: EntityRef, rt: Runtime) {
    super(owner, rt);
    this.fn('PickUp', ['entity'], this.pickUp);
    this.fn('DoGrab', ['entity'], this.doGrab);
    this.fn('PressButton', ['entity', 'int', 'bool'], this.pressButton);
    this.fn('Think', [], this.thinkFn);
    this.constants = { BUTTON_LEFT: 0, BUTTON_RIGHT: 1 };
    this.entityNames = ['secret_grab_origin', 'secret_grab_ui', 'secret_grab_timer'];
  }

  override onAllEntitiesSpawned(): void {
    this.origin = this.first('secret_grab_origin');
    this.ui = this.first('secret_grab_ui');
  }

  override onEntitySpawned(entity: EntityRef): void {
    if (entity.name === 'secret_grab_item') this.item = entity;
  }

  pickUp(activator: EntityRef | null): void {
    if (!activator) return;
    if (!same(activator, this.player?.ref)) this.disable(this.player);
    this.player = pawnOf(activator);
    setMessage(slotOf(this.player), 'Press left+right at the same time to grab a player', 15);
    this.pressed[0] = false;
    this.pressed[1] = false;
  }

  /** The map's `Think()` call from its own timer (not a per-frame think). */
  thinkFn(): void {
    const player = this.player;
    if (!player || !this.item) return;
    if (!valid(this.item)) {
      this.item = null;
      this.disable(player);
      return;
    }
    if (!same(ownerOf(this.item), player.ref) || (player.health ?? 0) < 1) {
      this.disable(player);
      return;
    }
    const grabbed = this.grabbed;
    if (!grabbed) return;
    if (!grabbed.isValid) {
      this.grabbed = null;
      return;
    }
    if (grabbed.lifeState !== 0) {
      grabbed.setGravityScale(1);
      this.grabbed = null;
      return;
    }
    const location = this.grabLocation(player);
    const at = grabbed.origin;
    if (!location || !at) return;
    location.z -= 32;
    const pull = sub(location, at);
    // Release when the grabbed player has got far away.
    if (length(pull) > 512) {
      this.free();
      return;
    }
    grabbed.setVelocity(pull.x * 10, pull.y * 10, pull.z * 10);
  }

  private grabLocation(player: Pawn): Vec | null {
    const eye = player.eyePosition;
    if (!eye) return null;
    return add(eye, scale(forward(rotationOf(this.origin) ?? vec(0, 0, 0)), 64));
  }

  private disable(pawn: Pawn | null): void {
    this.free();
    resetName(pawn, 'secret_grabber');
    this.player = null;
  }

  private grabPlayer(pawn: Pawn): void {
    this.free();
    this.grabbed = pawn;
    pawn.setGravityScale(0.01);
  }

  doGrab(activator: EntityRef | null): void {
    this.deactivate(activator);
    const player = this.player;
    if (!player || !same(player.ref, activator) || !this.item || !same(ownerOf(this.item), player.ref)) return;
    if (this.grabbed) {
      this.free();
      return;
    }
    const location = this.grabLocation(player);
    if (!location) return;
    let closest: Pawn | null = null;
    let closestDistance = 9999;
    for (const { pawn } of players()) {
      if (!pawnAlive(pawn) || same(pawn.ref, player.ref) || !pawn.origin) continue;
      const d = distance(pawn.origin, location);
      if (d < closestDistance && d < GRAB_DISTANCE) {
        closestDistance = d;
        closest = pawn;
      }
    }
    if (closest) this.grabPlayer(closest);
  }

  private free(): void {
    if (this.grabbed?.isValid) {
      this.grabbed.setGravityScale(1);
      this.grabbed = null;
    }
  }

  pressButton(activator: EntityRef | null, button: number, value: boolean): void {
    this.deactivate(activator);
    if (button !== 0 && button !== 1) throw new Error(`no button ${button}`);
    this.pressed[button] = value;
    if (this.pressed[0] && this.pressed[1]) this.doGrab(activator);
  }

  private deactivate(activator: EntityRef | null): void {
    if ((!valid(this.item) || !ownerOf(this.item)) && activator) fire(this.ui, 'Deactivate', { activator, caller: activator });
  }
}
