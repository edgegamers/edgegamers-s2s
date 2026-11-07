// ArcadeScripts for s2script. Derived from ArcadeScripts-CSS by Supergosciuツ (GPL-3.0).
// See LICENSE and NOTICE. Port of Scripts/PlaySoundAt/PlaySoundAt.cs (playsoundat.nut).
import type { EntityRef } from '@s2script/sdk';
import { Script } from '../script';
import type { Runtime } from '../runtime';
import { fire, originOf, randomInt, teleport, valid } from '../util';

/** The sound target, then the sounds to pick from, for each logic_script targetname. */
const GROUPS: Readonly<Record<string, readonly string[]>> = {
  lightning_sound_script1: ['lightning_sound_target1', 'lightning_sound1'],
  lightning_sound_script2: ['lightning_sound_target2', 'lightning_sound2'],
  toxic_river_sound_script: ['toxic_river_sound_target', 'toxic_river_sound'],
  climb_winning_sound_script: ['climb_winning_sound_target', 'climb_winning_sound'],
  cell_bhop_sound_script: [
    'cell_bhop_sound_target', 'cell_bhop_sound1', 'cell_bhop_sound2', 'cell_bhop_sound3', 'cell_bhop_sound4', 'cell_bhop_sound5',
  ],
  sj_winning_sound_script: ['sj_winning_sound_target', 'sj_winning_sound'],
  surf_winning_sound_script: ['surf_winning_sound_target', 'surf_winning_sound'],
};

export class PlaySoundAt extends Script {
  private readonly groupNames: readonly string[];
  private group: (EntityRef | null)[] = [];

  constructor(owner: EntityRef, rt: Runtime) {
    super(owner, rt);
    this.fn('PlaySound', ['entity'], this.playSound);
    this.groupNames = GROUPS[owner.name ?? ''] ?? [];
    this.entityNames = [...this.groupNames];
  }

  override onAllEntitiesSpawned(): void {
    this.group = this.groupNames.map((name) => this.first(name));
  }

  playSound(activator: EntityRef | null): void {
    if (!activator) return;
    // Upstream caches the first instance's sound count in a static; each script uses its own here.
    const sounds = this.group.slice(1).filter(valid);
    teleport(this.group[0], originOf(activator));
    if (sounds.length === 0) return;
    fire(sounds[randomInt(0, sounds.length - 1)], 'PlaySound', { delay: 0.05, activator });
  }
}
