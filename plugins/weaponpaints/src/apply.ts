// Applying cosmetics to entities, ported from WeaponPaints 3.3a (WeaponAction.cs, Events.cs).
// GPL-3.0-only. See LICENSE and NOTICE.
import { after, Clients, nextFrame } from '@s2script/sdk';
import type { EntityRef } from '@s2script/sdk';
import { Engine, Ptr } from '@s2script/sdk/unsafe';
import { CenterHtml, Player, Weapon } from '@s2script/cs2';
import type { Pawn } from '@s2script/cs2';
import {
  DEFINDEX_CLASS, defindexOf, isKnifeClass, isKnifeDefindex, isLegacyModel, randomPaint, type Catalog,
} from './catalog';
import { mayApply } from './gate';
import type { WeaponInfo } from './rows';
import type { Settings } from './config';
import {
  allLoadouts, asTeam, changedKnife, changedPaint, getLoadout, type Loadout,
} from './state';

declare const __s2_schema_offset: ((className: string, field: string) => number) | undefined;

const MINIMUM_CUSTOM_ITEM_ID = 65578;
const LIFE_ALIVE = 0;
const GEAR_SLOT_RIFLE = 0, GEAR_SLOT_PISTOL = 1, GEAR_SLOT_KNIFE = 2;
const CUSTOM_NAME_LENGTH = 161;

let settings!: Settings;
let catalog!: Catalog;
let nextItemId = MINIMUM_CUSTOM_ITEM_ID;
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

export function resetMapState(): void {
  nextItemId = MINIMUM_CUSTOM_ITEM_ID;
  fadeSeed = 0;
  ungivableKnives.clear();
  painted.clear();
  spawned = [];
}

// ---- knife replacement -----------------------------------------------------------------------

/** Knife classes the engine refused to give this map: those players keep the stock knife. */
const ungivableKnives = new Set<string>();
/** Slots whose knife is being replaced right now, so the nested apply cannot recurse. */
const replacing = new Set<number>();
/** Weapons already painted on creation, so their own next-frame spawn apply skips them. */
const painted = new Set<string>();
const refKey = (ref: EntityRef): string => `${ref.index}:${ref.id}`;

/**
 * Swap a knife of the wrong model for a fresh one of the chosen class.
 *
 * Upstream changes the model in place (ChangeSubclass) from inside GiveNamedItem, before the knife
 * is ever networked. s2script has no GiveNamedItem hook, so here the knife has already been sent
 * to the client, and often deployed, when it is seen. Changing its subclass then leaves the view
 * model out of step with the world model: the knife is invisible, or the player's own inventory
 * knife is drawn held backwards while inspect plays the chosen one. A newly given knife is created
 * with the right model, so the client never sees a mismatch.
 */
function replaceKnife(player: Player, weapon: Weapon, knife: string, def: number): void {
  const pawn = player.pawn;
  const slot = player.slot;
  if (!pawn?.isValid || replacing.has(slot) || ungivableKnives.has(knife)) return;
  const wasActive = pawn.activeWeapon?.ref.index === weapon.ref.index;
  if (!pawn.removeWeapon(weapon)) return;
  replacing.add(slot);
  try {
    const fresh = pawn.giveNamedItem(knife);
    if (!fresh?.isValid()) {
      ungivableKnives.add(knife);
      console.log(`[WeaponPaints] could not give ${knife}; keeping the stock knife this map`);
      pawn.giveNamedItem('weapon_knife');
    } else {
      // Same tick as its creation, before it is networked: safe to fix the subclass if the engine
      // mapped the class name to another definition.
      if (weaponDefindex(fresh) !== def) fresh.ref.acceptInput('ChangeSubclass', String(def));
      applyWeaponSkin(player, fresh, knife);
      painted.add(refKey(fresh.ref));
    }
  } finally {
    replacing.delete(slot);
  }
  if (wasActive) Clients.fromSlot(slot)?.command('slot3');
}

/** The knife class to give the player: their chosen knife when it may be applied, else the stock one. */
function knifeToGive(player: Player): string {
  const loadout = getLoadout(player.slot);
  const team = asTeam(player.teamNum);
  const knife = settings.skinEnabled && loadout?.userId === player.userId ? changedKnife(loadout, team) : null;
  if (!knife || ungivableKnives.has(knife)) return 'weapon_knife';
  const def = defindexOf(knife);
  if (def === 0 || !mayApply(player, team ?? 0, 'knife', { defindex: def, model: knife })) return 'weapon_knife';
  return knife;
}

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
  setAttributeOnList.call(base.add(listOffset), name, value);
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
function freshItemId(ref: EntityRef, itemBase: number): void {
  if (itemBase < 0) return;
  const id = nextItemId++;
  const low = id >>> 0, high = Math.floor(id / 0x1_0000_0000) >>> 0;
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

function applyStickers(weapon: Weapon, info: WeaponInfo, loadout: Loadout, defindex: number): void {
  info.stickers.forEach((sticker, slot) => {
    weapon.setAttribute(`sticker slot ${slot} id`, bitsAsFloat(sticker.id));
    if (sticker.offsetX !== 0 || sticker.offsetY !== 0) weapon.setAttribute(`sticker slot ${slot} schema`, 0);
    weapon.setAttribute(`sticker slot ${slot} offset x`, sticker.offsetX);
    weapon.setAttribute(`sticker slot ${slot} offset y`, sticker.offsetY);
    weapon.setAttribute(`sticker slot ${slot} wear`, sticker.wear);
    weapon.setAttribute(`sticker slot ${slot} scale`, sticker.scale);
    weapon.setAttribute(`sticker slot ${slot} rotation`, sticker.rotation);
  });
  const wear = loadout.tempWear.get(defindex);
  if (wear !== undefined) weapon.fallbackWear = wear;
}

function applyKeyChain(weapon: Weapon, info: WeaponInfo): void {
  const k = info.keyChain;
  if (!k) return;
  weapon.setAttribute('keychain slot 0 id', bitsAsFloat(k.id));
  weapon.setAttribute('keychain slot 0 offset x', k.offsetX);
  weapon.setAttribute('keychain slot 0 offset y', k.offsetY);
  weapon.setAttribute('keychain slot 0 offset z', k.offsetZ);
  weapon.setAttribute('keychain slot 0 seed', bitsAsFloat(k.seed));
}

/** GivePlayerWeaponSkin: knife model, paint kit, wear, seed, name tag, StatTrak, stickers, keychain. */
export function applyWeaponSkin(player: Player, weapon: Weapon, className: string | null): void {
  if (!settings.skinEnabled || !weapon.isValid()) return;
  const loadout = getLoadout(player.slot);
  if (!loadout || loadout.userId !== player.userId) return;
  const team = asTeam(player.teamNum);
  const item = weapon.attributeManager.item;
  const itemBase = weaponItemBase();

  if (weaponIsKnife(weapon, className)) {
    const knife = changedKnife(loadout, team);
    if (!knife) return;
    const def = defindexOf(knife);
    if (def === 0) return;
    // Vetoed: the stock knife stays, unpainted (a knife paint is keyed to the knife's own defindex).
    if (!mayApply(player, team ?? 0, 'knife', { defindex: def, model: knife })) return;
    if (weaponDefindex(weapon) !== def && !replacing.has(player.slot)) {
      // A fresh knife of the chosen class is painted as it is given.
      replaceKnife(player, weapon, knife, def);
      return;
    }
    item.itemDefinitionIndex = def;
    item.entityQuality = 3;
  } else {
    item.entityQuality = 0;
  }

  freshItemId(weapon.ref, itemBase);
  const defindex = weaponDefindex(weapon);
  item.accountID = accountIdOf(loadout.steamId);

  let info = changedPaint(loadout, team, defindex);
  // Vetoed: the stock finish this time. The saved row is kept, so it comes back once allowed.
  if (info && !mayApply(player, team ?? 0, 'skin', { defindex, paint: info.paint })) return;
  if (settings.giveRandomSkin && !info) {
    const paint = randomPaint(catalog, defindex);
    if (paint === 0) return;
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
  applyKeyChain(weapon, info);
  if (info.stickers.length > 0) applyStickers(weapon, info, loadout, defindex);
  setLegacyModel(weapon, isLegacyModel(catalog, defindex, info.paint));
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
    return null;
  }
  return weapon.owner?.controller ?? null;
}

/** Weapons spawned this frame, painted in the post-simulation frame hook. */
let spawned: { ref: EntityRef; className: string; retried: boolean }[] = [];

/**
 * OnEntitySpawned for weapon_* classes. The owner is not set yet at spawn, so the weapon is queued
 * and painted by {@link paintSpawnedWeapons} at the end of this frame.
 */
export function onWeaponSpawned(ref: EntityRef, className: string): void {
  if (!settings.skinEnabled) return;
  spawned.push({ ref, className, retried: false });
}

/**
 * Post-simulation game frame: paint the weapons spawned this frame. This runs before the frame's
 * snapshot goes out, so the client's first sight of the weapon already has its paint, name and
 * model. Upstream does the same from a GiveNamedItem post hook. Painting a frame later is too late:
 * the client has built the weapon's look by then and keeps the old finish (a new name tag still
 * shows), and a knife changed then is drawn backwards or not at all.
 */
export function paintSpawnedWeapons(): void {
  if (spawned.length === 0) return;
  const batch = spawned;
  spawned = [];
  for (const entry of batch) {
    if (painted.delete(refKey(entry.ref))) continue;
    const weapon = Weapon.fromEntity(entry.ref);
    if (!weapon?.isValid()) continue;
    const player = weaponPlayer(weapon);
    if (player) applyWeaponSkin(player, weapon, entry.className);
    // Not owned yet (spawned outside a give): look once more next frame, as upstream's fallback does.
    else if (!entry.retried) spawned.push({ ...entry, retried: true });
  }
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
      const knife = body.giveNamedItem(knifeToGive(current));
      if (knife?.isValid()) {
        applyWeaponSkin(current, knife, null);
        painted.add(refKey(knife.ref));
      }
      Clients.fromSlot(slot)?.command('slot3');
    }
    for (const gun of guns) {
      const weapon = body.giveNamedItem(gun.className);
      if (!weapon) continue;
      // Painted now, in the same call as the give, before the client sees it.
      if (weapon.isValid()) {
        applyWeaponSkin(current, weapon, null);
        painted.add(refKey(weapon.ref));
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
