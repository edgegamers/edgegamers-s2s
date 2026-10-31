import {logEntry} from '@edgegamers/jailbreak-shared';
import {forRecipients} from '@edgegamers/jailbreak-shared';
/**
 * SpecialDayManager: who may start a day, starting and ending it, the rounds-since-last counter, and
 * routing engine events to the running day.
 */
import { Admin, ADMFLAG, config } from "@s2script/sdk";
import type { DamageInfo, HookResultValue } from "@s2script/sdk";
import { Player } from "@s2script/cs2";
import type { Mode, RoundInfo } from "@edgegamers/jailbreak-core";
import type { SDInfo, SDType } from "../api";
import type { DayContext, SpecialDay } from "./day.ts";
import { DAYS } from "./days/index.ts";
import { DayRun } from "./runner.ts";
import { checkStart, nextRoundsSince } from "./eligibility.ts";
import type { StartDenial } from "./eligibility.ts";
import { parseSDTypeList } from "./sdtype.ts";
import { msgFor } from "./messages.ts";
import { timeElapsed, toAll, toSlot } from "./game.ts";

/** The @edgegamers/jailbreak-core methods the manager uses. */
export interface CoreApi {
  getRound(): RoundInfo;
  setMode(mode: Mode): boolean;
  disableRebelsForRound(): void;
  openCells(source: string): boolean;
  log(message: string, presentation?: { key: string; args: (string | number)[]; labels?: number[] }): void;
  describe(slot: number): string;
}

/** The @edgegamers/jailbreak-warden method the manager uses (optional dependency). */
export interface WardenApi {
  isWarden(slot: number): boolean;
}

export interface Forwards {
  started(info: SDInfo): void;
  ended(info: SDInfo): void;
}

/** ADMFLAG by config name ("custom1", "rcon", …). */
function flagByName(name: string): number {
  const key = name.trim().toUpperCase() as keyof typeof ADMFLAG;
  return Object.prototype.hasOwnProperty.call(ADMFLAG, key) ? ADMFLAG[key] : 0;
}

/** Message lines for a print-to-caller (console gets them on the server console). */
export function say(slot: number, lines: string | readonly string[]): void {
  if (slot >= 0) toSlot(slot, lines);
  else for (const l of typeof lines === "string" ? [lines] : lines) console.log(l.replace(/[\x01-\x10]/g, ""));
}

export class Manager {
  private current: { run: DayRun; info: SDInfo } | null = null;
  private roundsSince = 0;
  warden: WardenApi | null = null;

  constructor(
    private readonly core: CoreApi,
    private readonly forwards: Forwards,
  ) {}

  isRunning(): boolean {
    return this.current !== null;
  }

  getCurrent(): SDInfo | null {
    return this.current ? { ...this.current.info } : null;
  }

  roundsSinceLast(): number {
    return this.roundsSince;
  }

  /** Core's OnRoundStart. */
  onRoundStart(): void {
    if (this.current) this.end(false); // round_end was missed
    this.roundsSince = nextRoundsSince(this.roundsSince, this.core.getRound().phase === "warmup");
  }

  private denial(type: SDType, slot: number): StartDenial | null {
    const admin = slot >= 0 ? Admin.forSlot(slot) : null;
    const root = slot < 0 || (admin?.hasFlags(ADMFLAG.ROOT) ?? false);
    const bypass = root || (admin?.hasFlags(ADMFLAG.RCON) ?? false);
    const gateFlag = flagByName(config.getString("sd_gate_flag"));
    const gatedDay = parseSDTypeList(config.getString("sd_gated_days")).includes(type);
    const hasGate = gateFlag !== 0 && (admin?.hasFlags(gateFlag) ?? false);
    return checkStart({
      bypassRules: bypass,
      root,
      isWarden: slot >= 0 && (this.warden?.isWarden(slot) ?? false),
      warmup: this.core.getRound().phase === "warmup",
      running: this.current !== null,
      roundsSinceLast: this.roundsSince,
      cooldownRounds: config.getInt("sd_round_cooldown"),
      elapsedSeconds: timeElapsed(),
      maxElapsedSeconds: config.getInt("sd_max_elapsed_time"),
      gated: gatedDay && !hasGate,
    });
  }

  /** CanStartSpecialDay: true if allowed; otherwise tells the caller why. */
  canStart(type: SDType, slot: number): boolean {
    const d = this.denial(type, slot);
    if (d === null) return true;
    switch (d.kind) {
      case "not_warden":
        say(slot, msgFor(slot).notWarden());
        break;
      case "running":
        say(slot, msgFor(slot).running(this.current?.info.name ?? "Unknown"));
        break;
      case "cooldown":
        say(slot, msgFor(slot).cooldown(d.rounds));
        break;
      case "too_late":
        say(slot, msgFor(slot).tooLate(d.maxSeconds));
        break;
      case "gated":
        say(slot, msgFor(slot).cannotCall(config.getString("sd_gated_message")));
        break;
    }
    return false;
  }

  /** InitiateSpecialDay. Claims the round from core first; backs off if refused. */
  start(type: SDType, starterSlot: number): boolean {
    if (this.current) return false;
    if (!this.core.setMode("specialday")) {
      say(starterSlot, msgFor(starterSlot).modeRefused());
      return false;
    }
    const day = DAYS[type]();
    const run = new DayRun(day, this.core);
    const starter = starterSlot >= 0 ? Player.fromSlot(starterSlot) : null;
    const info: SDInfo = {
      type,
      name: day.name,
      round: this.core.getRound().round,
      starterSteamId: starter?.steamId ?? "0",
    };
    this.roundsSince = 0;
    this.current = { run, info };
    toAll(forRecipients((recipient,value0,value1) => msgFor(recipient).dayStart(value0, value1), day.name,day.description));
    try {
      run.start();
    } catch (e) {
      console.log(`[specialdays] ${type} setup failed: ${String(e)}`);
      this.core.log(...logEntry("JB_LOG_SPECIAL_DAY_FAILED_TO_START", [String(day.name), String(String(e))], [0]));
    }
    // Days that keep last requests (Custom, Bunny Hop) hand the round mode back so an LR can claim it.
    if (day.settings.allowLastRequests) this.core.setMode("normal");
    this.forwards.started({ ...info });
    const by = starterSlot >= 0 ? this.core.describe(starterSlot) : "the server";
    this.core.log(...logEntry("JB_LOG_SPECIAL_DAY_STARTED_BY", [String(day.name), String(by)], [0]));
    return true;
  }

  /** End the running day (round end, map change, unload). */
  end(announce = true): void {
    const cur = this.current;
    if (!cur) return;
    this.current = null;
    cur.run.end();
    if (announce) toAll(forRecipients((recipient,value0) => msgFor(recipient).dayEnd(value0), cur.info.name));
    this.forwards.ended({ ...cur.info });
    this.core.log(...logEntry("JB_LOG_SPECIAL_DAY_ENDED", [String(cur.info.name)], [0]));
  }

  // ── event routing ─────────────────────────────────────────────────────────────────────────
  /** The running day and its context, if any. */
  running(): { day: SpecialDay; ctx: DayContext } | null {
    return this.current ? { day: this.current.run.day, ctx: this.current.run } : null;
  }

  onTakeDamage(info: DamageInfo, victim: Player | null): HookResultValue | void {
    const r = this.running();
    return r?.day.onTakeDamage?.(info, victim, r.ctx);
  }
}
