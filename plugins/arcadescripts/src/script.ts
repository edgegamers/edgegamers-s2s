// ArcadeScripts for s2script. Derived from ArcadeScripts-CSS by Supergosciuツ (GPL-3.0).
// See LICENSE and NOTICE. Port of ScriptBase.cs and ScriptFunctions.cs.
import { after } from '@s2script/sdk';
import type { EntityRef, Timer } from '@s2script/sdk';
import type { Runtime } from './runtime';

/** A RunScriptCode parameter type, standing in for upstream's reflected C# parameter types. */
export type Param = 'entity' | 'int' | 'float' | 'bool' | 'string';
export type Arg = EntityRef | null | number | boolean | string;

export interface ScriptFunction {
  readonly params: readonly Param[];
  invoke(args: Arg[]): void;
}

/**
 * One map `logic_script`, replacing the VScript it names. Lives from round start to the next
 * round prestart, like upstream.
 */
export abstract class Script {
  /** Substrings of the targetnames this script wants in {@link entityList}. */
  entityNames: string[] = [];
  /** Named entities that matched {@link entityNames} at round start, by full targetname. */
  readonly entityList = new Map<string, EntityRef[]>();
  readonly functions = new Map<string, ScriptFunction>();
  /** Upstream's public fields, which RunScriptCode arguments may name instead of a literal. */
  constants: Record<string, Arg> = {};
  private readonly timers: Timer[] = [];

  constructor(readonly owner: EntityRef, readonly rt: Runtime) {}

  protected fn(name: string, params: readonly Param[], impl: (...args: any[]) => void): void {
    this.functions.set(name, { params, invoke: (args) => impl.apply(this, args) });
  }

  /** A one-shot timer in seconds, cancelled when the script is removed. */
  protected after(seconds: number, callback: () => void): void {
    const live = this.timers.filter((t) => t.alive);
    this.timers.length = 0;
    this.timers.push(...live, after(Math.max(0, seconds * 1000), () => this.rt.guard(this, callback)));
  }

  first(name: string): EntityRef | null {
    return this.entityList.get(name)?.[0] ?? null;
  }

  all(name: string): EntityRef[] {
    return this.entityList.get(name) ?? [];
  }

  /** Round start, after every script has its {@link entityList}. */
  onAllEntitiesSpawned?(): void;
  /** An entity spawned after round start. */
  onEntitySpawned?(entity: EntityRef, className: string): void;
  /** An entity is about to be deleted after round start. */
  onEntityRemoved?(entity: EntityRef, className: string): void;
  /** Every game frame. */
  think?(): void;
  /** A player newly pressed buttons this frame. */
  onButtonsPressed?(slot: number, pressed: number): void;
  /** `player_spawn`, with the spawned pawn's ref. */
  onPlayerSpawn?(pawn: EntityRef): void;

  /** Round prestart: stop timers and release anything the script holds. */
  remove(): void {
    for (const timer of this.timers) timer.kill();
    this.timers.length = 0;
  }
}

export type ScriptConstructor = new (owner: EntityRef, rt: Runtime) => Script;
