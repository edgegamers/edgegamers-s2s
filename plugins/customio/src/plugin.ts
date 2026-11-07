// CustomIO 1.DZ.17.3 by DarkerZ [RUS] (darkerz7/CS2-CustomIO), ported to s2script 2026-11-07.
// GPL-3.0-only. See LICENSE and NOTICE for upstream attribution.
//
// Adds the CSS/CS:GO-style map inputs CS2 dropped, as CS2Fixes' customio.cpp does:
//   KeyValue "<key> <value...>"  on any entity (see KEYVALUES below)
//   AddScore "<n>"               adds to the activating player's score
//   SetMessage "<text>"          on env_hudhint
//   SetModel "<model>"           sets the activating player's model
// Inputs are observed in AcceptInput's pre-hook and always continue, as upstream does.
import { Entity, after, onInput } from '@s2script/sdk';
import type { EntityRef, InputEvent } from '@s2script/sdk';
import { Engine, Ptr } from '@s2script/sdk/unsafe';
import { MoveType_t, Player, wrapEntity } from '@s2script/cs2';
import type { DamageTypes_t, Pawn } from '@s2script/cs2';
import { parseFloat32, parseInt32, splitKeyValue } from './parse';

// The framework's own schema resolver (the generated field accessors call it). Negative = unknown.
declare const __s2_schema_offset: ((className: string, field: string) => number) | undefined;

const LOG = '[CustomIO]';
const setEntityName = Engine.function('setEntityName');
const offsets = new Map<string, number>();
const warned = new Set<string>();

function warnOnce(key: string, message: string): void {
  if (warned.has(key)) return;
  warned.add(key);
  console.log(`${LOG} ${message}`);
}

function offset(className: string, field: string): number {
  const key = `${className}::${field}`;
  let value = offsets.get(key);
  if (value === undefined) {
    value = typeof __s2_schema_offset === 'function' ? __s2_schema_offset(className, field) : -1;
    if (!Number.isInteger(value)) value = -1;
    offsets.set(key, value);
  }
  if (value < 0) warnOnce(key, `Schema field ${key} is unavailable; inputs that need it are ignored.`);
  return value;
}

/** The entity's CEntityIdentity, or null. */
function identityOf(ref: EntityRef): Ptr | null {
  const off = offset('CEntityInstance', 'm_pEntity');
  const self = off < 0 ? null : Ptr.from(ref);
  if (!self) return null;
  const identity = self.readPtr(off);
  return identity.isNull() ? null : identity;
}

function symbolText(symbol: Ptr): string {
  return symbol.isNull() ? '' : symbol.readString(0, 1024);
}

function designerName(ref: EntityRef): string {
  const identity = identityOf(ref);
  const off = offset('CEntityIdentity', 'm_designerName');
  return identity && off >= 0 ? symbolText(identity.readPtr(off)) : '';
}

/** The CUtlSymbolLarge naming `ref` (CEntityIdentity::m_name), or null. */
function nameSymbol(ref: EntityRef): Ptr | null {
  const identity = identityOf(ref);
  const off = offset('CEntityIdentity', 'm_name');
  if (!identity || off < 0) return null;
  const symbol = identity.readPtr(off);
  return symbol.isNull() ? null : symbol;
}

function renamingAvailable(): boolean {
  if (setEntityName.available) return true;
  warnOnce('setEntityName', `CEntityIdentity::SetEntityName is unavailable (${setEntityName.status.reason}); targetname, entitytemplate, case and SetMessage are ignored.`);
  return false;
}

function rename(identity: Ptr, name: string): void {
  if (setEntityName.available) setEntityName.call(identity, name);
}

/**
 * Pool `value` in the entity system's string table, as CS2Fixes' AllocPooledString does.
 * SetEntityName is the pooling path s2script can reach, so the entity is briefly renamed to
 * `value`, the pooled symbol is read back, and the original name is restored. Pooled strings
 * persist for the map like every other entity string.
 */
function pooledString(ref: EntityRef, value: string): Ptr | null {
  const identity = identityOf(ref);
  const off = offset('CEntityIdentity', 'm_name');
  if (!identity || off < 0 || !renamingAvailable()) return null;
  const original = symbolText(identity.readPtr(off));
  rename(identity, value);
  const pooled = identity.readPtr(off);
  rename(identity, original);
  return pooled.isNull() || symbolText(pooled) !== value ? null : pooled;
}

function writeSymbol(ref: EntityRef, className: string, field: string, symbol: Ptr | null, index = 0): boolean {
  const off = offset(className, field);
  const self = off < 0 || !symbol ? null : Ptr.from(ref);
  if (!self || !symbol) return false;
  self.writePtr(off + index * 8, symbol);
  return true;
}

function findByName(name: string): EntityRef | null {
  for (const candidate of Entity.findByName(name)) if (candidate.isValid()) return candidate;
  return null;
}

/** Upstream's EntityIsPlayer: the controller of a valid player pawn. */
function playerFor(ref: EntityRef | null): Player | null {
  if (!ref?.isValid()) return null;
  for (const player of Player.all()) {
    const pawn = player.pawn?.ref;
    if (pawn && pawn.index === ref.index && pawn.id === ref.id && player.ref.isValid()) return player;
  }
  return null;
}

function vector(kv: string[], limit: number): number[] | null {
  if (kv.length < 4 || !kv[1] || !kv[2] || !kv[3]) return null;
  const values = [parseFloat32(kv[1]), parseFloat32(kv[2]), parseFloat32(kv[3])];
  if (values.some(v => v === null)) return null;
  return (values as number[]).map(v => Math.min(limit, Math.max(-limit, v)));
}

function argument(kv: string[]): string | null {
  return kv.length >= 2 && kv[1] ? kv[1] : null;
}

type KeyValueHandler = (ref: EntityRef, kv: string[]) => void;

const KEYVALUES: Record<string, KeyValueHandler> = {
  targetname(ref, kv) {
    const name = argument(kv);
    const identity = name === null ? null : identityOf(ref);
    if (identity && renamingAvailable()) rename(identity, name!);
  },
  origin(ref, kv) {
    const origin = vector(kv, 16384);
    if (origin) ref.teleport(origin);
  },
  angles(ref, kv) {
    const angles = vector(kv, 360);
    if (angles) ref.teleport(null, angles, null);
  },
  max_health(ref, kv) {
    const value = parseInt32(argument(kv));
    if (value !== null) wrapEntity('CBaseEntity', ref).maxHealth = value;
  },
  health(ref, kv) {
    const value = parseInt32(argument(kv));
    if (value !== null) wrapEntity('CBaseEntity', ref).health = value;
  },
  movetype(ref, kv) {
    const pawn = playerFor(ref)?.pawn;
    const value = parseInt32(argument(kv));
    if (!pawn || value === null || value < 0 || value > 255) return; // byte.TryParse
    // Writes m_MoveType and m_nActualMoveType, then networks the change.
    pawn.moveType = Math.min(value, MoveType_t.LAST) as MoveType_t;
  },
  entitytemplate(ref, kv) {
    const template = argument(kv);
    if (template === null || designerName(ref) !== 'env_entity_maker') return;
    writeSymbol(ref, 'CEnvEntityMaker', 'm_iszTemplate', pooledString(ref, template));
  },
  basevelocity(ref, kv) {
    const velocity = vector(kv, 4096);
    const off = velocity ? offset('CBaseEntity', 'm_vecBaseVelocity') : -1;
    if (!velocity || off < 0) return;
    if (velocity.every((v, i) => ref.writeFloat32(off + i * 4, v))) ref.notifyStateChanged(off);
  },
  absvelocity(ref, kv) {
    const velocity = vector(kv, 4096);
    if (velocity) ref.teleport(null, null, velocity);
  },
  target(ref, kv) {
    const name = argument(kv);
    const found = name === null ? null : findByName(name);
    if (found) writeSymbol(ref, 'CBaseEntity', 'm_target', nameSymbol(found));
  },
  filtername(ref, kv) {
    const name = argument(kv);
    if (name === null || !designerName(ref).startsWith('trigger_')) return;
    const found = findByName(name);
    if (found) writeSymbol(ref, 'CBaseTrigger', 'm_iFilterName', nameSymbol(found));
  },
  force(ref, kv) {
    const value = parseFloat32(argument(kv));
    if (value !== null && designerName(ref) === 'phys_thruster') wrapEntity('CPhysThruster', ref).force = value;
  },
  gravity(ref, kv) {
    const value = parseFloat32(argument(kv));
    if (value !== null) ref.setGravityScale(value);
  },
  timescale(ref, kv) {
    const value = parseFloat32(argument(kv));
    if (value !== null) wrapEntity('CBaseEntity', ref).timeScale = value;
  },
  friction(ref, kv) {
    const value = parseFloat32(argument(kv));
    if (value !== null) wrapEntity('CBaseEntity', ref).friction = value;
  },
  speed(ref, kv) {
    const pawn = playerFor(ref)?.pawn;
    const movement = pawn?.movementServices;
    let value = parseFloat32(argument(kv));
    if (!pawn || !movement || value === null) return;
    if (value <= 0) value = 0.001;
    movement.maxspeed = 260 * value;
    pawn.velocityModifier = value;
  },
  runspeed(ref, kv) {
    const pawn = playerFor(ref)?.pawn;
    let value = parseFloat32(argument(kv));
    if (!pawn || value === null) return;
    if (value <= 0) value = 0.001;
    pawn.velocityModifier = value;
  },
  damage(ref, kv) {
    const value = parseInt32(argument(kv));
    if (value !== null && designerName(ref) === 'point_hurt') wrapEntity('CPointHurt', ref).damage = value;
  },
  damagetype(ref, kv) {
    const value = parseInt32(argument(kv));
    if (value !== null && designerName(ref) === 'point_hurt') wrapEntity('CPointHurt', ref).bitsDamageType = value as DamageTypes_t;
  },
  damageradius(ref, kv) {
    const value = parseInt32(argument(kv));
    if (value !== null && designerName(ref) === 'point_hurt') wrapEntity('CPointHurt', ref).radius = value;
  },
  case(ref, kv) {
    // KeyValue "case <1-32> <value...>"
    if (kv.length < 3 || !kv[1] || !kv[2] || designerName(ref) !== 'logic_case') return;
    const index = parseInt32(kv[1]);
    if (index === null || index < 1 || index > 32) return;
    const value = [kv[2], ...kv.slice(3).filter(Boolean)].join(' ');
    writeSymbol(ref, 'CLogicCase', 'm_nCase', pooledString(ref, value), index - 1);
  },
};

function onKeyValue(ev: InputEvent): void {
  const kv = splitKeyValue(ev.value);
  if (!kv || !ev.entity?.isValid()) return;
  KEYVALUES[kv[0]!.toLowerCase()]?.(ev.entity, kv);
}

function onAddScore(ev: InputEvent): void {
  const player = playerFor(ev.activator);
  const value = parseInt32(ev.value);
  if (player && value !== null) player.score = (player.score ?? 0) + value;
}

function onSetMessage(ev: InputEvent): void {
  const entity = ev.entity;
  if (!entity?.isValid() || designerName(entity) !== 'env_hudhint') return;
  writeSymbol(entity, 'CEnvHudHint', 'm_iszMessage', pooledString(entity, ev.value));
}

function onSetModel(ev: InputEvent): void {
  const pawn = playerFor(ev.activator)?.pawn;
  if (!ev.value || !pawn?.isValid) return;
  if (pawn.ref.setModel(ev.value)) fixPlayerModelAnimations(pawn);
}

/** Upstream's fix for players moonwalking after a model change. */
function fixPlayerModelAnimations(pawn: Pawn): void {
  const ref = pawn.ref;
  const fields = wrapEntity('CBaseEntity', ref);
  if ((fields.actualMoveType ?? 0) < MoveType_t.WALK) return;
  const velocity = fields.absVelocity;
  const original = velocity ? [velocity.x, velocity.y, velocity.z] : [0, 0, 0];
  ref.teleport(null, null, [0, 0, 0]);
  fields.moveType = MoveType_t.OBSOLETE; // m_MoveType only, as upstream
  after(20, () => {
    if (!ref.isValid()) return;
    fields.moveType = MoveType_t.WALK;
    ref.teleport(null, null, original);
  });
}

export function OnPluginStart(): void {
  // Upstream matched any input starting with "keyvalue"; these are the two spellings maps use.
  onInput('*', 'KeyValue', onKeyValue);
  onInput('*', 'KeyValues', onKeyValue);
  onInput('*', 'AddScore', onAddScore);
  onInput('env_hudhint', 'SetMessage', onSetMessage);
  onInput('*', 'SetModel', onSetModel);
  if (!setEntityName.available) {
    console.log(`${LOG} WARN: CEntityIdentity::SetEntityName unavailable — ${setEntityName.status.reason}`);
  }
}

export function OnMapStart(): void {
  // Schema offsets are stable for a game build; only re-arm the one-shot warnings.
  warned.clear();
}
