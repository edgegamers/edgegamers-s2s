/**
 * Race (C# `Race`, disabled by default like the C# factory — see `lr_race_enabled`). The prisoner
 * walks to a finish point and types `!endrace`; both are teleported back to the start, frozen for
 * a second, then race. The finish radius grows over time; first one inside wins, the loser is slain.
 */
import type { LRResult, LRType } from "../../api";
import { Colors } from "@edgegamers/jailbreak-shared";
import { distSq, raceRequiredDistance } from "../logic";
import { msg } from "../messages";
import { Ring } from "../fx";
import { TeleportingRequest } from "./base";

type Point = { x: number; y: number; z: number };

export class Race extends TeleportingRequest {
  readonly type: LRType = "race";
  private start: Point | null = null;
  private end: Point | null = null;
  private startRing: Ring | null = null;
  private endRing: Ring | null = null;
  private raceStart = 0;

  setup(): void {
    super.setup();
    this.prisoner.strip();
    this.guard.strip();
    for (let i = 0; i < 3; i++) this.prisoner.chat(msg.endRaceInstruction());
    this.guard.chat(msg.raceStarting(this.prisoner.name));

    this.start = this.prisoner.origin();
    if (!this.start) return;
    this.startRing = new Ring(Colors.Cyan);
    this.startRing.draw(this.start, 20);
    const gp = this.guard.pawn;
    if (gp) gp.takesDamage = false;
  }

  /** `!endrace`: the prisoner's position becomes the finish. */
  execute(): void {
    this.end = this.prisoner.origin();
    if (!this.end || !this.start) return;
    this.endRing = new Ring(Colors.Red);
    this.endRing.draw(this.end, 10);

    this.prisoner.teleport(this.start);
    this.guard.teleport(this.start);
    const pp = this.prisoner.pawn;
    if (pp) pp.takesDamage = false;

    this.guard.freeze();
    this.prisoner.freeze();
    this.after(1000, () => {
      this.guard.unfreeze();
      this.prisoner.unfreeze();
    });

    this.state = "active";
    this.raceStart = Date.now();
    this.every(100, () => this.tick());
  }

  private tick(): void {
    if (!this.prisoner.present || !this.guard.present) {
      this.finish("interrupted");
      return;
    }
    if (!this.end) return;
    const required = raceRequiredDistance((Date.now() - this.raceStart) / 1000);
    this.endRing?.draw(this.end, required / 2);
    const requiredSq = required * required;

    const g = this.guard.origin();
    if (g && distSq(g, this.end) < requiredSq) {
      this.finish("guard_win");
      return;
    }
    const p = this.prisoner.origin();
    if (p && distSq(p, this.end) < requiredSq) this.finish("prisoner_win");
  }

  onEnd(result: LRResult): void {
    const pp = this.prisoner.pawn;
    if (pp) pp.takesDamage = true;
    const gp = this.guard.pawn;
    if (gp) gp.takesDamage = true;
    this.slayLoser(result);
    this.startRing?.remove();
    this.endRing?.remove();
  }
}
