// Selection menus, ported from WeaponPaints 3.3a (Commands.cs Setup*Menu).
// GPL-3.0-only. See LICENSE and NOTICE.
import { Menu, MenuStyle } from '@s2script/sdk';
import { Player } from '@s2script/cs2';
import { defindexOf, KNIVES, SKIN_WEAPONS, type Catalog } from './catalog';
import type { Settings } from './config';
import { newWeaponInfo } from './rows';
import {
  commandsAllowed, giveGloves, giveMusicKit, givePin, refreshWeapons, showImage,
} from './apply';
import { maySelect } from './gate';
import { plainPhrase as phrase, say } from './messages';
import { asTeam, getLoadout, selectionTeams, teamWeapons, type Loadout } from './state';
import { saveAgent, saveGlove, saveKnife, saveMusic, savePin, saveWeaponPaints } from './store';

let settings!: Settings;
let catalog!: Catalog;

export function configureMenus(next: Settings, items: Catalog): void {
  settings = next;
  catalog = items;
}

function menu(slot: number, titleKey: Parameters<typeof phrase>[1], ...args: string[]): Menu {
  const m = new Menu(phrase(slot, titleKey, ...args));
  // MenuManager's "chat"/"console" types map to the chat backend; the rest use the center sheet.
  m.style = settings.menuType === 'chat' || settings.menuType === 'console' ? MenuStyle.Chat : MenuStyle.Center;
  return m;
}

/** The selecting player, still on the same connection, with their loaded cosmetics. */
function selector(slot: number, userId: number): { player: Player; loadout: Loadout } | null {
  const player = Player.fromSlot(slot);
  const loadout = getLoadout(slot);
  if (!player || player.userId !== userId || !loadout || loadout.userId !== userId) return null;
  return { player, loadout };
}

/** The team a choice is for, as the hooks report it: 2, 3, or 0 for both. */
const choiceTeam = (player: Player): number => asTeam(player.teamNum) ?? 0;

const alive = (player: Player): boolean => player.pawn?.isValid === true && player.pawn.lifeState === 0;

export function openKnifeMenu(player: Player): void {
  const slot = player.slot, userId = player.userId;
  const m = menu(slot, 'weaponpaints.knife.menu_title');
  for (const [cls, name] of KNIVES) m.addItem(cls, name);
  m.onSelect(e => {
    const s = selector(slot, userId);
    if (!s) return;
    const name = KNIVES.find(([cls]) => cls === e.info)?.[1];
    if (!name) return;
    if (e.info !== 'weapon_knife' &&
      !maySelect(s.player, choiceTeam(s.player), 'knife', { defindex: defindexOf(e.info), model: e.info })) return;
    const teams = selectionTeams(s.player.teamNum);
    say(slot, 'weaponpaints.knife.selected', name);
    if (settings.commandKillEnabled) say(slot, 'weaponpaints.knife.kill_hint');
    for (const team of teams) s.loadout.knife.set(team, e.info);
    if (commandsAllowed && alive(s.player)) refreshWeapons(s.player);
    saveKnife(s.loadout.steamId, e.info, teams);
  });
  m.display(slot);
}

export function openSkinsMenu(player: Player): void {
  const slot = player.slot, userId = player.userId;
  const m = menu(slot, 'weaponpaints.skin.weapon_menu_title');
  for (const [cls, name] of SKIN_WEAPONS) m.addItem(cls, name);
  m.onSelect(e => {
    if (!selector(slot, userId)) return;
    openWeaponSkins(slot, userId, e.info, e.display);
  });
  m.display(slot);
}

function openWeaponSkins(slot: number, userId: number, className: string, weaponName: string): void {
  const skins = catalog.skins.filter(s => s.weaponName === className);
  const defindex = skins[0]?.defindex ?? 0;
  if (defindex === 0) return;
  const m = menu(slot, 'weaponpaints.skin.menu_title', weaponName);
  for (const skin of skins) {
    if (skin.paintName) m.addItem(String(skin.paint), `${skin.paintName} (${skin.paint})`);
  }
  m.onSelect(e => {
    const s = selector(slot, userId);
    const paint = Number(e.info);
    if (!s || !Number.isInteger(paint)) return;
    if (paint > 0 && !maySelect(s.player, choiceTeam(s.player), 'skin', { defindex, paint })) return;
    showImage(slot, skins.find(x => x.paint === paint)?.image ?? '');
    say(slot, 'weaponpaints.skin.selected', e.display);
    for (const team of selectionTeams(s.player.teamNum)) {
      const weapons = teamWeapons(s.loadout, team);
      const info = weapons.get(defindex) ?? newWeaponInfo();
      weapons.set(defindex, info);
      info.paint = paint;
      info.wear = 0.01;
      info.seed = 0;
    }
    if (commandsAllowed && alive(s.player)) refreshWeapons(s.player);
    saveWeaponPaints(s.loadout);
  });
  m.display(slot);
}

export function openGlovesMenu(player: Player): void {
  const slot = player.slot, userId = player.userId;
  const m = menu(slot, 'weaponpaints.glove.menu_title');
  catalog.gloves.forEach((glove, i) => { if (glove.paintName) m.addItem(String(i), glove.paintName); });
  m.onSelect(e => {
    const s = selector(slot, userId);
    const glove = catalog.gloves[Number(e.info)];
    if (!s || !glove) return;
    if (glove.paint !== 0 &&
      !maySelect(s.player, choiceTeam(s.player), 'gloves', { defindex: glove.defindex, paint: glove.paint })) return;
    showImage(slot, glove.image);
    say(slot, 'weaponpaints.glove.selected', glove.paintName);
    const teams = selectionTeams(s.player.teamNum);
    if (glove.paint !== 0) {
      for (const team of teams) {
        s.loadout.glove.set(team, glove.defindex);
        const weapons = teamWeapons(s.loadout, team);
        const info = weapons.get(glove.defindex) ?? newWeaponInfo();
        weapons.set(glove.defindex, info);
        info.paint = glove.paint;
        info.wear = 0;
        info.seed = 0;
      }
    } else {
      for (const team of teams) s.loadout.glove.delete(team);
    }
    saveGlove(s.loadout.steamId, glove.defindex, teams);
    if (glove.paint !== 0) saveWeaponPaints(s.loadout);
    giveGloves(s.player);
  });
  m.display(slot);
}

export function openAgentsMenu(player: Player): void {
  const slot = player.slot, userId = player.userId;
  const team = player.teamNum ?? 0;
  const m = menu(slot, 'weaponpaints.agent.menu_title');
  catalog.agents.forEach((agent, i) => { if (agent.team === team && agent.name) m.addItem(String(i), agent.name); });
  m.onSelect(e => {
    const s = selector(slot, userId);
    const agent = catalog.agents[Number(e.info)];
    if (!s || !agent || agent.team !== s.player.teamNum) return;
    if (agent.model && !maySelect(s.player, choiceTeam(s.player), 'agent', { model: agent.model })) return;
    showImage(slot, agent.image);
    say(slot, 'weaponpaints.agent.selected', agent.name);
    if (s.player.teamNum === 3) s.loadout.agent.ct = agent.model;
    else s.loadout.agent.t = agent.model;
    saveAgent(s.loadout.steamId, s.loadout.agent.ct, s.loadout.agent.t);
  });
  m.display(slot);
}

function openCollectibleMenu(player: Player, kind: 'music' | 'pin'): void {
  const slot = player.slot, userId = player.userId;
  const items = kind === 'music' ? catalog.music : catalog.pins;
  const m = menu(slot, kind === 'music' ? 'weaponpaints.music.menu_title' : 'weaponpaints.pin.menu_title');
  m.addItem('none', phrase(slot, 'weaponpaints.menu.none'));
  items.forEach((item, i) => { if (item.name) m.addItem(String(i), item.name); });
  m.onSelect(e => {
    const s = selector(slot, userId);
    if (!s) return;
    const item = e.info === 'none' ? null : items[Number(e.info)];
    const id = item?.id ?? 0;
    if (id !== 0 && !maySelect(s.player, choiceTeam(s.player), kind, { defindex: id })) return;
    if (item) showImage(slot, item.image);
    const teams = selectionTeams(s.player.teamNum);
    const choices = kind === 'music' ? s.loadout.music : s.loadout.pin;
    for (const team of teams) choices.set(team, id);
    const name = item?.name ?? phrase(slot, 'weaponpaints.menu.none');
    if (kind === 'music') {
      giveMusicKit(s.player);
      say(slot, 'weaponpaints.music.selected', name);
      saveMusic(s.loadout.steamId, id, teams);
    } else {
      say(slot, 'weaponpaints.pin.selected', name);
      givePin(s.player);
      savePin(s.loadout.steamId, id, teams);
    }
  });
  m.display(slot);
}

export const openMusicMenu = (player: Player): void => openCollectibleMenu(player, 'music');
export const openPinsMenu = (player: Player): void => openCollectibleMenu(player, 'pin');
