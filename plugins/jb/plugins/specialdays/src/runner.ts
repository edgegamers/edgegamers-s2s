import {logEntry} from '@edgegamers/jailbreak-shared';
import {forRecipients} from '@edgegamers/jailbreak-shared';
import {plainPhraseFor as labelFor,phraseFor} from '@edgegamers/jailbreak-shared';
/**
 * The shared part of every special day (AbstractSpecialDay): convars, round time, respawn/health/
 * strip, invulnerability, rebels, cells, teleports, freeze, zone restriction, the pickup gate and
 * the day's timers. One DayRun per started day; `end()` undoes everything it set.
 */
import { after as sdkAfter, every as sdkEvery, Server } from "@s2script/sdk";
import type { Timer } from "@s2script/sdk";
import { Player } from "@s2script/cs2";
import type { SDType } from "../api";
import type { DayContext, SpecialDay } from "./day.ts";
import type { TeleportType } from "./settings.ts";
import { FRAME_DELAYED_CONVARS } from "./settings.ts";
import type { Vec3 } from "./geometry.ts";
import { pickSpawns, ShuffleBag, shuffle } from "./geometry.ts";
import { pickupAllowed } from "./weapons.ts";
import { setPickupRule } from "./pickup.ts";
import { ZoneRestriction, restrictionArea } from "./restrict.ts";
import { zoneCenters } from "./zones.ts";
import { msgFor } from "./messages.ts";
import {
  alive,
  ctSpawns,
  freeze,
  give,
  livePawn,
  onTeam,
  playing,
  setArmor,
  setHealth,
  setMaxHealth,
  setTakesDamage,
  setTimeRemaining,
  strip,
  Team,
  teleport,
  teleportDestinations,
  toAll,
  toTeam,
  tSpawns,
  unfreeze,
} from "./game.ts";

/** What the runner needs from @edgegamers/jailbreak-core. */
export interface CoreHooks {
  disableRebelsForRound(): void;
  openCells(source: string): boolean;
  log(message: string, presentation?: { key: string; args: (string | number)[]; labels?: number[] }): void;
}

function setCvar(name: string, value: string): boolean {
  if (FRAME_DELAYED_CONVARS.has(name)) {
    // Needs a frame to reach clients (the C# set it on the next frame); the console queues it.
    const v = value === "true" ? "1" : value === "false" ? "0" : value;
    Server.command(`${name} ${v}`);
    return true;
  }
  return Server.setCvar(name, value);
}

export class DayRun implements DayContext {
  private timers: Timer[] = [];
  private readonly convarBackup = new Map<string, string>();
  private restriction: ZoneRestriction | null = null;
  private ended = false;
  private didExecute = false;

  constructor(
    readonly day: SpecialDay,
    private readonly core: CoreHooks,
  ) {}

  get type(): SDType {
    return this.day.type;
  }
  get name(): string {
    return this.day.name;
  }
  get executed(): boolean {
    return this.didExecute;
  }
  get active(): boolean {
    return !this.ended;
  }

  // ── timers (guarded: nothing fires after the day ended) ─────────────────────────────────────
  at(seconds: number, fn: () => void): void {
    this.after(Math.max(0, seconds) * 1000, fn);
  }
  after(ms: number, fn: () => void): Timer {
    const t = sdkAfter(Math.max(1, ms), () => {
      if (!this.ended) fn();
    });
    return this.own(t);
  }
  every(ms: number, fn: () => void): Timer {
    const t = sdkEvery(Math.max(1, ms), () => {
      if (!this.ended) fn();
    });
    return this.own(t);
  }

  private own(t: Timer): Timer {
    if (this.timers.length > 256) this.timers = this.timers.filter((x) => x.alive);
    this.timers.push(t);
    return t;
  }

  beginsIn(seconds: number): void {
    toAll(forRecipients((recipient,value0,value1) => this.day.beginsIn?.(seconds,recipient) ?? msgFor(recipient).beginsIn(value0, value1), this.day.name,seconds));
  }

  disarmPickups(): void {
    setPickupRule(null);
  }

  setConvar(name: string, value: string): void {
    if (!this.convarBackup.has(name)) {
      const prev = Server.getCvar(name);
      this.convarBackup.set(name, prev);
    }
    if (!setCvar(name, value)) console.log(`[specialdays] invalid convar: ${name}`);
  }

  panic(reason: string): void {
    toAll(recipient => msgFor(recipient).error(labelFor(recipient,"JB_SPECIALDAYS_LABEL_PANIC", String(reason))));
    this.core.log(...logEntry("JB_LOG_SPECIAL_DAY_PANICKED", [String(this.day.name), String(reason)], [0,1]));
    Server.setCvar("mp_ignore_round_win_conditions", "0");
    setTimeRemaining(1);
  }

  // ── setup (AbstractSpecialDay.Setup) ───────────────────────────────────────────────────────
  start(): void {
    const s = this.day.settings;
    this.day.setup?.(this);

    for (const [name, value] of Object.entries(s.convars)) this.setConvar(name, value);
    setTimeRemaining(s.roundTime());

    for (const p of playing()) {
      if (s.respawnPlayers && p.pawnIsAlive === false) p.respawn();
      const hp = s.initialHealth(p);
      if (hp !== -1) setHealth(p, hp);
      const max = s.initialMaxHealth(p);
      if (max !== -1) setMaxHealth(p, max);
      const armor = s.initialArmor(p);
      if (armor !== -1) setArmor(p, armor);
      if (s.stripToKnife) {
        strip(p);
        give(p, "weapon_knife");
      }
    }

    if (s.startInvulnerable) for (const p of alive()) setTakesDamage(p, false);
    if (!s.allowRebels) this.core.disableRebelsForRound();
    if (s.openCells) this.core.openCells("specialday");

    this.doTeleports();

    if (s.freezePlayers) {
      for (const p of Player.all()) {
        if (!livePawn(p)) continue;
        freeze(p);
        const userId = p.userId;
        this.at(s.freezeTime(p), () => {
          const q = Player.fromUserId(userId);
          if (q) unfreeze(q);
        });
      }
    }

    // AbstractZoneRestrictedDay.Setup
    const r = this.day.restrict;
    if (r) {
      toTeam(r.teamNum, r.reminder);
      const area = restrictionArea(r.kind);
      if (area) {
        this.restriction = new ZoneRestriction(area, r.teamNum, r.reminder);
        this.restriction.start();
      }
    }

    this.day.afterSetup?.(this);
  }

  private doTeleports(): void {
    const s = this.day.settings;
    if (s.ctTeleport === s.tTeleport) {
      // Same type for both teams: one bag for everyone.
      this.teleportGroup(s.ctTeleport, alive());
      return;
    }
    this.teleportGroup(s.ctTeleport, onTeam(Team.Guard));
    this.teleportGroup(s.tTeleport, onTeam(Team.Prisoner));
  }

  private teleportGroup(type: TeleportType, players: Player[]): void {
    if (type === "none") return;
    const positions = this.positionsFor(type);
    if (positions.length === 0) return;
    const bag = new ShuffleBag(positions);
    for (const p of players) {
      if (!livePawn(p)) continue;
      const to = bag.next();
      if (to) teleport(p, to);
    }
  }

  private positionsFor(type: TeleportType): Vec3[] {
    const t = shuffle(tSpawns());
    const ct = shuffle(ctSpawns());
    switch (type) {
      case "cell":
        return t;
      case "cell_stacked":
        return t.slice(0, 1);
      case "armory":
        return ct;
      case "armory_stacked":
        return ct.slice(0, 1);
      case "random":
        return randomSpawns(alive().length);
      case "random_stacked":
        return randomSpawns(1).slice(0, 1);
      default:
        return [];
    }
  }

  // ── execute (AbstractSpecialDay.Execute) ───────────────────────────────────────────────────
  execute(): void {
    if (this.didExecute || this.ended) return;
    this.didExecute = true;
    if (!this.day.skipBaseExecute) {
      for (const p of alive()) setTakesDamage(p, true);
      const s = this.day.settings;
      const custom = this.day.pickupRule?.bind(this.day);
      setPickupRule(custom ?? ((p, item) => pickupAllowed(item, s.allowedWeapons(p))));
    }
    this.day.execute?.(this);
    if (this.day.restrict) {
      // AbstractZoneRestrictedDay.Execute
      this.beginsIn(0);
      this.restriction?.kill();
      this.restriction = null;
    }
  }

  // ── end (AbstractSpecialDay.OnEnd) ─────────────────────────────────────────────────────────
  end(): void {
    if (this.ended) return;
    this.ended = true;
    for (const t of this.timers) t.kill();
    this.timers.length = 0;
    this.restriction?.kill();
    this.restriction = null;
    setPickupRule(null);
    for (const [name, value] of this.convarBackup) setCvar(name, value);
    this.convarBackup.clear();
    try {
      this.day.teardown?.(this);
    } catch (e) {
      console.log(`[specialdays] ${this.day.type} teardown failed: ${String(e)}`);
    }
  }
}

/** MapUtil.GetRandomSpawns: spawn zones, then teleport destinations, then team spawns. */
export function randomSpawns(count: number): Vec3[] {
  return pickSpawns(count, [zoneCenters("spawn"), teleportDestinations(), [...tSpawns(), ...ctSpawns()]]);
}
