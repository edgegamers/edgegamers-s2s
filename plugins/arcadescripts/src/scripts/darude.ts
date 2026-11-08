// ArcadeScripts for s2script. Derived from ArcadeScripts-CSS by Supergosciuツ (GPL-3.0).
// See LICENSE and NOTICE. Port of Scripts/Darude/Darude.cs (darude.nut).
import type { EntityRef } from '@s2script/sdk';
import { Script } from '../script';
import type { Runtime } from '../runtime';
import { fire } from '../util';

const PREFIXES = new Set(['D', 'DA', 'DAR', 'DARU', 'DARUD']);

export class Darude extends Script {
  private input = '';
  private spawned = false;
  private template: EntityRef | null = null;

  constructor(owner: EntityRef, rt: Runtime) {
    super(owner, rt);
    this.fn('EnterCode', ['string'], this.enterCode);
    this.constants = { LETTER_D: 'D', LETTER_A: 'A', LETTER_R: 'R', LETTER_U: 'U', LETTER_E: 'E' };
    this.entityNames = ['disco_button7_template'];
  }

  override onAllEntitiesSpawned(): void {
    this.template = this.first('disco_button7_template');
  }

  enterCode(letter: string): void {
    if (this.spawned) return;
    this.input += letter;
    if (this.input === 'DARUDE') {
      fire(this.template, 'ForceSpawn');
      this.spawned = true;
      return;
    }
    if (!PREFIXES.has(this.input)) this.input = letter;
  }
}
