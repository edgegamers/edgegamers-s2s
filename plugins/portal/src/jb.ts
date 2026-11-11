/**
 * The Jailbreak collector: turns `@edgegamers/jailbreak-*` forwards and the `player_death` /
 * `player_hurt` game events into portal events. Pure: the wiring in plugin.ts hands it the core
 * methods and the connected clients, so tests drive it with fakes.
 *
 * Every in-round event carries `atMs` (ms since round start, on the tick clock). Players go on the
 * wire as {@link WirePlayer}. The event list and payloads are documented in README.md and in
 * s2s-cs-web `docs/jb-events.md`, which derives the round tables from them.
 */
import type { EventBuilder, PortalEvent } from "./envelope.ts";

export type TeamName = "none" | "spectator" | "prisoner" | "guard";

/** The player reference every Jailbreak forward carries. */
export interface PlayerRef {
  slot: number;
  userId: number;
  steamId: string;
  name: string;
}

/** A player as sent to the portal: identity plus the team at that moment. */
export interface WirePlayer {
  steamId: string;
  name: string;
  team: TeamName;
  /** Present (true) only for bots. */
  bot?: true;
}

/** The core methods used here (a subset of `JbCore`). */
export interface JbCoreView {
  getTeam(slot: number): TeamName;
  getRound(): { mode: string; phase?: string };
  getPlayer?(slot: number): PlayerRef | null;
  isRebel?(slot: number): boolean;
}

/** A connected client. `bot` is false for humans. */
export interface Human {
  slot: number;
  bot?: boolean;
}

export interface TeamCounts {
  prisoner: number;
  guard: number;
}

/** Humans per team (bots and spectators are not counted). */
export function teamCounts(core: JbCoreView, clients: readonly Human[]): TeamCounts {
  const counts: TeamCounts = { prisoner: 0, guard: 0 };
  for (const h of clients) {
    if (h.bot) continue;
    const team = core.getTeam(h.slot);
    if (team === "prisoner" || team === "guard") counts[team]++;
  }
  return counts;
}

/** A Jailbreak LR as the lastrequest forwards describe it. */
interface LRInfo {
  id: number;
  type: string;
  prisoner: PlayerRef;
  guard: PlayerRef;
}

/** A special day as the specialdays forwards describe it. */
interface SDInfo {
  type: string;
  name: string;
  starterSteamId: string;
}

/** What the bridge reads off a `player_death` before core clears the victim's rebel mark. */
export interface DeathInfo {
  victim: number;
  /** Slot, or -1 for the world. */
  attacker: number;
  assister: number;
  weapon: string;
  headshot: boolean;
}

export interface HurtInfo {
  victim: number;
  attacker: number;
  damage: number;
  weapon: string;
}

export class JbEvents {
  private readonly builder: EventBuilder;
  private readonly core: JbCoreView;
  private readonly clients: () => readonly Human[];
  private readonly emit: (event: PortalEvent) => void;

  constructor(builder: EventBuilder, core: JbCoreView, clients: () => readonly Human[], emit: (event: PortalEvent) => void) {
    this.builder = builder;
    this.core = core;
    this.clients = clients;
    this.emit = emit;
  }

  // ---- core ----

  onRoundStart(ev: { round: number }): void {
    const all = this.clients();
    this.emit(
      this.builder.startRound("jb.round.start", {
        number: ev.round,
        players: teamCounts(this.core, all),
        bots: this.botCount(all),
        warmup: this.core.getRound().phase === "warmup",
        roster: this.roster(all),
      }),
    );
  }

  onRoundLive(): void {
    if (this.builder.markLive()) this.inRound("jb.round.live", {});
  }

  onRoundEnd(ev: { round: number; winner: TeamName; adminEnded?: boolean }): void {
    const all = this.clients();
    const event = this.builder.endRound("jb.round.end", {
      number: ev.round,
      winner: ev.winner,
      mode: this.core.getRound().mode,
      players: teamCounts(this.core, all),
      bots: this.botCount(all),
      adminEnded: ev.adminEnded === true,
      roster: this.roster(all),
    });
    if (event) this.emit(event);
  }

  onModeChanged(ev: { mode: string; previous: string }): void {
    this.inRound("jb.mode", { mode: ev.mode, previous: ev.previous });
  }

  onCellsOpened(ev: { source: string; player?: PlayerRef | null }): void {
    this.inRound("jb.cells", { source: ev.source, by: ev.player ? this.player(ev.player) : null });
  }

  onRebelChanged(ev: { player: PlayerRef; rebel: boolean; reason: string }): void {
    this.inRound("jb.rebel", { player: this.player(ev.player), rebel: ev.rebel, reason: ev.reason });
  }

  onBombDetonated(ev: { player: PlayerRef; killed: number; killedGuards: number }): void {
    this.inRound("jb.bomb", { player: this.player(ev.player), killed: ev.killed, killedGuards: ev.killedGuards });
  }

  onLog(ev: { message: string }): void {
    this.inRound("jb.log", { message: ev.message.slice(0, 512) });
  }

  // ---- warden ----

  onWardenAssigned(ev: { player: PlayerRef }): void {
    this.inRound("jb.warden.assigned", { player: this.player(ev.player) });
  }

  onWardenRemoved(ev: { player: PlayerRef; reason: string }): void {
    this.inRound("jb.warden.removed", { player: this.player(ev.player), reason: ev.reason });
  }

  // ---- lastrequest ----

  onLREnabled(ev: { prisoners: number }): void {
    this.inRound("jb.lr.enabled", { prisoners: ev.prisoners });
  }

  onLRStart(ev: { lr: LRInfo }): void {
    this.inRound("jb.lr.start", { lr: this.lr(ev.lr) });
  }

  onLREnd(ev: { lr: LRInfo; result: string }): void {
    this.inRound("jb.lr.end", { lr: this.lr(ev.lr), result: ev.result });
  }

  onLastGuardStart(ev: { guard: PlayerRef; prisoners: number }): void {
    this.inRound("jb.lastguard.start", { guard: this.player(ev.guard), prisoners: ev.prisoners });
  }

  onLastGuardEnd(ev: { guard: PlayerRef; result: string }): void {
    this.inRound("jb.lastguard.end", { guard: this.player(ev.guard), result: ev.result });
  }

  // ---- specialdays ----

  onSpecialDayStart(ev: { day: SDInfo }): void {
    this.inRound("jb.specialday.start", this.day(ev.day));
  }

  onSpecialDayEnd(ev: { day: SDInfo }): void {
    this.inRound("jb.specialday.end", this.day(ev.day));
  }

  // ---- game events ----

  /**
   * `player_death`, read in the pre hook: core clears the victim's rebel mark in its own handler,
   * and the stats need whether the victim (and the killer) was a rebel at the moment of death.
   */
  onDeath(d: DeathInfo): void {
    const victim = this.slotPlayer(d.victim);
    if (!victim) return;
    const attacker = d.attacker >= 0 && d.attacker !== d.victim ? this.slotPlayer(d.attacker) : null;
    const assister = d.assister >= 0 ? this.slotPlayer(d.assister) : null;
    this.inRound("jb.death", {
      victim,
      attacker,
      assister,
      weapon: d.weapon.slice(0, 64),
      headshot: d.headshot,
      victimRebel: this.rebel(d.victim),
      attackerRebel: attacker ? this.rebel(d.attacker) : false,
    });
  }

  /** `player_hurt`, prisoner on guard only: that is what rebel spells count. */
  onHurt(h: HurtInfo): void {
    if (h.attacker < 0 || h.attacker === h.victim || h.damage <= 0) return;
    if (this.core.getTeam(h.attacker) !== "prisoner" || this.core.getTeam(h.victim) !== "guard") return;
    const attacker = this.slotPlayer(h.attacker);
    const victim = this.slotPlayer(h.victim);
    if (!attacker || !victim) return;
    this.inRound("jb.hurt", { attacker, victim, damage: Math.round(h.damage), weapon: h.weapon.slice(0, 64), attackerRebel: this.rebel(h.attacker) });
  }

  onMapStart(): void {
    this.builder.reset();
  }

  // ---- helpers ----

  private inRound(type: string, data: Record<string, unknown>): void {
    const event = this.builder.inRound(type, data);
    if (event) this.emit(event);
  }

  private isBot(slot: number): boolean {
    return this.clients().some((c) => c.slot === slot && c.bot === true);
  }

  private player(ref: PlayerRef): WirePlayer {
    const p: WirePlayer = { steamId: ref.steamId, name: ref.name.slice(0, 64), team: this.core.getTeam(ref.slot) };
    if (this.isBot(ref.slot)) p.bot = true;
    return p;
  }

  private slotPlayer(slot: number): WirePlayer | null {
    const ref = this.core.getPlayer?.(slot) ?? null;
    return ref ? this.player(ref) : null;
  }

  private rebel(slot: number): boolean {
    return this.core.isRebel?.(slot) ?? false;
  }

  private botCount(all: readonly Human[]): number {
    return all.filter((c) => c.bot === true && this.onTeam(c.slot)).length;
  }

  private onTeam(slot: number): boolean {
    const t = this.core.getTeam(slot);
    return t === "prisoner" || t === "guard";
  }

  /** Everyone on a team: who played the round. */
  private roster(all: readonly Human[]): WirePlayer[] {
    const out: WirePlayer[] = [];
    for (const c of all) {
      if (!this.onTeam(c.slot)) continue;
      const p = this.slotPlayer(c.slot);
      if (p) out.push(p);
    }
    return out;
  }

  private lr(lr: LRInfo): Record<string, unknown> {
    return { id: lr.id, type: lr.type, prisoner: this.player(lr.prisoner), guard: this.player(lr.guard) };
  }

  private day(day: SDInfo): Record<string, unknown> {
    return { type: day.type, name: day.name.slice(0, 64), starterSteamId: day.starterSteamId };
  }
}
