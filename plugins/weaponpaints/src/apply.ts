// Applying cosmetics to entities, ported from WeaponPaints 3.3a (WeaponAction.cs, Events.cs).
// GPL-3.0-only. See LICENSE and NOTICE.
import { after, Clients, nextFrame, SDKHook, SDKHookType, SDKUnhook, Server } from '@s2script/sdk';
import type { EntityRef } from '@s2script/sdk';
import { Engine, Ptr } from '@s2script/sdk/unsafe';
import { CenterHtml, Player, Weapon } from '@s2script/cs2';
import type { Pawn } from '@s2script/cs2';
import {
  DEFINDEX_CLASS, defindexOf, isKnifeClass, isKnifeDefindex, isLegacyModel, randomPaint, type Catalog,
} from './catalog';
import { mayApply } from './gate';
import { firstItemId, itemIdHalves } from './itemid';
import type { WeaponInfo } from './rows';
import type { Settings } from './config';
import {
  allLoadouts, asTeam, changedKnife, changedPaint, getLoadout, type Loadout,
} from './state';

declare const __s2_schema_offset: ((className: string, field: string) => number) | undefined;

const LIFE_ALIVE = 0;
const GEAR_SLOT_RIFLE = 0, GEAR_SLOT_PISTOL = 1, GEAR_SLOT_KNIFE = 2;
const CUSTOM_NAME_LENGTH = 161;

let settings!: Settings;
let catalog!: Catalog;
/** Never reset: ids must not repeat while clients stay connected (see firstItemId). */
let nextItemId = firstItemId(Date.now());
let fadeSeed = 0;
/** False between round_end and round_start (upstream _gBCommandsAllowed). */
export let commandsAllowed = true;

export function configureApply(next: Settings, items: Catalog): void {
  settings = next;
  catalog = items;
}

export function setCommandsAllowed(value: boolean): void {
  commandsAllowed = value;
}

function debug(message: string): void {
  if (settings.debug) console.log(`[WeaponPaints] ${message}`);
}

export function resetMapState(): void {
  fadeSeed = 0;
  painted.clear();
  spawned = [];
  freshKnives.clear();
  knifeReplaced.clear();
  pendingSubclass.clear();
  writtenIds.clear();
  repaint = [];
}

// ---- painted-on-give bookkeeping -----------------------------------------------------------

/**
 * Weapons painted in the same call that created them (a give or an equip), so the frame hook's
 * spawn apply skips them. Cleared by every frame hook run once its batch is handled.
 */
const painted = new Set<string>();
const refKey = (ref: EntityRef): string => `${ref.index}:${ref.id}`;

// ---- offsets ---------------------------------------------------------------------------------

const offsets = new Map<string, number>();
function off(className: string, field: string): number {
  const key = `${className}::${field}`;
  let value = offsets.get(key);
  if (value === undefined) {
    value = typeof __s2_schema_offset === 'function' ? __s2_schema_offset(className, field) : -1;
    if (typeof value !== 'number' || !Number.isFinite(value)) value = -1;
    offsets.set(key, value);
  }
  return value;
}
const sum = (...parts: number[]): number => (parts.some(p => p < 0) ? -1 : parts.reduce((a, b) => a + b, 0));
/** CEconItemView inside a weapon (CEconEntity::m_AttributeManager.m_Item). */
const weaponItemBase = (): number => sum(off('CEconEntity', 'm_AttributeManager'), off('CAttributeContainer', 'm_Item'));
/** CEconItemView inside a pawn (CCSPlayerPawn::m_EconGloves). */
const gloveItemBase = (): number => off('CCSPlayerPawn', 'm_EconGloves');

// ---- econ attributes -------------------------------------------------------------------------

/** CAttributeList::SetOrAddAttributeValueByName on an arbitrary list (gamedata/functions.jsonc). */
const setAttributeOnList = Engine.function('attributeListSetOrAdd');
let attributeWarned = false;

function listAttribute(ref: EntityRef, listOffset: number, name: string, value: number): boolean {
  if (!setAttributeOnList.available || listOffset < 0) {
    if (!attributeWarned) {
      attributeWarned = true;
      console.log(`[WeaponPaints] attribute writes on non-weapon items are unavailable: ${setAttributeOnList.status.reason ?? 'offset not resolved'}`);
    }
    return false;
  }
  const base = Ptr.from(ref);
  if (!base) return false;
  setAttributeOnList.call(BigInt(base.add(listOffset).address), name, value);
  return true;
}

/** Upstream ViewAsFloat: pass an integer attribute's bit pattern through a float parameter. */
export function bitsAsFloat(value: number): number {
  const view = new DataView(new ArrayBuffer(4));
  view.setUint32(0, value >>> 0, true);
  return view.getFloat32(0, true);
}

/** Write to both of a weapon's lists: the networked one (via the SDK) and the server-side one. */
function weaponAttribute(weapon: Weapon, name: string, value: number): void {
  weapon.setAttribute(name, value);
  listAttribute(weapon.ref, sum(weaponItemBase(), off('CEconItemView', 'm_AttributeList')), name, value);
}

/**
 * Empty both of a weapon's attribute lists (upstream's `Attributes.RemoveAll()` on each), before the
 * player's own attributes go on. A weapon from the player's real inventory arrives with that item's
 * attributes: its StatTrak counter, pattern seed, stickers and their placement. Left in place they
 * show through: StatTrak the portal turned off, the real item's seed, stickers in the wrong spots.
 * A CUtlVector keeps its count at +0, so a count of 0 is RemoveAll (the attributes own no memory).
 */
function clearAttributes(weapon: Weapon): void {
  clearItemAttributes(weapon.ref, weaponItemBase());
}

/** Both attribute lists of the item view at `itemBase` in `ref` (a weapon's item, or a pawn's gloves). */
function clearItemAttributes(ref: EntityRef, itemBase: number): void {
  const vector = off('CAttributeList', 'm_Attributes');
  for (const list of ['m_NetworkedDynamicAttributes', 'm_AttributeList']) {
    const o = sum(itemBase, off('CEconItemView', list), vector);
    if (o >= 0 && ref.writeInt32(o, 0)) ref.notifyStateChanged(o);
  }
}

/** Gloves live on the pawn, not an entity of their own, so both lists go through the declared call. */
function gloveAttribute(pawn: Pawn, name: string, value: number): void {
  const base = gloveItemBase();
  listAttribute(pawn.ref, sum(base, off('CEconItemView', 'm_NetworkedDynamicAttributes')), name, value);
  listAttribute(pawn.ref, sum(base, off('CEconItemView', 'm_AttributeList')), name, value);
}

// ---- item identity ---------------------------------------------------------------------------

export function accountIdOf(steamId: string): number {
  try {
    return Number(BigInt(steamId) & 0xffffffffn);
  } catch {
    return 0;
  }
}

/** Give the item a fresh fake item id so clients rebuild its look (UpdatePlayerEconItemId). */
/** The fake item id last written on each entity, to tell later whether the engine put another back. */
const writtenIds = new Map<string, { low: number; high: number }>();

/** True while `weapon` still carries the item id this plugin last gave it. */
function keepsOurId(weapon: Weapon): boolean {
  const written = writtenIds.get(refKey(weapon.ref));
  const item = weapon.attributeManager.item;
  return !!written && item.itemIDLow === written.low && item.itemIDHigh === written.high;
}

function freshItemId(ref: EntityRef, itemBase: number): void {
  if (itemBase < 0) return;
  const id = nextItemId++;
  const { low, high } = itemIdHalves(id);
  writtenIds.set(refKey(ref), { low, high });
  const idOff = sum(itemBase, off('CEconItemView', 'm_iItemID'));
  // m_iItemID is not networked (its Low/High halves are), so it is written but not notified: the
  // engine cannot resolve a change on it and logs "Couldn't resolve offset".
  if (idOff >= 0) ref.writeUInt32(idOff, low) && ref.writeUInt32(idOff + 4, high);
  for (const [field, value] of [['m_iItemIDLow', low], ['m_iItemIDHigh', high]] as const) {
    const o = sum(itemBase, off('CEconItemView', field));
    if (o >= 0 && ref.writeUInt32(o, value)) ref.notifyStateChanged(o);
  }
}

function setCustomName(ref: EntityRef, itemBase: number, name: string): void {
  const o = sum(itemBase, off('CEconItemView', 'm_szCustomName'));
  if (o >= 0 && ref.writeString(o, CUSTOM_NAME_LENGTH, name)) ref.notifyStateChanged(o);
}

// ---- weapons ---------------------------------------------------------------------------------

function weaponDefindex(weapon: Weapon): number {
  return weapon.attributeManager.item.itemDefinitionIndex ?? 0;
}

function weaponIsKnife(weapon: Weapon, className: string | null): boolean {
  if (className) return isKnifeClass(className);
  const gear = weapon.data?.gearSlot;
  return gear === GEAR_SLOT_KNIFE || isKnifeDefindex(weaponDefindex(weapon));
}

/** The weapon model the paint needs: legacy skins use body group 1 (UpdateWeaponMeshGroupMask). */
function setLegacyModel(weapon: Weapon, legacy: boolean): void {
  weapon.ref.acceptInput('SetBodygroup', `body,${legacy ? 1 : 0}`);
}

function applyStickers(player: Player, team: number, weapon: Weapon, info: WeaponInfo, loadout: Loadout, defindex: number): void {
  info.stickers.forEach((sticker, slot) => {
    // Vetoed: the slot stays empty this time; the saved sticker is kept.
    const id = sticker.id !== 0 && !mayApply(player, team, 'sticker', { defindex: sticker.id }) ? 0 : sticker.id;
    weaponAttribute(weapon, `sticker slot ${slot} id`, bitsAsFloat(id));
    if (sticker.offsetX !== 0 || sticker.offsetY !== 0) weaponAttribute(weapon, `sticker slot ${slot} schema`, 0);
    weaponAttribute(weapon, `sticker slot ${slot} offset x`, sticker.offsetX);
    weaponAttribute(weapon, `sticker slot ${slot} offset y`, sticker.offsetY);
    weaponAttribute(weapon, `sticker slot ${slot} wear`, sticker.wear);
    weaponAttribute(weapon, `sticker slot ${slot} scale`, sticker.scale);
    weaponAttribute(weapon, `sticker slot ${slot} rotation`, sticker.rotation);
  });
  const wear = loadout.tempWear.get(defindex);
  if (wear !== undefined) weapon.fallbackWear = wear;
}

function applyKeyChain(player: Player, team: number, weapon: Weapon, info: WeaponInfo): void {
  const k = info.keyChain;
  if (!k) return;
  // Vetoed: no charm this time; the saved one is kept.
  const id = k.id !== 0 && !mayApply(player, team, 'keychain', { defindex: k.id }) ? 0 : k.id;
  weapon.setAttribute('keychain slot 0 id', bitsAsFloat(id));
  weapon.setAttribute('keychain slot 0 offset x', k.offsetX);
  weapon.setAttribute('keychain slot 0 offset y', k.offsetY);
  weapon.setAttribute('keychain slot 0 offset z', k.offsetZ);
  weapon.setAttribute('keychain slot 0 seed', bitsAsFloat(k.seed));
}

/**
 * GivePlayerWeaponSkin: knife model, paint kit, wear, seed, name tag, StatTrak, stickers, keychain.
 *
 * `fresh` means the client has not seen this weapon yet: it was spawned or given this frame and
 * the frame's snapshot has not gone out. Only then is a knife's model changed (ChangeSubclass), as
 * upstream does from its GiveNamedItem hook. Changing the model of a knife the client already has
 * draws it invisible or backwards, so a stale knife keeps its model and finish.
 */
export function applyWeaponSkin(
  player: Player, weapon: Weapon, className: string | null, fresh = true, subclassChanged = false,
): void {
  if (!settings.skinEnabled || !weapon.isValid()) return;
  const loadout = getLoadout(player.slot);
  if (!loadout || loadout.userId !== player.userId) {
    debug(`slot ${player.slot}: no loaded selections, ${className ?? 'weapon'} left as is`);
    return;
  }
  const team = asTeam(player.teamNum);
  const item = weapon.attributeManager.item;
  const itemBase = weaponItemBase();

  if (weaponIsKnife(weapon, className)) {
    const knife = changedKnife(loadout, team);
    const def = knife ? defindexOf(knife) : 0;
    const allowed = def !== 0 && mayApply(player, team ?? 0, 'knife', { defindex: def, model: knife });
    debug(`knife slot ${player.slot} team ${team ?? 'none'}: held ${className ?? '?'} defindex ` +
      `${weaponDefindex(weapon)}, chosen ${knife ?? 'none'} (${def}), ${allowed ? 'allowed' : 'not applied'}`);
    if (!knife || def === 0) return;
    // Vetoed: the stock knife stays, unpainted (a knife paint is keyed to the knife's own defindex).
    if (!allowed) return;
    if (weaponDefindex(weapon) !== def && !subclassChanged) {
      if (!fresh) {
        debug(`knife slot ${player.slot}: already sent to the client, model left as is`);
        return;
      }
      queueSubclass(player, weapon, className, def);
      debug(`knife slot ${player.slot}: model change to ${knife} queued; the finish goes on once it lands`);
      return;
    }
    item.itemDefinitionIndex = def;
    item.entityQuality = 3;
    clearAttributes(weapon);
    if (fresh) freshKnives.add(refKey(weapon.ref));
  } else {
    item.entityQuality = 0;
  }

  freshItemId(weapon.ref, itemBase);
  const defindex = weaponDefindex(weapon);
  item.accountID = accountIdOf(loadout.steamId);

  let info = changedPaint(loadout, team, defindex);
  // Vetoed: the stock finish this time. The saved row is kept, so it comes back once allowed.
  if (info && !mayApply(player, team ?? 0, 'skin', { defindex, paint: info.paint })) {
    debug(`slot ${player.slot}: finish ${info.paint} on defindex ${defindex} not applied (refused by a gate)`);
    return;
  }
  if (settings.giveRandomSkin && !info) {
    const paint = randomPaint(catalog, defindex);
    if (paint === 0) return;
    clearAttributes(weapon);
    weapon.fallbackPaintKit = paint;
    weapon.fallbackSeed = 0;
    weapon.fallbackWear = 0.01;
    weaponAttribute(weapon, 'set item texture prefab', paint);
    weaponAttribute(weapon, 'set item texture seed', 0);
    weaponAttribute(weapon, 'set item texture wear', 0.01);
    setLegacyModel(weapon, isLegacyModel(catalog, defindex, paint));
    return;
  }
  if (!info) return;

  clearAttributes(weapon);
  freshItemId(weapon.ref, itemBase);
  setCustomName(weapon.ref, itemBase, info.nametag);
  weapon.fallbackPaintKit = info.paint;
  // Paint 38 is Fade: an unset seed gets a fresh pattern per weapon, as upstream does.
  weapon.fallbackSeed = info.paint === 38 && info.seed === 0 ? fadeSeed++ : info.seed;
  weapon.fallbackWear = info.wear;
  weapon.setAttribute('set item texture prefab', info.paint);

  if (info.statTrak && mayApply(player, team ?? 0, 'stattrak', { defindex })) {
    item.entityQuality = 9;
    weaponAttribute(weapon, 'kill eater', bitsAsFloat(info.statTrakCount));
    weaponAttribute(weapon, 'kill eater score type', 0);
  }
  applyKeyChain(player, team ?? 0, weapon, info);
  if (info.stickers.length > 0) applyStickers(player, team ?? 0, weapon, info, loadout, defindex);
  setLegacyModel(weapon, isLegacyModel(catalog, defindex, info.paint));
}

// ---- knife model changes ---------------------------------------------------------------------

/**
 * Knives whose ChangeSubclass is queued, painted once it has run.
 *
 * s2script's acceptInput queues the input on the engine's I/O queue (AddEntityIOEvent): it runs later
 * in the tick, not inside the call. Upstream fires ChangeSubclass synchronously and paints after it.
 * Here the paint ran first and the queued subclass change landed on top of it, which left the right
 * model with the stock finish, hit or miss. So the paint waits for the change: a FireUser4 queued
 * right behind it (same tick, same queue, so it runs next) is the signal, and the input hook paints
 * from there, before the tick's snapshot. FireUser4 is dropped once used, so no OnUser4 output fires.
 */
const pendingSubclass = new Map<string, { slot: number; userId: number; className: string | null; tick: number }>();
const SUBCLASS_SIGNAL = 'FireUser4';
/** Ticks to wait for the signal before painting anyway (the queue refused it, or the knife moved on). */
const SUBCLASS_TIMEOUT_TICKS = 8;

function queueSubclass(player: Player, weapon: Weapon, className: string | null, def: number): void {
  const key = refKey(weapon.ref);
  pendingSubclass.set(key, { slot: player.slot, userId: player.userId, className, tick: Server.tickCount });
  weapon.ref.acceptInput('ChangeSubclass', String(def));
  weapon.ref.acceptInput(SUBCLASS_SIGNAL);
}

function finishSubclass(key: string, ref: EntityRef, why: string): void {
  const entry = pendingSubclass.get(key);
  if (!entry) return;
  pendingSubclass.delete(key);
  const player = Player.fromSlot(entry.slot);
  const weapon = Weapon.fromEntity(ref);
  if (!player || player.userId !== entry.userId || !weapon?.isValid()) return;
  const late = Server.tickCount - entry.tick;
  debug(`knife slot ${entry.slot}: model change landed (${why}, ${late} tick(s) after queuing), ` +
    `defindex ${weaponDefindex(weapon)}; painting`);
  applyWeaponSkin(player, weapon, entry.className, late === 0, true);
  if (late === 0) return;
  // The change ran a tick after the give, so the client had already drawn the stock knife and keeps
  // its stock finish under the new model (the round-start spawn gives after the tick's I/O has run).
  // Swap it from a timer, the way a reload gives knives, so the give, the model change and the paint
  // all land in one tick.
  const slot = entry.slot, userId = entry.userId, weaponRef = ref;
  after(50, () => {
    const current = Player.fromSlot(slot);
    const held = Weapon.fromEntity(weaponRef);
    if (!current || current.userId !== userId || !held?.isValid()) return;
    replaceKnife(current, held, 'model change landed after the client saw the knife');
  });
}

/** onInput pre-hook for {@link SUBCLASS_SIGNAL} on any entity. Returns true to drop the input. */
export function onSubclassSignal(entity: EntityRef | null): boolean {
  if (!entity) return false;
  const key = refKey(entity);
  if (!pendingSubclass.has(key)) return false;
  finishSubclass(key, entity, 'same tick');
  return true;
}

export const subclassSignal = SUBCLASS_SIGNAL;

/** Paint knives whose signal never came (called from the frame hook). */
function flushStaleSubclasses(): void {
  if (pendingSubclass.size === 0) return;
  const tick = Server.tickCount;
  for (const [key, entry] of [...pendingSubclass]) {
    if (tick - entry.tick < SUBCLASS_TIMEOUT_TICKS) continue;
    const weapon = Player.fromSlot(entry.slot)?.pawn?.weapons.find(w => refKey(w.ref) === key);
    if (weapon) finishSubclass(key, weapon.ref, `no signal after ${tick - entry.tick} ticks`);
    else pendingSubclass.delete(key);
  }
}

/** Who a freshly spawned weapon belongs to: its original owner's account, else its holder. */
function weaponPlayer(weapon: Weapon): Player | null {
  const xuid = weapon.originalOwnerXuidLow ?? 0;
  if (xuid > 0) {
    for (const [slot, loadout] of allLoadouts()) {
      if (accountIdOf(loadout.steamId) !== xuid) continue;
      const player = Player.fromSlot(slot);
      if (player && player.userId === loadout.userId) return player;
    }
  }
  // No loaded player with that account (a bot, or not loaded yet): fall back to whoever holds it.
  return weapon.owner?.controller ?? null;
}

/** Weapons spawned and not painted yet, with the tick they spawned on. */
let spawned: { ref: EntityRef; className: string; tick: number; retried: boolean }[] = [];

/**
 * OnEntitySpawned for weapon_* classes. The owner is not set yet at spawn, so the weapon is queued.
 * A give equips it a moment later in the same call, and {@link onWeaponEquipped} paints it there;
 * anything else is painted by {@link paintSpawnedWeapons} at the end of the frame.
 */
export function onWeaponSpawned(ref: EntityRef, className: string): void {
  if (!settings.skinEnabled) return;
  spawned.push({ ref, className, tick: Server.tickCount, retried: false });
}

/**
 * WeaponEquipPost on a pawn: a weapon spawned this tick was just handed to its player. Paint it now,
 * inside the give, so the client's first sight of it is already painted.
 *
 * Painting from the frame hook alone was hit or miss for knives: a give made from a timer (the
 * Jailbreak spawn knife, a respawn, another plugin's loadout) can run after this tick's frame hook,
 * so the snapshot went out with the stock knife and the next frame's paint came too late. The
 * client then kept the stock look, or the old finish on the new model.
 */
function onWeaponEquipped(pawnRef: EntityRef, weaponRef: EntityRef | null): void {
  if (!weaponRef || !settings.skinEnabled) return;
  const key = refKey(weaponRef);
  const at = spawned.findIndex(e => refKey(e.ref) === key);
  if (at < 0) return; // an older weapon picked up from the ground: upstream leaves those as they are
  const entry = spawned[at]!;
  if (entry.tick !== Server.tickCount || painted.has(key)) return;
  const weapon = Weapon.fromEntity(weaponRef);
  const player = weapon?.isValid() ? weaponPlayer(weapon) ?? pawnPlayer(pawnRef) : null;
  if (!weapon || !player) return;
  spawned.splice(at, 1);
  painted.add(key);
  if (weaponIsKnife(weapon, entry.className)) debug(`knife equipped: ${entry.className} on slot ${player.slot}, painting now`);
  applyWeaponSkin(player, weapon, entry.className, true);
  // Paint again at the end of this tick: a spawn's own loadout code can still write the player's real
  // item over this paint after the equip (a reload's give showed the skin, the round-start spawn lost it).
  repaint.push({ ref: weaponRef, className: entry.className, slot: player.slot, userId: player.userId, tick: entry.tick });
}

/** Weapons painted inside an equip this tick, painted once more in the post-simulation frame hook. */
let repaint: { ref: EntityRef; className: string; slot: number; userId: number; tick: number }[] = [];

function repaintEquipped(): void {
  if (repaint.length === 0) return;
  const batch = repaint;
  repaint = [];
  const tick = Server.tickCount;
  for (const entry of batch) {
    // Seen by the client already: leave it to the spawn check, which replaces what did not take.
    if (entry.tick !== tick || pendingSubclass.has(refKey(entry.ref))) continue;
    const weapon = Weapon.fromEntity(entry.ref);
    const player = Player.fromSlot(entry.slot);
    if (!weapon?.isValid() || !player || player.userId !== entry.userId) continue;
    if (keepsOurId(weapon)) continue; // nothing wrote over it
    debug(`slot ${entry.slot}: ${entry.className} lost its paint after the equip; painting again`);
    applyWeaponSkin(player, weapon, entry.className, true);
  }
}

function pawnPlayer(pawnRef: EntityRef): Player | null {
  for (const player of Player.all()) {
    const pawn = player.pawn;
    if (pawn && pawn.ref.index === pawnRef.index && pawn.ref.id === pawnRef.id) return player;
  }
  return null;
}

/** Watch a player pawn's equips (OnEntitySpawned "player", player_spawn, plugin start). Never doubles. */
export function hookPawn(pawn: EntityRef): void {
  SDKUnhook(pawn, SDKHookType.WeaponEquipPost, onWeaponEquipped);
  if (!SDKHook(pawn, SDKHookType.WeaponEquipPost, onWeaponEquipped) && !equipWarned) {
    equipWarned = true;
    console.log('[WeaponPaints] WeaponEquipPost is unavailable: weapons are painted from the frame hook only');
  }
}
let equipWarned = false;

/** The knife `player` should hold on their team: chosen, not the default, and allowed. */
function wantedKnife(player: Player): number {
  const loadout = getLoadout(player.slot);
  if (!loadout || loadout.userId !== player.userId) return 0;
  const team = asTeam(player.teamNum);
  const knife = changedKnife(loadout, team);
  const def = knife ? defindexOf(knife) : 0;
  return def !== 0 && mayApply(player, team ?? 0, 'knife', { defindex: def, model: knife }) ? def : 0;
}

/** Knives painted before the client saw them. Any other knife of a player with a chosen knife is replaced. */
const freshKnives = new Set<string>();
/** Per slot: when its knife was last replaced, so a refused or bounced give cannot loop. */
const knifeReplaced = new Map<number, number>();
const KNIFE_REPLACE_COOLDOWN_MS = 2000;

/**
 * Swap a knife the client has already seen for a new one painted at the give. A seen knife cannot
 * be fixed in place: changing its model draws it invisible or backwards, and a new finish does not
 * show. The give goes through the pickup gates, so a mode that refuses knives keeps refusing it.
 */
function replaceKnife(player: Player, weapon: Weapon, why: string): void {
  const pawn = player.pawn;
  if (!pawn?.isValid || !isAlive(player)) return;
  const owner = weapon.owner;
  if (!owner || owner.ref.index !== pawn.ref.index || owner.ref.id !== pawn.ref.id) return;
  const now = Date.now();
  if (now < (knifeReplaced.get(player.slot) ?? 0) + KNIFE_REPLACE_COOLDOWN_MS) {
    debug(`knife slot ${player.slot}: ${why}, but it was replaced moments ago; left as is`);
    return;
  }
  knifeReplaced.set(player.slot, now);
  const wasActive = pawn.activeWeapon?.ref.index === weapon.ref.index;
  freshKnives.delete(refKey(weapon.ref));
  pawn.removeWeapon(weapon);
  const knife = pawn.giveNamedItem('weapon_knife');
  if (!knife?.isValid()) {
    debug(`knife slot ${player.slot}: ${why}; the replacement give was refused`);
    return;
  }
  const key = refKey(knife.ref);
  // Usually the equip hook has painted it already; if not, paint it here, still inside the give.
  if (!painted.has(key)) {
    painted.add(key);
    applyWeaponSkin(player, knife, null, true);
  }
  debug(`knife slot ${player.slot}: ${why}; replaced with a freshly painted knife`);
  if (wasActive) Clients.fromSlot(player.slot)?.command('slot3');
}

/**
 * Post-simulation game frame: paint the weapons spawned this tick that no equip painted. This runs
 * before the tick's snapshot goes out, so the client's first sight of the weapon already has its
 * paint, name and model. A weapon from an earlier tick has been seen: a gun gets its paint anyway
 * (upstream's fallback), and a knife that needs a skin is replaced, since a seen knife cannot take one.
 */
export function paintSpawnedWeapons(): void {
  flushStaleSubclasses();
  repaintEquipped();
  if (spawned.length === 0) {
    painted.clear();
    return;
  }
  const batch = spawned;
  spawned = [];
  const tick = Server.tickCount;
  for (const entry of batch) {
    if (painted.has(refKey(entry.ref))) continue;
    const weapon = Weapon.fromEntity(entry.ref);
    if (!weapon?.isValid()) continue;
    const player = weaponPlayer(weapon);
    const fresh = entry.tick === tick;
    const knife = weaponIsKnife(weapon, entry.className);
    if (knife) {
      debug(`knife spawned: ${entry.className} defindex ${weaponDefindex(weapon)}, original owner ` +
        `${weapon.originalOwnerXuidLow ?? 0}, player ${player ? `slot ${player.slot}` : 'not found'}, ` +
        `${fresh ? 'this tick' : `${tick - entry.tick} tick(s) late`}`);
    }
    if (!player) {
      // Not owned yet (spawned outside a give): look once more next frame, as upstream's fallback does.
      if (!entry.retried) spawned.push({ ...entry, retried: true });
      continue;
    }
    if (knife && !fresh && wantedKnife(player) !== 0) replaceKnife(player, weapon, 'knife reached the client unpainted');
    else applyWeaponSkin(player, weapon, entry.className, fresh);
  }
  painted.clear();
}

/**
 * player_spawn, once every spawn give has landed (the Jailbreak spawn knife comes 500 ms in): if the
 * knife the player holds was not painted before the client saw it, replace it. This also covers a
 * knife carried over from the last round that lost its look.
 */
export function checkSpawnKnife(player: Player): void {
  const pawn = player.pawn;
  if (!settings.skinEnabled || !pawn?.isValid || !isAlive(player)) return;
  const loadout = getLoadout(player.slot);
  const team = asTeam(player.teamNum);
  // A gun with a chosen finish that no longer carries our item id was written over (the player's real
  // item came back): give the guns and knife again, the path a reload takes, which paints in the give.
  const lostGun = pawn.weapons.find(w => {
    if (!w.isValid() || isKnifeDefindex(weaponDefindex(w))) return false;
    const gear = w.data?.gearSlot;
    if (gear !== GEAR_SLOT_RIFLE && gear !== GEAR_SLOT_PISTOL) return false;
    return !!changedPaint(loadout, team, weaponDefindex(w)) && !keepsOurId(w);
  });
  if (lostGun) {
    debug(`slot ${player.slot}: defindex ${weaponDefindex(lostGun)} lost its skin after spawning; giving the weapons again`);
    refreshWeapons(player);
    return;
  }
  const def = wantedKnife(player);
  if (def === 0) return;
  const knife = pawn.weapons.find(w => w.isValid() && isKnifeDefindex(weaponDefindex(w)));
  if (!knife) return;
  const key = refKey(knife.ref);
  if (weaponDefindex(knife) === def && freshKnives.has(key) && keepsOurId(knife)) return;
  replaceKnife(player, knife, weaponDefindex(knife) !== def ? 'held knife has the stock model'
    : keepsOurId(knife) ? 'held knife was painted late' : 'held knife lost its skin after spawning');
}

function isAlive(player: Player): boolean {
  const pawn = player.pawn;
  return !!pawn && pawn.isValid && pawn.lifeState === LIFE_ALIVE;
}

const reserveOffset = (): number => off('CBasePlayerWeapon', 'm_pReserveAmmo');

function readReserve(weapon: Weapon): number {
  const o = reserveOffset();
  return o < 0 ? 0 : weapon.ref.readInt32(o) ?? 0;
}

function writeReserve(weapon: Weapon, value: number): void {
  const o = reserveOffset();
  if (o >= 0 && weapon.ref.writeInt32(o, value)) weapon.ref.notifyStateChanged(o);
}

/** Bump wear slightly so a re-given weapon with stickers redraws them (IncrementWearForWeaponWithStickers). */
function bumpStickerWear(player: Player, weapon: Weapon): void {
  const loadout = getLoadout(player.slot);
  const defindex = weaponDefindex(weapon);
  const info = changedPaint(loadout, asTeam(player.teamNum), defindex);
  if (!loadout || !info || info.stickers.length === 0) return;
  const current = loadout.tempWear.get(defindex);
  const wear = current === undefined ? info.wear + 0.001 : Math.min(current + 0.001, 1);
  loadout.tempWear.set(defindex, wear);
  weapon.fallbackWear = wear;
}

/** Re-give the player's guns and knife so new skins show (RefreshWeapons). Clip and reserve are kept. */
export function refreshWeapons(player: Player): void {
  if (!commandsAllowed || !isAlive(player) || asTeam(player.teamNum) === null) return;
  const pawn = player.pawn!;
  const guns: { className: string; clip: number; reserve: number }[] = [];
  let hadKnife = false;
  for (const weapon of pawn.weapons) {
    if (!weapon.isValid()) continue;
    const gear = weapon.data?.gearSlot;
    if (gear === GEAR_SLOT_RIFLE || gear === GEAR_SLOT_PISTOL) {
      const className = DEFINDEX_CLASS.get(weaponDefindex(weapon));
      if (!className) continue;
      guns.push({ className, clip: weapon.clip1 ?? 0, reserve: readReserve(weapon) });
      pawn.removeWeapon(weapon);
    } else if (gear === GEAR_SLOT_KNIFE) {
      pawn.removeWeapon(weapon);
      hadKnife = true;
    }
  }
  const userId = player.userId, slot = player.slot;
  after(230, () => {
    const current = Player.fromSlot(slot);
    if (!commandsAllowed || !current || current.userId !== userId || !isAlive(current)) return;
    const body = current.pawn!;
    if (hadKnife && !body.weapons.some(w => w.isValid() && w.data?.gearSlot === GEAR_SLOT_KNIFE)) {
      // The engine refuses knife subclasses by name: give the stock knife and change its model
      // now, in the same call, before the client sees it.
      const knife = body.giveNamedItem('weapon_knife');
      // Usually painted by the equip hook inside the give; otherwise here, still in the same call.
      if (knife?.isValid() && !painted.has(refKey(knife.ref))) {
        painted.add(refKey(knife.ref));
        applyWeaponSkin(current, knife, null);
      }
      Clients.fromSlot(slot)?.command('slot3');
    }
    for (const gun of guns) {
      const weapon = body.giveNamedItem(gun.className);
      if (!weapon) continue;
      // Painted now, in the same call as the give, before the client sees it.
      if (weapon.isValid() && !painted.has(refKey(weapon.ref))) {
        painted.add(refKey(weapon.ref));
        applyWeaponSkin(current, weapon, null);
      }
      nextFrame().then(() => {
        if (!weapon.isValid()) return;
        weapon.clip1 = gun.clip;
        writeReserve(weapon, gun.reserve);
        const owner = Player.fromSlot(slot);
        if (owner && owner.userId === userId) bumpStickerWear(owner, weapon);
      }).catch(() => undefined);
    }
  });
}

/** player_death: count the kill on the attacker's active StatTrak weapon. */
export function countStatTrakKill(attacker: Player): void {
  const weapon = attacker.pawn?.activeWeapon;
  if (!weapon?.isValid()) return;
  const team = asTeam(attacker.teamNum);
  const defindex = weaponDefindex(weapon);
  const info = changedPaint(getLoadout(attacker.slot), team, defindex);
  if (!info?.statTrak) return;
  // A locked StatTrak is not shown, so it does not count either.
  if (!mayApply(attacker, team ?? 0, 'stattrak', { defindex })) return;
  info.statTrakCount += 1;
  weaponAttribute(weapon, 'kill eater', bitsAsFloat(info.statTrakCount));
  weaponAttribute(weapon, 'kill eater score type', 0);
}

export function statTrakTarget(player: Player): WeaponInfo | null {
  const weapon = player.pawn?.activeWeapon;
  if (!weapon?.isValid()) return null;
  return changedPaint(getLoadout(player.slot), asTeam(player.teamNum), weaponDefindex(weapon));
}

// ---- gloves, agents, music kits, pins --------------------------------------------------------

/** GivePlayerGloves: set the pawn's glove item, then cycle the view model so it redraws. */
export function giveGloves(player: Player): void {
  if (!isAlive(player)) return;
  const slot = player.slot, userId = player.userId;
  const client = Clients.fromSlot(slot);
  client?.command('lastinv');
  after(80, () => {
    const current = Player.fromSlot(slot);
    if (!current || current.userId !== userId || !isAlive(current)) return;
    const pawn = current.pawn!;
    const loadout = getLoadout(slot);
    const team = asTeam(current.teamNum);
    const gloveId = team === null ? 0 : loadout?.glove.get(team) ?? 0;
    const info = gloveId === 0 ? null : changedPaint(loadout, team, gloveId);
    if (!info || !mayApply(current, team ?? 0, 'gloves', { defindex: gloveId, paint: info.paint })) return;
    const item = pawn.econGloves;
    item.itemDefinitionIndex = gloveId;
    clearItemAttributes(pawn.ref, gloveItemBase());
    freshItemId(pawn.ref, gloveItemBase());
    gloveAttribute(pawn, 'set item texture prefab', info.paint);
    gloveAttribute(pawn, 'set item texture seed', info.seed);
    gloveAttribute(pawn, 'set item texture wear', info.wear);
    item.initialized = true;
    Clients.fromSlot(slot)?.command('lastinv');
    pawn.ref.acceptInput('SetBodygroup', 'first_or_third_person,0');
    const pawnRef = pawn.ref;
    after(200, () => {
      if (pawnRef.isValid()) pawnRef.acceptInput('SetBodygroup', 'first_or_third_person,1');
    });
  });
}

/** GivePlayerAgent: the team's agent model, set on the next frame. */
export function giveAgent(player: Player): void {
  const loadout = getLoadout(player.slot);
  if (!loadout) return;
  const team = asTeam(player.teamNum);
  const model = team === 3 ? loadout.agent.ct : team === 2 ? loadout.agent.t : null;
  if (!model || !mayApply(player, team ?? 0, 'agent', { model })) return;
  const slot = player.slot, userId = player.userId;
  nextFrame().then(() => {
    const pawn = Player.fromSlot(slot);
    if (!pawn || pawn.userId !== userId || !pawn.pawn?.isValid) return;
    pawn.pawn.ref.setModel(`agents/models/${model}.vmdl`);
  }).catch(() => undefined);
}

/** CCSPlayerController::m_pInventoryServices, and the fields behind it. */
function inventory(): { services: number; music: number; rank: number } {
  return {
    services: off('CCSPlayerController', 'm_pInventoryServices'),
    music: off('CCSPlayerController_InventoryServices', 'm_unMusicID'),
    rank: off('CCSPlayerController_InventoryServices', 'm_rank'),
  };
}

/** GivePlayerMusicKit: controller kit id plus the inventory's music id. */
export function giveMusicKit(player: Player): void {
  const team = asTeam(player.teamNum);
  const music = team === null ? 0 : getLoadout(player.slot)?.music.get(team) ?? 0;
  if (music === 0 || !mayApply(player, team ?? 0, 'music', { defindex: music })) return;
  player.musicKitID = music;
  const inv = inventory();
  if (inv.services < 0 || inv.music < 0) return;
  // m_unMusicID is a uint16: merge it into the 32-bit word so the neighbouring bytes keep their value.
  const word = player.ref.readUInt32Via([inv.services], inv.music);
  if (word === null) return;
  const next = ((word & 0xffff0000) | (music & 0xffff)) | 0;
  if (player.ref.writeInt32Via([inv.services], inv.music, next)) player.ref.notifyStateChanged(inv.services);
}

/** GivePlayerPin: the scoreboard coin is the inventory's sixth medal rank (m_rank[5]). */
export function givePin(player: Player): void {
  const team = asTeam(player.teamNum);
  const loadout = getLoadout(player.slot);
  if (!loadout || team === null || !loadout.pin.has(team)) return;
  const pin = loadout.pin.get(team) ?? 0;
  if (pin > 0 && !mayApply(player, team, 'pin', { defindex: pin })) return;
  const inv = inventory();
  if (inv.services < 0 || inv.rank < 0) return;
  if (player.ref.writeInt32Via([inv.services], inv.rank + 5 * 4, pin > 0 ? pin : 0)) {
    player.ref.notifyStateChanged(inv.services);
  }
}

/** Flash the selected item's image in the HTML center panel for two seconds (ShowSkinImage). */
export function showImage(slot: number, image: string): void {
  if (!settings.showSkinImage || !image) return;
  CenterHtml.to(slot, `<img src='${image.replace(/'/g, '%27')}'></img>`, 2);
}
