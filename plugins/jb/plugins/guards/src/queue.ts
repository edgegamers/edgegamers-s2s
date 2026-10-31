/**
 * The guard queue — pure (CTBans QueueService). Holds SteamID64 strings in order; priority lookups
 * and randomness are injected so tests are deterministic.
 */
import { skipChance } from "./priority.ts";

export type NoticeKind = "moved" | "priority" | "probability";

export interface Notice {
  steamId: string;
  kind: NoticeKind;
  /** 1-based position after the change. */
  position: number;
  size: number;
  /** Skip chance in percent (2 dp) for "probability"; 0 otherwise. */
  chance: number;
}

export type PriorityOf = (steamId: string) => number;

export class GuardQueue {
  private list: string[] = [];

  ids(): readonly string[] {
    return this.list;
  }

  size(): number {
    return this.list.length;
  }

  has(id: string): boolean {
    return this.list.includes(id);
  }

  /** 0-based position, or -1. */
  position(id: string): number {
    return this.list.indexOf(id);
  }

  /**
   * Insert by priority: walk from the back; pass players with unknown priority freely, pass others
   * with probability `skipChance`, stop at the first failed pass. Players now behind the joiner get
   * a notice; `skippedByChance` counts those passed with a chance below 1.
   */
  add(
    id: string,
    prio: PriorityOf,
    normal: number,
    random: () => number,
  ): { notices: Notice[]; skippedByChance: number } {
    if (this.has(id)) return { notices: [], skippedByChance: 0 };
    const mine = prio(id);
    if (mine < 0) {
      this.list.push(id);
      return { notices: [], skippedByChance: 0 };
    }
    let insertAt = 0;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const theirs = prio(this.list[i]);
      if (theirs < 0) continue;
      if (random() >= skipChance(mine, theirs, normal)) {
        insertAt = i + 1;
        break;
      }
    }
    this.list.splice(insertAt, 0, id);
    const notices: Notice[] = [];
    let skippedByChance = 0;
    for (let j = insertAt + 1; j < this.list.length; j++) {
      const other = this.list[j];
      const chance = skipChance(mine, prio(other), normal);
      const partial = chance < 1;
      if (partial) skippedByChance++;
      notices.push({
        steamId: other,
        kind: partial ? "probability" : "priority",
        position: j + 1,
        size: this.list.length,
        chance: partial ? Math.round(chance * 10000) / 100 : 0,
      });
    }
    return { notices, skippedByChance };
  }

  /** Remove `id`; everyone who was behind them gets a "moved" notice. */
  remove(id: string): Notice[] {
    const at = this.list.indexOf(id);
    if (at < 0) return [];
    this.list.splice(at, 1);
    return this.movedFrom(at);
  }

  popFront(): string | undefined {
    return this.list.shift();
  }

  removeWhere(pred: (id: string) => boolean): void {
    this.list = this.list.filter((id) => !pred(id));
  }

  /** Empty the queue, returning who was in it. */
  clear(): string[] {
    const was = this.list;
    this.list = [];
    return was;
  }

  /** "moved" notices for everyone from index `from` on. */
  movedFrom(from: number): Notice[] {
    const out: Notice[] = [];
    for (let j = from; j < this.list.length; j++) {
      out.push({ steamId: this.list[j], kind: "moved", position: j + 1, size: this.list.length, chance: 0 });
    }
    return out;
  }
}

export type JoinRequest = "auto" | "t" | "ct" | "spec";

/** CTBans JoinTeamListener's team parsing: numeric index or name; anything else is auto-assign. */
export function parseJoinTeam(argString: string): JoinRequest {
  const arg = argString.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  switch (arg) {
    case "1":
    case "s":
    case "spec":
    case "spectator":
    case "spectators":
      return "spec";
    case "2":
    case "t":
    case "terrorist":
      return "t";
    case "3":
    case "ct":
    case "counterterrorist":
    case "counter":
      return "ct";
    default:
      return "auto";
  }
}
