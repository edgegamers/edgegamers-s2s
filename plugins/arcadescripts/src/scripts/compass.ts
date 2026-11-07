// ArcadeScripts for s2script. Derived from ArcadeScripts-CSS by Supergosciuツ (GPL-3.0).
// See LICENSE and NOTICE. Port of Scripts/Compass/Compass.cs (compass.nut).
import type { EntityRef } from '@s2script/sdk';
import { Script } from '../script';
import type { Runtime } from '../runtime';
import { fire, lengthSqr, originOf, ownerOf, pawnOf, randomFloat, randomInt, setMessage, slotOf, sub, teleport, valid, vec } from '../util';
import type { Vec } from '../util';

const TOTAL_TARGETS = 1;
const ROOMS: readonly [Vec, Vec][] = [
  [vec(1152, -612, 0), vec(3648, 800, 0)], // main lobby
  [vec(-564, -564, 0), vec(448, 504, 0)], // cells
  [vec(1536, -2287, 0), vec(3072, -800, 0)], // sprite room
  [vec(3712, -736, 0), vec(5760, 800, 0)], // disco
  [vec(4000, 864, 0), vec(4736, 2400, 0)], // tapper
  [vec(1152, 2528, 0), vec(3136, 4512, 0)], // decathlon
  [vec(1152, 864, 0), vec(3936, 2400, 0)], // bee
  [vec(3712, -2848, 0), vec(4672, -800, 0)], // climb A
  [vec(4672, -1824, 0), vec(5760, -800, 0)], // climb B
];

export class Compass extends Script {
  private targetRoom = 9999;
  private inspected = 0;
  private secondsAtTarget = 0;
  private atTarget = false;
  private questOver = false;
  private target: Vec | null = null;
  private item: EntityRef | null = null;
  private needle: EntityRef | null = null;
  private prop: EntityRef | null = null;
  private timer: EntityRef | null = null;
  private maker: EntityRef | null = null;

  constructor(owner: EntityRef, rt: Runtime) {
    super(owner, rt);
    this.fn('AdjustNeedle', [], this.adjustNeedle);
    this.fn('PickUp', ['entity'], this.pickUp);
    this.fn('RegisterItem', [], this.registerItem);
    this.entityNames = ['secret_compass_timer', 'rocketjump_entity_maker'];
  }

  override onAllEntitiesSpawned(): void {
    this.timer = this.first('secret_compass_timer');
    this.maker = this.first('rocketjump_entity_maker');
  }

  override onEntitySpawned(entity: EntityRef): void {
    const name = entity.name;
    if (name === 'secret_compass_c4') this.item = entity;
    if (name === 'secret_compass_needle') this.needle = entity;
    if (name === 'secret_compass_base') this.prop = entity;
  }

  registerItem(): void {
    if (!this.target) this.chooseNewTarget();
  }

  private chooseNewTarget(): void {
    let room = randomInt(0, ROOMS.length - 2);
    if (room >= this.targetRoom) room++; // never the current room
    this.targetRoom = room;
    const [min, max] = ROOMS[room]!;
    this.target = vec(randomFloat(min.x, max.x), randomFloat(min.y, max.y), 0);
  }

  private triggerLocation(): void {
    const holder = ownerOf(this.item);
    if (!valid(this.item) || !holder || !this.atTarget || this.questOver) return;
    this.inspected++;
    if (this.inspected < TOTAL_TARGETS) {
      this.chooseNewTarget();
      return;
    }
    this.questOver = true;
    fire(this.prop, 'Skin', { value: '0' });
    fire(this.timer, 'Kill');
    fire(this.needle, 'Kill');
    const at = originOf(holder);
    if (!at) return;
    teleport(this.maker, vec(at.x, at.y, at.z + 32), vec(0, 0, 0));
    fire(this.maker, 'ForceSpawn');
  }

  private checkIfAtTarget(): void {
    const origin = originOf(this.prop);
    if (!origin || !this.item || !ownerOf(this.item) || !this.target) return;
    if (lengthSqr(sub(vec(origin.x, origin.y, 0), this.target)) <= 4096) { // 64^2
      if (!this.atTarget) {
        this.atTarget = true;
        fire(this.prop, 'Skin', { value: '1' });
      }
      this.secondsAtTarget += 0.015625;
    } else {
      this.secondsAtTarget = 0;
      if (this.atTarget) {
        fire(this.prop, 'Skin', { value: '0' });
        this.atTarget = false;
      }
    }
  }

  pickUp(activator: EntityRef | null): void {
    if (!activator || this.questOver) return;
    setMessage(slotOf(pawnOf(activator)), 'Stand where the compass turns green for 3 seconds to uncover the secret.', 15);
  }

  adjustNeedle(): void {
    if (!this.item || !ownerOf(this.item)) return;
    const from = originOf(this.needle);
    if (!from || !this.target) return;
    const d = sub(from, this.target);
    const yaw = (Math.atan2(d.x, -d.y) + Math.PI / 2) / Math.PI * 180;
    teleport(this.needle, null, vec(0, yaw, 0));
    this.checkIfAtTarget();
    if (this.secondsAtTarget >= 3) {
      this.secondsAtTarget = 0;
      this.triggerLocation();
    }
  }
}
