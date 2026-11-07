// ArcadeScripts for s2script. Derived from ArcadeScripts-CSS by Supergosciuツ (GPL-3.0).
// See LICENSE and NOTICE. Port of Scripts/Timer/Timer.cs (timer.nut).
import { Server } from '@s2script/sdk';
import type { EntityRef } from '@s2script/sdk';
import type { Pawn } from '@s2script/cs2';
import { Script } from '../script';
import type { Runtime } from '../runtime';
import { fire, keyOf, num, pawnOf, setMessage, slotOf } from '../util';

const SCORES = ['surf_timer_score1', 'surf_timer_score2', 'surf_timer_score3'];
const RECORDS = ['surf_timer_record0', 'surf_timer_record1', 'surf_timer_record2'];

export class SurfTimer extends Script {
  private winners = 0;
  private difficulty = 0;
  private maxZ: number | null = null;
  private readonly startTime = new Map<number, number>();
  private readonly endTime = new Map<number, number>();
  private readonly bestTimes = [0, 0, 0];
  private readonly pawns = new Map<number, Pawn>();
  private timer: EntityRef | null = null;

  constructor(owner: EntityRef, rt: Runtime) {
    super(owner, rt);
    this.fn('SetWinners', ['int'], this.setWinners);
    this.fn('DisplayGameInformation', [], this.displayGameInformation);
    this.fn('SetPlayerInGame', ['entity', 'bool'], this.setPlayerInGame);
    this.fn('SetDifficulty', ['int'], this.setDifficulty);
    this.fn('EndTimer', ['entity'], this.endTimer);
    this.fn('StartTimer', ['entity'], this.startTimer);
    this.fn('InitializeBestTimes', [], this.initializeBestTimes);
    this.fn('SetMaxZ', ['float'], this.setMaxZ);
    this.entityNames = ['surf_timer_timer', ...SCORES, ...RECORDS];
  }

  override onAllEntitiesSpawned(): void {
    this.timer = this.first('surf_timer_timer');
  }

  /** Upstream keeps best times on the script instance, so every round starts without records. */
  initializeBestTimes(): void {
    for (let diff = 0; diff < 3; diff++) if (this.bestTimes[diff]! > 0.1) this.updateRecordText(diff);
  }

  startTimer(activator: EntityRef | null): void {
    const slot = slotOf(pawnOf(activator));
    if (slot === null) return;
    this.startTime.set(slot, Server.gameTime);
    this.endTime.set(slot, 0);
  }

  endTimer(activator: EntityRef | null): void {
    const slot = slotOf(pawnOf(activator));
    if (slot === null) return;
    const end = Server.gameTime;
    this.endTime.set(slot, end);
    if (this.winners <= 2) {
      const total = end - (this.startTime.get(slot) ?? 0);
      // The visible time for 1st, 2nd and 3rd place.
      fire(this.first(SCORES[this.winners]!), 'SetMessage', { value: `${num(total)}s` });
      // The map record for this difficulty.
      const best = this.bestTimes[this.difficulty]!;
      if (best < 0.1 || total < best) {
        this.bestTimes[this.difficulty] = total;
        this.updateRecordText(this.difficulty);
      }
    }
    this.displayTo(slot, true);
    this.winners++;
  }

  setWinners(value: number): void {
    this.winners = value;
  }

  setDifficulty(difficulty: number): void {
    this.difficulty = difficulty;
  }

  private updateRecordText(diff: number): void {
    fire(this.first(RECORDS[diff]!), 'SetMessage', { value: `${num(this.bestTimes[diff]!)}s` });
  }

  displayGameInformation(): void {
    let shown = 0;
    for (let slot = 0; slot <= Server.maxPlayers; slot++) shown += this.displayTo(slot, false);
    if (shown === 0) fire(this.timer, 'Disable');
  }

  private displayTo(slot: number, wonGame: boolean): number {
    const pawn = this.pawns.get(slot);
    if (!pawn?.isValid || (pawn.health ?? 0) <= 0) return 0;
    const z = pawn.origin?.z ?? 0;
    if (!wonGame && this.maxZ !== null && z > this.maxZ) return 0;
    const end = this.endTime.get(slot) ?? 0;
    const start = this.startTime.get(slot) ?? 0;
    const elapsed = end > 0 ? end - start : Server.gameTime - start;
    setMessage(slot, `Time: ${wonGame ? num(elapsed) : Math.trunc(elapsed)}s`, 2);
    return 1;
  }

  setPlayerInGame(activator: EntityRef | null, inGame: boolean): void {
    const pawn = pawnOf(activator);
    const slot = slotOf(pawn);
    if (!pawn || slot === null) return;
    if (inGame) {
      this.pawns.set(slot, pawn);
      this.displayTo(slot, false);
      this.rt.inGame.add(keyOf(pawn.ref));
    } else {
      this.rt.inGame.delete(keyOf(pawn.ref));
      this.pawns.delete(slot);
    }
  }

  setMaxZ(z: number): void {
    this.maxZ = z;
  }
}
