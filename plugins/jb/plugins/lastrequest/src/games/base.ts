/**
 * The shape every last-request game shares (C# `AbstractLastRequest`, `TeleportingRequest`,
 * `WeaponizedRequest`). A game owns its timers; they all die when the LR ends.
 */
import { after, every } from "@s2script/sdk";
import type { Timer } from "@s2script/sdk";
import type { Weapon } from "@s2script/cs2";
import type { LRInfo, LRResult, LRType } from "../../api";
import type { Participant } from "../players";
import { msg } from "../messages";

export type LRState = "pending" | "active" | "completed";

/** What a game needs from the manager. */
export interface LRHost {
  /** End this LR with a result (removes it, runs `onEnd`, emits OnLREnd). */
  end(lr: LastRequest, result: LRResult): void;
}

export abstract class LastRequest {
  abstract readonly type: LRType;
  state: LRState = "pending";
  private timers: Timer[] = [];

  constructor(
    protected readonly host: LRHost,
    readonly id: number,
    readonly prisoner: Participant,
    readonly guard: Participant,
  ) {}

  /**
   * Optional pre-setup step (C# `ILastRequestConfig`): e.g. pick a weapon from a menu. Call
   * `done` to continue or `cancel` to abandon the LR before it starts.
   */
  configure(done: () => void, _cancel: () => void): void {
    done();
  }

  /** Called once when the LR is registered. */
  abstract setup(): void;
  /** The "go" step (some games call it from a timer, race from `!endrace`). */
  execute(): void {}
  /** Clean up / punish the loser. The LR is already removed from the active list. */
  onEnd(_result: LRResult): void {}

  /**
   * Block a weapon pickup? Default (C#): once the LR is past pending, its participants can't
   * pick anything up.
   */
  preventEquip(slot: number, _defIndex: number): boolean {
    if (this.state === "pending") return false;
    return this.isParticipant(slot);
  }

  /** A participant dropped/threw a weapon (already tinted by the manager). */
  onWeaponDrop(_slot: number, _weapon: Weapon): void {}
  /** A participant fired (`weapon_fire`). */
  onWeaponFire(_slot: number): void {}
  /** Every game frame while active. */
  onFrame(): void {}

  isParticipant(slot: number): boolean {
    return slot === this.prisoner.slot || slot === this.guard.slot;
  }

  /** The other side of the pair. */
  opponentOf(slot: number): Participant {
    return slot === this.prisoner.slot ? this.guard : this.prisoner;
  }

  tell(message: string): void {
    this.prisoner.chat(message);
    this.guard.chat(message);
  }

  info(): LRInfo {
    return {
      id: this.id,
      type: this.type,
      prisoner: this.prisoner.ref(),
      guard: this.guard.ref(),
      state: this.state === "active" ? "active" : "pending",
    };
  }

  /** A timer owned by this LR: skipped once it completes, killed by {@link dispose}. */
  protected after(ms: number, fn: () => void): Timer {
    const t = after(ms, () => {
      if (this.state !== "completed") fn();
    });
    this.timers.push(t);
    return t;
  }

  /** A repeating timer owned by this LR (killed by {@link dispose}). */
  protected every(ms: number, fn: () => void): Timer {
    const t = every(ms, () => {
      if (this.state !== "completed") fn();
    });
    this.timers.push(t);
    return t;
  }

  protected finish(result: LRResult): void {
    this.host.end(this, result);
  }

  /** Kill every timer. Called by the manager after `onEnd`. */
  dispose(): void {
    for (const t of this.timers) t.kill();
    this.timers = [];
  }

  /** C# `WeaponizedRequest.OnEnd`: the loser dies. */
  protected slayLoser(result: LRResult): void {
    if (result === "guard_win") this.prisoner.slay();
    else if (result === "prisoner_win") this.guard.slay();
  }
}

/**
 * C# `TeleportingRequest`: the guard is brought to the prisoner, both frozen briefly
 * (guard released after 1s, prisoner after 2s).
 */
export abstract class TeleportingRequest extends LastRequest {
  setup(): void {
    this.state = "pending";
    const o = this.prisoner.origin();
    if (o) this.guard.teleport(o);
    this.guard.freeze();
    this.prisoner.freeze();
    this.after(1000, () => this.guard.unfreeze());
    this.after(2000, () => this.prisoner.unfreeze());
  }
}

/**
 * C# `WeaponizedRequest`: strip both, count down 5..1 in chat, then {@link execute}.
 * The loser is slain when it ends.
 */
export abstract class WeaponizedRequest extends TeleportingRequest {
  setup(): void {
    super.setup();
    this.prisoner.strip();
    this.guard.strip();
    for (let i = 5; i >= 1; i--) {
      const n = i;
      this.after((5 - i) * 1000, () => this.tell(msg.countdown(n)));
    }
    this.after(5000, () => {
      if (this.state === "pending") this.execute();
    });
  }

  onEnd(result: LRResult): void {
    this.slayLoser(result);
  }
}
