// ArcadeScripts for s2script. Derived from ArcadeScripts-CSS by Supergosciuツ (GPL-3.0).
// See LICENSE and NOTICE. Port of Scripts/BlockJump/BlockJump.cs (blockjump.nut).
import type { EntityRef } from '@s2script/sdk';
import { Script } from '../script';
import type { Runtime } from '../runtime';
import { pawnOf, pawnValid, same } from '../util';

export class BlockJump extends Script {
  private disabled: EntityRef[] = [];

  constructor(owner: EntityRef, rt: Runtime) {
    super(owner, rt);
    this.fn('DisableJumping', ['entity'], this.disableJumping);
    this.fn('EnableJumping', ['entity'], this.enableJumping);
  }

  override think(): void {
    this.disabled = this.disabled.filter((ref) => ref.isValid());
    for (const ref of this.disabled) {
      const pawn = pawnOf(ref);
      if (!pawnValid(pawn)) continue;
      const v = pawn.absVelocity;
      if (v && v.z > 0) pawn.setVelocity(v.x, v.y, 0);
    }
  }

  disableJumping(activator: EntityRef | null): void {
    if (activator) this.disabled.push(activator);
  }

  enableJumping(activator: EntityRef | null): void {
    if (!activator) return;
    const index = this.disabled.findIndex((ref) => same(ref, activator));
    if (index >= 0) this.disabled.splice(index, 1);
  }
}
