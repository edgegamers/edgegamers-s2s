// ArcadeScripts for s2script. Derived from ArcadeScripts-CSS by Supergosciuツ (GPL-3.0).
// See LICENSE and NOTICE. Port of Scripts/CellInstructions/CellInstructions.cs (cell_instructions.nut).
import type { EntityRef } from '@s2script/sdk';
import { Script } from '../script';
import type { Runtime } from '../runtime';
import { inBox, pawnAlive, players, setMessage, vec } from '../util';
import type { Vec } from '../util';

const html = (text: string): string => `<font class='fontSize-sm horizontal-center'>${text}</font>`;
const INSTRUCTIONS = [
  html('Climb and strafe to reach the goal.'),
  html('Climb to reach the goal.'),
  html('Climb the ice to reach the goal.'),
  html('Swim and avoid the walls to reach the green wall at the end.'),
  html('Ski, surf and drop to reach the goal.'),
  html('Crouch over the gaps to reach the goal.<br>Jumping is disabled.'),
  html('Avoid the lasers to reach the goal.'),
  html('Bunny hop on the platforms to reach the goal.'),
  html('Jump and strafe in midair over the gaps to reach the goal.'),
];
const AREAS: readonly [Vec, Vec][] = [
  [vec(452, -2112, 0), vec(960, -572, 0)], // strafe climb
  [vec(-60, -2112, 0), vec(444, -572, 0)], // climb
  [vec(-576, -2112, 0), vec(-68, -572, 0)], // ice climb
  [vec(-960, -576, 0), vec(-572, -224, 0)], // water race
  [vec(-960, -216, 0), vec(-572, 152, 0)], // surf
  [vec(-960, 160, 0), vec(-572, 512, 0)], // no jump
  [vec(-576, 508, 0), vec(-68, 2048, 0)], // lasers
  [vec(-60, 508, 0), vec(444, 2048, 0)], // bhop
  [vec(452, 508, 0), vec(960, 2048, 0)], // long jump
];

export class CellInstructions extends Script {
  private disabled = false;

  constructor(owner: EntityRef, rt: Runtime) {
    super(owner, rt);
    this.fn('DisableForAll', [], this.disableForAll);
    this.fn('DisplayHelpText', [], this.displayHelpText);
  }

  disableForAll(): void {
    this.disabled = true;
  }

  displayHelpText(): void {
    if (this.disabled) return;
    for (const { player, pawn } of players()) {
      if (!pawnAlive(pawn)) continue;
      const origin = pawn.origin;
      if (!origin) continue;
      const cell = AREAS.findIndex(([min, max]) => inBox(origin, min, max, false));
      if (cell >= 0) setMessage(player.slot, INSTRUCTIONS[cell]!, 4);
    }
  }
}
