// ArcadeScripts for s2script. Derived from ArcadeScripts-CSS by Supergosciuツ (GPL-3.0).
// See LICENSE and NOTICE. Port of Scripts/Decoys/Decoys.cs (decoys.nut).
import type { EntityRef } from '@s2script/sdk';
import { Script } from '../script';
import type { Runtime } from '../runtime';
import { distance, fire, keyOf, originOf, ownerOf, healthOf, players, same, scale, sub, teleport, valid, vec, velocityOf } from '../util';
import type { Vec } from '../util';

export class Decoys extends Script {
  private readonly decoys = new Map<string, EntityRef>();
  private decoyTimer: EntityRef | null = null;
  private concussionSound: EntityRef | null = null;
  private teleportSound1: EntityRef | null = null;
  private teleportSound2: EntityRef | null = null;
  private teleportItem: EntityRef | null = null;
  private teleportPlayer: EntityRef | null = null;
  private teleportTarget: EntityRef | null = null;
  private oldPosition: Vec | null = null;
  private newPosition: Vec | null = null;
  private concussionItem: EntityRef | null = null;
  private concussionPlayer: EntityRef | null = null;
  private concussionTarget: EntityRef | null = null;

  constructor(owner: EntityRef, rt: Runtime) {
    super(owner, rt);
    this.fn('CheckForNewDecoys', [], this.checkForNewDecoys);
    this.fn('PickUpConcussionItem', ['entity', 'entity'], this.pickUpConcussionItem);
    this.fn('PickUpTeleportItem', ['entity', 'entity'], this.pickUpTeleportItem);
    this.entityNames = ['secret_decoy_timer', 'secret_teleportation_target', 'secret_concussion_target', 'secret_teleportation_sound2'];
  }

  override onAllEntitiesSpawned(): void {
    this.decoyTimer = this.first('secret_decoy_timer');
    this.teleportTarget = this.first('secret_teleportation_target');
    this.concussionTarget = this.first('secret_concussion_target');
    this.teleportSound2 = this.first('secret_teleportation_sound2');
  }

  override onEntitySpawned(entity: EntityRef, className: string): void {
    const name = entity.name;
    if (className === 'decoy_projectile') this.decoys.set(keyOf(entity), entity);
    else if (name === 'secret_concussion_sound') this.concussionSound = entity;
    else if (name === 'secret_teleportation_sound') this.teleportSound1 = entity;
  }

  override onEntityRemoved(entity: EntityRef, className: string): void {
    if (className === 'decoy_projectile') this.decoys.delete(keyOf(entity));
  }

  pickUpTeleportItem(activator: EntityRef | null, caller: EntityRef | null): void {
    if (!activator || !caller) return;
    this.teleportItem = caller;
    this.teleportPlayer = activator;
    fire(this.decoyTimer, 'Enable');
  }

  pickUpConcussionItem(activator: EntityRef | null, caller: EntityRef | null): void {
    if (!activator || !caller) return;
    this.concussionItem = caller;
    this.concussionPlayer = activator;
    fire(this.decoyTimer, 'Enable');
  }

  checkForNewDecoys(): void {
    if (this.teleportItem && (!valid(this.teleportItem) || !same(ownerOf(this.teleportItem), this.teleportPlayer))) this.teleportPlayer = null;
    if (this.concussionItem && (!valid(this.concussionItem) || !same(ownerOf(this.concussionItem), this.concussionPlayer))) this.concussionPlayer = null;
    if (!this.teleportPlayer && !this.concussionPlayer) {
      fire(this.decoyTimer, 'Disable');
      return;
    }
    for (const decoy of [...this.decoys.values()]) {
      if (!decoy.isValid()) continue;
      const v = velocityOf(decoy);
      const still = !!v && v.x === 0 && v.y === 0 && v.z === 0;
      const thrower = ownerOf(decoy);
      if (this.teleportPlayer && same(thrower, this.teleportPlayer)) {
        if (still) this.teleportGrenade(decoy);
      } else if (this.concussionPlayer && same(thrower, this.concussionPlayer)) {
        if (still) this.concussionGrenade(decoy);
      }
    }
  }

  private teleportGrenade(decoy: EntityRef): void {
    if (!this.teleportItem || !decoy.isValid()) return;
    const thrower = ownerOf(decoy);
    if (!thrower || !same(ownerOf(this.teleportItem), thrower)) return;
    const from = originOf(thrower);
    const at = originOf(decoy);
    if (!from || !at) return;
    this.oldPosition = vec(from.x, from.y, from.z);
    this.newPosition = vec(at.x, at.y, at.z + 0.5);

    // Sounds and sparks at the start and end positions.
    teleport(this.teleportTarget, this.oldPosition);
    fire(this.teleportSound1, 'PlaySound', { delay: 0.1, activator: thrower, caller: thrower });
    fire(this.teleportSound2, 'PlaySound', { delay: 0.1, activator: thrower, caller: thrower });
    fire(decoy, 'Kill', { delay: 0.01, activator: decoy, caller: decoy });
    // Drop vertical speed so a mid-jump thrower is not carried back.
    const v = velocityOf(thrower);
    teleport(thrower, this.newPosition, null, v ? vec(v.x, v.y, 0) : null);
    // Still at the landing height 0.2s later means stuck: move them back.
    this.after(0.2, () => this.checkIfMoved(thrower));
  }

  private checkIfMoved(player: EntityRef): void {
    if (!valid(player) || healthOf(player) <= 0 || !this.newPosition || !this.oldPosition) return;
    const z = originOf(player)?.z;
    if (z !== undefined && this.newPosition.z - z < 1.5) teleport(player, this.oldPosition);
  }

  private concussionGrenade(decoy: EntityRef): void {
    if (!this.concussionItem || !decoy.isValid()) return;
    const thrower = ownerOf(decoy);
    if (!thrower || !same(ownerOf(this.concussionItem), thrower)) return;
    const team = players().find(({ pawn }) => same(pawn.ref, thrower))?.player.teamNum ?? -1;
    const at = originOf(decoy);
    if (!at) return;

    teleport(this.concussionTarget, vec(at.x, at.y, at.z + 0.5));
    fire(this.concussionSound, 'PlaySound', { delay: 0.05, activator: thrower, caller: thrower });
    fire(decoy, 'Kill', { delay: 0.01, activator: decoy, caller: decoy });

    // Push nearby enemies, and the thrower.
    const below = vec(at.x, at.y, at.z - 24);
    for (const { player, pawn } of players()) {
      const origin = pawn.origin;
      if (!origin || distance(origin, at) > 512) continue;
      if (player.teamNum === team && !same(pawn.ref, thrower)) continue;
      const boost = scale(sub(origin, below), 600);
      pawn.applyAbsVelocityImpulse([boost.x, boost.y, Math.max(boost.z, 300)]);
    }
  }
}
