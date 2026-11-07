// ArcadeScripts for s2script. Derived from ArcadeScripts-CSS by Supergosciuツ (GPL-3.0).
// See LICENSE and NOTICE. Port of Scripts/Lightning/Lightning.cs (lightning.nut).
import { Server } from '@s2script/sdk';
import type { EntityRef } from '@s2script/sdk';
import type { Pawn } from '@s2script/cs2';
import { Script } from '../script';
import type { Runtime } from '../runtime';
import { fire, ownerOf, pawnOf, same, setMessage, slotOf, teleport, valid, vec } from '../util';
import { closestPlayers } from './nearby';

const LIFETIME = 3;
const BRANCHES = 5;
const COOLDOWN = 10;

export class Lightning extends Script {
  private nextAvailable = 0;
  private readonly usedStarts = new Set<string>();
  private item: EntityRef | null = null;
  private player: Pawn | null = null;
  private hurtScript: EntityRef | null = null;
  private template: EntityRef | null = null;
  private sound1: EntityRef | null = null;
  private sound2: EntityRef | null = null;
  private starts: EntityRef[] = [];
  private stops: EntityRef[] = [];
  private beams: EntityRef[] = [];

  constructor(owner: EntityRef, rt: Runtime) {
    super(owner, rt);
    this.fn('TryLightning', [], this.tryLightning);
    this.fn('PickUpSpecialItem', ['entity', 'entity'], this.pickUpSpecialItem);
    this.entityNames = ['hurt_script', 'lightning_template', 'lightning_sound_script1', 'lightning_sound_script2'];
  }

  override onAllEntitiesSpawned(): void {
    this.hurtScript = this.first('hurt_script');
    this.template = this.first('lightning_template');
    this.sound1 = this.first('lightning_sound_script1');
    this.sound2 = this.first('lightning_sound_script2');
  }

  override onEntitySpawned(entity: EntityRef): void {
    const name = entity.name;
    if (!name) return;
    if (name.startsWith('lightning_start')) this.starts.push(entity);
    else if (name.startsWith('lightning_stop')) this.stops.push(entity);
    else if (name.startsWith('lightning_beam')) this.beams.push(entity);
  }

  pickUpSpecialItem(activator: EntityRef | null, caller: EntityRef | null): void {
    if (!activator || !caller) return;
    const pawn = pawnOf(activator);
    const slot = slotOf(pawn);
    if (slot === null) return;
    this.item = caller;
    this.player = pawn;
    setMessage(slot, 'Left click to attack nearby enemies with lightning.', 15);
  }

  tryLightning(): void {
    if (Server.gameTime < this.nextAvailable) return;
    if (this.item && (!valid(this.item) || !same(ownerOf(this.item), this.player?.ref))) this.player = null;
    const player = this.player;
    if (!player?.isValid) return;
    const origin = player.origin;
    if (!origin) return;
    const victim = closestPlayers(origin, 1, 1024, player, player.teamNum ?? -1)[0];
    if (!victim) return;
    this.nextAvailable = Server.gameTime + COOLDOWN;
    this.startLightning(player, victim);
  }

  private hurt(code: string, pawn: Pawn): void {
    this.rt.runScriptCode(this.hurtScript, code, pawn.ref, this.hurtScript);
  }

  private startLightning(start: Pawn, end: Pawn): void {
    this.hurt('SetAttacker(!activator, HurterFour)', start);
    this.hurt('SetAttacker(!activator, HurterFive)', start);

    fire(this.template, 'ForceSpawn');
    this.after(0.03, () => this.lightningBeam(start, end));
    this.after(0.5, () => this.hurt('HurtActivator(!activator, HurterFour)', end));
    this.rt.runScriptCode(this.sound1, 'PlaySound(!activator)', start.ref, this.sound1);
    this.rt.runScriptCode(this.sound2, 'PlaySound(!activator)', end.ref, this.sound2);

    const endOrigin = end.origin;
    let hit = 1;
    let delay = 0.05;
    for (const pawn of endOrigin ? closestPlayers(endOrigin, 4, 512, end, start.teamNum ?? -1) : []) {
      fire(this.template, 'ForceSpawn');
      this.after(delay, () => this.lightningBeam(end, pawn));
      this.after(delay + 0.1, () => this.hurt('HurtActivator(!activator, HurterFive)', pawn));
      delay += 0.05;
      hit++;
      if (hit >= BRANCHES) break;
    }
    this.display(start, hit);
  }

  private lightningBeam(start: Pawn, end: Pawn): void {
    const beamStart = this.starts[0] ?? null;
    let beamEnd: EntityRef | null = null;
    const startName = beamStart?.name ?? '';
    if (beamStart && !this.usedStarts.has(startName)) {
      this.usedStarts.add(startName);
      const suffix = startName.substring(15);
      beamEnd = this.stops.find((stop) => stop.name === `lightning_stop${suffix}`) ?? null;
      this.starts = this.starts.filter((s) => !same(s, beamStart));
      if (beamEnd) this.stops = this.stops.filter((s) => !same(s, beamEnd));
      fire(beamEnd, 'Kill', { delay: LIFETIME + 0.05, activator: beamEnd });
      fire(beamStart, 'Kill', { delay: LIFETIME + 0.05, activator: beamStart });
      for (const beam of this.beams) fire(beam, 'Kill', { delay: LIFETIME + 0.05 });
      this.beams = [];
    }
    if (!beamStart || !beamEnd) return;
    if (!start.isValid || !end.isValid) return;
    const from = start.origin;
    const to = end.origin;
    if (!from || !to) return;

    this.display(end, 0);
    teleport(beamStart, vec(from.x, from.y, from.z + 50));
    fire(beamStart, 'SetParent', { value: '!activator', activator: start.ref });
    teleport(beamEnd, vec(to.x, to.y, to.z + 50));
    fire(beamEnd, 'SetParent', { value: '!activator', activator: end.ref });
  }

  private display(pawn: Pawn, victims: number): void {
    setMessage(slotOf(pawn), victims > 0 ? `You hit ${victims} players with lightning!` : 'You were hit by lightning!', 2);
  }
}
