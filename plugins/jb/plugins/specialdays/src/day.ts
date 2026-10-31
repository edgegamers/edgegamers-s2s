/**
 * What a special day is: its settings plus optional hooks. Each file in `days/` exports a factory
 * returning one of these (fresh state per run). The shared setup/execute/teardown lives in `runner.ts`.
 */
import type { DamageInfo, HookResultValue, Timer } from "@s2script/sdk";
import type { GameEvents, Player } from "@s2script/cs2";
import type { SDType } from "../api";
import type { DaySettings } from "./settings.ts";

export type DeathEvent = GameEvents["player_death"];
export type HurtEvent = GameEvents["player_hurt"];

/** Services the runner gives a day while it is running. Timers die with the day. */
export interface DayContext {
  readonly type: SDType;
  readonly name: string;
  /** Run `fn` `seconds` after setup started (C# `Timers[seconds] += fn`). */
  at(seconds: number, fn: () => void): void;
  /** Like `after` from the SDK, but dies with the day. */
  after(ms: number, fn: () => void): Timer;
  /** Like `every` from the SDK, but dies with the day. */
  every(ms: number, fn: () => void): Timer;
  /** Start the action (C# Execute): enable damage, arm the pickup gate, release restrictions. Once. */
  execute(): void;
  readonly executed: boolean;
  /** False once the day ended (round end / abort). */
  readonly active: boolean;
  /** Broadcast "<Name> begins in N seconds" (the day's own wording if it has one). */
  beginsIn(seconds: number): void;
  /** Disarm the pickup gate for the rest of the day (gun game / speedrun winners). */
  disarmPickups(): void;
  /** Set a convar for the rest of the day (restored at the end). */
  setConvar(name: string, value: string): void;
  /** Stop the day's custom logic and end the round now (C# speedrun `panic`). */
  panic(reason: string): void;
}

export interface SpecialDay {
  readonly type: SDType;
  readonly name: string;
  readonly description: readonly string[];
  readonly settings: DaySettings;
  /** Keep a team inside the armory/cells until the day executes (Abstract*RestrictedDay). */
  readonly restrict?: { kind: "armory" | "cell"; teamNum: number; reminder: string };
  /** Execute without the shared part (no damage enable, no pickup gate) — SpeedrunDay never called base.Execute(). */
  readonly skipBaseExecute?: boolean;

  /** Before the shared setup — schedule timers here (C# `Timers[x] += …; base.Setup()`). */
  setup?(ctx: DayContext): void;
  /** After the shared setup. */
  afterSetup?(ctx: DayContext): void;
  /** The day's part of Execute, after the shared part (damage on, pickup gate armed). */
  execute?(ctx: DayContext): void;
  /** Round end or abort: undo what the day changed beyond its settings. */
  teardown?(ctx: DayContext): void;
  /** Custom "begins in" wording (Hide and Seek). */
  beginsIn?(seconds: number): string;
  /** Replace the settings-based pickup rule (Gun Game). */
  pickupRule?(player: Player, item: string): boolean;

  onDeathPre?(ev: DeathEvent, ctx: DayContext): HookResultValue | void;
  onDeath?(ev: DeathEvent, ctx: DayContext): void;
  onSpawn?(player: Player, ctx: DayContext): void;
  onHurt?(ev: HurtEvent, ctx: DayContext): void;
  onGrenadeThrown?(player: Player, ctx: DayContext): void;
  onWeaponFire?(player: Player, weapon: string, ctx: DayContext): void;
  /** Damage pre-hook on player pawns. `victim` is the victim's controller. */
  onTakeDamage?(info: DamageInfo, victim: Player | null, ctx: DayContext): HookResultValue | void;
  onFrame?(ctx: DayContext): void;
}
