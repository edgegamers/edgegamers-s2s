// ArcadeScripts for s2script. Derived from ArcadeScripts-CSS by Supergosciuツ (GPL-3.0).
// See LICENSE and NOTICE. Port of Scripts/Poison/Poison.cs (poison.nut).
import { Server } from '@s2script/sdk';
import type { EntityRef } from '@s2script/sdk';
import type { Pawn } from '@s2script/cs2';
import { Script } from '../script';
import type { Runtime } from '../runtime';
import { keyOf, ownerOf, pawnAlive, pawnOf, same, setMessage, slotOf, valid } from '../util';
import { closestPlayers } from './nearby';

const TICKS = 5;
const DELAY = 1;
const COOLDOWN = 5;

export class Poison extends Script {
  private nextAvailable = 0;
  private readonly remaining = new Map<string, number>();
  private item: EntityRef | null = null;
  private player: Pawn | null = null;
  private hurtScript: EntityRef | null = null;

  constructor(owner: EntityRef, rt: Runtime) {
    super(owner, rt);
    this.fn('TryPoison', [], this.tryPoison);
    this.fn('PickUpSpecialItem', ['entity', 'entity'], this.pickUpSpecialItem);
    this.entityNames = ['hurt_script'];
  }

  override onAllEntitiesSpawned(): void {
    this.hurtScript = this.first('hurt_script');
  }

  pickUpSpecialItem(activator: EntityRef | null, caller: EntityRef | null): void {
    if (!activator || !caller) return;
    const pawn = pawnOf(activator);
    const slot = slotOf(pawn);
    if (slot === null) return;
    this.item = caller;
    this.player = pawn;
    setMessage(slot, 'Left click to attack nearby enemies with poison.', 15);
  }

  tryPoison(): void {
    if (Server.gameTime < this.nextAvailable) return;
    if (this.item && (!valid(this.item) || !same(ownerOf(this.item), this.player?.ref))) this.player = null;
    const player = this.player;
    if (!player?.isValid) return;
    const origin = player.origin;
    if (!origin) return;

    const victim = closestPlayers(origin, 1, 1024, player, player.teamNum ?? -1)[0];
    if (!victim) return;
    this.nextAvailable = Server.gameTime + COOLDOWN;
    this.rt.runScriptCode(this.hurtScript, 'SetAttacker(!activator, HurterThree)', player.ref, player.ref);
    this.poisonPlayer(victim);
  }

  private poisonPlayer(pawn: Pawn): void {
    const key = keyOf(pawn.ref);
    const running = (this.remaining.get(key) ?? 0) > 0;
    this.remaining.set(key, TICKS);
    if (!running) this.after(DELAY, () => this.poisonTick(pawn));
  }

  private poisonTick(pawn: Pawn): void {
    const key = keyOf(pawn.ref);
    const left = this.remaining.get(key) ?? 0;
    if (left <= 0) {
      this.remaining.set(key, 0);
      return;
    }
    this.remaining.set(key, left - 1);
    if (!pawnAlive(pawn)) return;
    this.rt.runScriptCode(this.hurtScript, 'HurtActivator(!activator, HurterThree)', pawn.ref, pawn.ref);
    setMessage(slotOf(pawn), 'You are poisoned!', 2);
    this.after(DELAY, () => this.poisonTick(pawn));
  }
}
