// ArcadeScripts for s2script. Derived from ArcadeScripts-CSS by Supergosciuツ (GPL-3.0).
// See LICENSE and NOTICE. Port of Scripts/Follower/Follower.cs (follower.nut).
import { Server } from '@s2script/sdk';
import type { EntityRef } from '@s2script/sdk';
import type { Pawn } from '@s2script/cs2';
import { Script } from '../script';
import type { Runtime } from '../runtime';
import { distance, fire, originOf, pawnAlive, players, randomInt, teleport, valid, vec } from '../util';

const MAX_DISTANCE_TO_FOLLOW = 128;
const TIME_BETWEEN_TICKS = 0.5;

export class Follower extends Script {
  private stopped = true;
  private nextTick = 0;
  private target: Pawn | null = null;
  private trackA: EntityRef | null = null;
  private trackB: EntityRef | null = null;
  private train: EntityRef | null = null;
  private sprites: (EntityRef | null)[] = [];

  constructor(owner: EntityRef, rt: Runtime) {
    super(owner, rt);
    this.fn('ChooseRandomFollower', [], this.chooseRandomFollower);
    this.entityNames = ['follower_train', 'follower_track1', 'follower_track2', 'follower_sprite1', 'follower_sprite2'];
  }

  override onAllEntitiesSpawned(): void {
    this.train = this.first('follower_train');
    this.trackA = this.first('follower_track1');
    this.trackB = this.first('follower_track2');
    this.sprites = [this.first('follower_sprite1'), this.first('follower_sprite2')];
  }

  override think(): void {
    if (Server.gameTime < this.nextTick) return;
    this.nextTick = Server.gameTime + TIME_BETWEEN_TICKS;

    if (!this.target || !this.target.isValid || (this.target.health ?? 0) <= 0) {
      this.target = this.randomLivingPlayer();
      if (!valid(this.train)) return;
      fire(this.train, 'Stop', { activator: this.train, caller: this.train });
      this.stopped = true;
      return;
    }
    if (!valid(this.train)) return;
    if (this.stopped) {
      if (this.distanceToTarget() < MAX_DISTANCE_TO_FOLLOW) return;
      fire(this.train, 'StartForward', { activator: this.train, caller: this.train });
      this.stopped = false;
    }
    this.moveTrack(this.target);
  }

  chooseRandomFollower(): void {
    if (this.sprites.length === 0) return;
    const index = randomInt(0, Math.min(1, this.sprites.length - 1));
    fire(this.sprites[index], 'Kill');
    this.sprites.splice(index, 1);
  }

  private randomLivingPlayer(): Pawn | null {
    const candidates = players().filter(({ player, pawn }) => pawnAlive(pawn) && (player.teamNum === 2 || player.teamNum === 3));
    return candidates.length === 0 ? null : candidates[randomInt(0, candidates.length - 1)]!.pawn;
  }

  private distanceToTarget(): number {
    const a = originOf(this.train);
    const b = this.target?.origin;
    return a && b ? distance(a, b) : 0;
  }

  private moveTrack(target: Pawn): void {
    if (this.distanceToTarget() < MAX_DISTANCE_TO_FOLLOW) {
      fire(this.train, 'Stop', { activator: this.train, caller: this.train });
      this.stopped = true;
      return;
    }
    const origin = target.origin;
    if (!origin) return;
    teleport(this.trackA, originOf(this.train));
    teleport(this.trackB, vec(origin.x, origin.y, origin.z + 30));
  }
}
