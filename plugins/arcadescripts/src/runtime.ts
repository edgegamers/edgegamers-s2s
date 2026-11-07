// ArcadeScripts for s2script. Derived from ArcadeScripts-CSS by Supergosciuツ (GPL-3.0).
// See LICENSE and NOTICE. Port of ArcadeScripts.cs and Events.cs.
import type { EntityRef } from '@s2script/sdk';
import { Player } from '@s2script/cs2';
import type { Arg, Script, ScriptConstructor } from './script';
import { keyOf } from './util';
import { designerName, privateVScripts } from './vscripts';

export const MAP_NAME = 'jb_arcade_b6';

interface Tracked {
  ref: EntityRef;
  className: string;
}

/** Split `Name(a, b)` like upstream: arguments are comma separated, trimmed, empties dropped. */
export function parseCall(code: string): { name: string; args: string[] } {
  const open = code.indexOf('(');
  const close = code.lastIndexOf(')');
  if (open <= 0 || close < open) throw new Error('Invalid code format.');
  const raw = code.slice(open + 1, close);
  const args = raw.trim() === '' ? [] : raw.split(',').map((a) => a.trim()).filter((a) => a !== '');
  return { name: code.slice(0, open), args };
}

const INT = /^\s*[+-]?\d+\s*$/;
const FLOAT = /^\s*[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?\s*$/;

/** C# `Convert.ChangeType` for the parameter types the scripts use. */
export function convert(text: string, type: string): Arg {
  switch (type) {
    case 'int':
      if (!INT.test(text)) throw new Error(`"${text}" is not an integer.`);
      return Number.parseInt(text, 10);
    case 'float':
      if (!FLOAT.test(text)) throw new Error(`"${text}" is not a number.`);
      return Number.parseFloat(text);
    case 'bool': {
      const value = text.trim().toLowerCase();
      if (value !== 'true' && value !== 'false') throw new Error(`"${text}" is not a boolean.`);
      return value === 'true';
    }
    case 'string':
      return text;
    default:
      throw new Error(`"${text}" cannot be converted to an entity.`);
  }
}

export class Runtime {
  /** Live map scripts, by their logic_script. */
  readonly scripts = new Map<string, Script>();
  /** Named entities, in spawn order (upstream `Entities`). */
  private readonly named = new Map<string, Tracked>();
  /** Every entity's class name, recorded as it is created. */
  private readonly classes = new Map<string, string>();
  /** Pawns in the timed surf game (upstream marks them by writing "inGame" to their vscripts). */
  readonly inGame = new Set<string>();
  private roundStart = false;
  private readonly previousButtons = new Map<number, number>();
  active = false;

  constructor(private readonly registry: Readonly<Record<string, ScriptConstructor>>) {}

  /** Run `callback` for `script`, logging instead of throwing into the engine. */
  guard(script: Script | null, callback: () => void): void {
    try {
      callback();
    } catch (error) {
      const name = script ? script.constructor.name : 'runtime';
      console.error(`[ArcadeScripts] ${name}:`, error instanceof Error ? error.message : error);
    }
  }

  classOf(ref: EntityRef | null | undefined): string {
    if (!ref) return '';
    return this.classes.get(keyOf(ref)) ?? designerName(ref) ?? '';
  }

  /** Every live named entity whose targetname starts with `prefix`. */
  namedWithPrefix(prefix: string): EntityRef[] {
    const out: EntityRef[] = [];
    for (const { ref } of this.named.values()) {
      if (ref.isValid() && (ref.name ?? '').startsWith(prefix)) out.push(ref);
    }
    return out;
  }

  /** Upstream `RunScriptCode`: call a script function on the logic_script `target`. */
  runScriptCode(target: EntityRef | null, code: string, activator: EntityRef | null = null, caller: EntityRef | null = null): void {
    if (!target) return;
    const script = this.scripts.get(keyOf(target));
    if (!script) return;
    this.guard(script, () => {
      const { name, args } = parseCall(code);
      const fn = script.functions.get(name);
      if (!fn) throw new Error(`no function ${name}`);
      if (args.length !== fn.params.length) {
        throw new Error(`Function ${name} expects ${fn.params.length} parameters, got ${args.length} instead.`);
      }
      const values = args.map((arg, i): Arg => {
        if (Object.prototype.hasOwnProperty.call(script.constants, arg)) return script.constants[arg]!;
        if (arg === '!activator') return activator;
        if (arg === '!caller') return caller;
        return convert(arg, fn.params[i]!);
      });
      fn.invoke(values);
    });
  }

  // ---- engine events ------------------------------------------------------------------------

  mapStart(mapName: string): void {
    this.clearScripts();
    this.named.clear();
    this.classes.clear();
    this.previousButtons.clear();
    this.active = mapName === MAP_NAME;
  }

  entityCreated(ref: EntityRef | null, className: string): void {
    if (ref) this.classes.set(keyOf(ref), className);
  }

  entitySpawned(ref: EntityRef | null, className: string): void {
    if (!ref || !ref.isValid()) return;
    this.classes.set(keyOf(ref), className);
    if (!this.active) return;
    if (!this.roundStart) this.broadcast((s) => s.onEntitySpawned?.(ref, className));
    if (!ref.name) return;
    this.named.set(keyOf(ref), { ref, className });
  }

  entityDeleted(ref: EntityRef | null, className: string): void {
    if (!ref) return;
    const key = keyOf(ref);
    if (this.active && !this.roundStart) this.broadcast((s) => s.onEntityRemoved?.(ref, className));
    this.named.delete(key);
    this.classes.delete(key);
  }

  roundPrestart(): void {
    if (!this.active) return;
    this.clearScripts();
    this.roundStart = true;
  }

  roundStarted(): void {
    if (!this.active) return;
    for (const [key, tracked] of this.named) {
      if (!tracked.ref.isValid()) this.named.delete(key);
    }
    if (this.named.size === 0) return;

    for (const { ref, className } of this.named.values()) {
      if (className !== 'logic_script') continue;
      const vscript = privateVScripts(ref);
      const Constructor = vscript ? this.registry[vscript] : undefined;
      if (!Constructor) continue;
      const key = keyOf(ref);
      if (this.scripts.has(key)) continue;
      try {
        this.scripts.set(key, new Constructor(ref, this));
      } catch (error) {
        console.error(`[ArcadeScripts] ${vscript}:`, error instanceof Error ? error.message : error);
      }
    }

    for (const { ref } of this.named.values()) {
      const targetname = ref.name;
      if (!targetname) continue;
      for (const script of this.scripts.values()) {
        for (const name of script.entityNames) {
          if (!targetname.includes(name)) continue;
          let list = script.entityList.get(targetname);
          if (!list) script.entityList.set(targetname, (list = []));
          list.push(ref);
        }
      }
    }

    this.broadcast((s) => s.onAllEntitiesSpawned?.());
    this.roundStart = false;
  }

  playerSpawned(slot: number): void {
    if (!this.active || this.scripts.size === 0) return;
    const pawn = Player.fromSlot(slot)?.pawn;
    if (pawn) this.broadcast((s) => s.onPlayerSpawn?.(pawn.ref));
  }

  frame(): void {
    if (!this.active || this.scripts.size === 0) return;
    this.broadcast((s) => s.think?.());

    let wantsButtons = false;
    for (const script of this.scripts.values()) wantsButtons ||= !!script.onButtonsPressed;
    if (!wantsButtons) return;
    for (const player of Player.all()) {
      const buttons = player.pawn?.buttons ?? 0;
      const pressed = buttons & ~(this.previousButtons.get(player.slot) ?? 0);
      this.previousButtons.set(player.slot, buttons);
      if (pressed) this.broadcast((s) => s.onButtonsPressed?.(player.slot, pressed));
    }
  }

  unload(): void {
    this.clearScripts();
  }

  private broadcast(callback: (script: Script) => void): void {
    for (const script of [...this.scripts.values()]) this.guard(script, () => callback(script));
  }

  private clearScripts(): void {
    for (const script of this.scripts.values()) this.guard(script, () => script.remove());
    this.scripts.clear();
    this.inGame.clear();
  }
}
