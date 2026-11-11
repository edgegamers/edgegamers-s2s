// WeaponPaints 3.3a by Nereziel & daffyy, ported to s2script 2026-11-09.
// GPL-3.0-only. See LICENSE and NOTICE for upstream attribution.
import { after, Clients, command, Files, HookResult, nextFrame, publish } from '@s2script/sdk';
import type { Client, CommandInvocation, EntityRef, HookResultValue } from '@s2script/sdk';
import { Events, Player } from '@s2script/cs2';
import skinsEn from '../data/skins_en.json';
import glovesEn from '../data/gloves_en.json';
import agentsEn from '../data/agents_en.json';
import musicEn from '../data/music_en.json';
import pinsEn from '../data/collectibles_en.json';
import {
  parseAgents, parseCollectibles, parseGloves, parseSkins, type Catalog,
} from './catalog';
import { readSettings, type Settings } from './config';
import {
  configureApply, countStatTrakKill, giveAgent, giveGloves, giveMusicKit, givePin, onWeaponSpawned,
  refreshWeapons, resetMapState, setCommandsAllowed, statTrakTarget, commandsAllowed,
} from './apply';
import {
  configureMenus, openAgentsMenu, openGlovesMenu, openKnifeMenu, openMusicMenu, openPinsMenu, openSkinsMenu,
} from './menus';
import { mayApply, maySelect, setGateHandle } from './gate';
import { loadPhrases, say } from './messages';
import { asTeam, clearLoadouts, dropLoadout, getLoadout, setLoadout, type Loadout } from './state';
import { loadPlayer, openStore, saveStatTrak, storeReady } from './store';

let settings: Settings;
const catalog: Catalog = {
  skins: parseSkins(skinsEn), gloves: parseGloves(glovesEn), agents: parseAgents(agentsEn),
  music: parseCollectibles(musicEn), pins: parseCollectibles(pinsEn),
};
const cooldowns = new Map<number, number>();
let mvpPlayed = false;
const log = (m: string): void => console.log(`[WeaponPaints] ${m}`);

/**
 * Item names in another language: drop upstream's `<kind>_<lang>.json` files into this plugin's
 * files directory under `data/`. English ships inside the plugin.
 */
async function loadLanguage(language: string): Promise<void> {
  if (language === 'en') return;
  const files: [string, (v: unknown) => void][] = [
    ['skins', v => { catalog.skins = parseSkins(v); }],
    ['gloves', v => { catalog.gloves = parseGloves(v); }],
    ['agents', v => { catalog.agents = parseAgents(v); }],
    ['music', v => { catalog.music = parseCollectibles(v); }],
    ['collectibles', v => { catalog.pins = parseCollectibles(v); }],
  ];
  for (const [kind, apply] of files) {
    const path = `data/${kind}_${language}.json`;
    try {
      const text = await Files.readText(path);
      if (text === null) log(`${path} not found; using English item names`);
      else apply(JSON.parse(text));
    } catch (e) {
      log(`${path} could not be read (${String(e)}); using English item names`);
    }
  }
}

// ---- player data -----------------------------------------------------------------------------

/** Keep in-session StatTrak kills a reload would otherwise drop before they reach the database. */
function carryStatTrak(from: Loadout | undefined, to: Loadout): void {
  if (!from || from.userId !== to.userId) return;
  for (const [team, weapons] of from.weapons) {
    for (const [defindex, old] of weapons) {
      const next = to.weapons.get(team)?.get(defindex);
      if (next && old.statTrakCount > next.statTrakCount) next.statTrakCount = old.statTrakCount;
      if (next) next.statTrak = old.statTrak;
    }
  }
}

function loadClient(client: Client): Promise<boolean> {
  if (client.isBot || client.steamId === '0' || !client.isValid() || !storeReady()) return Promise.resolve(false);
  const { slot, userId, steamId } = client;
  return loadPlayer(steamId, userId, settings).then(loadout => {
    if (!client.isValid()) return false;
    carryStatTrak(getLoadout(slot), loadout);
    setLoadout(slot, loadout);
    return true;
  }, (e: unknown) => {
    log(`could not load ${steamId}: ${String(e)}`);
    return false;
  });
}

function loadConnected(): void {
  for (const client of Clients.all()) {
    if (!getLoadout(client.slot)) void loadClient(client);
  }
}

/** Re-apply everything after a reload (OnCommandRefresh / wp_refresh). */
function reapply(player: Player): void {
  giveGloves(player);
  refreshWeapons(player);
  giveAgent(player);
  giveMusicKit(player);
  const slot = player.slot, userId = player.userId;
  after(150, () => {
    const current = Player.fromSlot(slot);
    if (current && current.userId === userId) givePin(current);
  });
}

function refreshPlayer(player: Player): void {
  const client = Clients.fromSlot(player.slot);
  if (!client) return;
  void loadClient(client).then(() => {
    const current = Player.fromSlot(client.slot);
    if (client.isValid() && current && current.userId === client.userId) reapply(current);
  });
}

// ---- commands --------------------------------------------------------------------------------

/** A human player who may use a menu command right now, honouring the shared cooldown. */
function caller(cmd: CommandInvocation, needsRoundLive: boolean, needsLoadout = true): Player | null {
  if (cmd.callerSlot < 0) return null;
  const client = Clients.fromSlot(cmd.callerSlot);
  const player = Player.fromSlot(cmd.callerSlot);
  if (!client?.isValid() || client.isBot || !player || player.userId !== client.userId) return null;
  if (needsLoadout && getLoadout(cmd.callerSlot)?.userId !== client.userId) return null;
  if (needsRoundLive && !commandsAllowed) return null;
  return player;
}

function takeCooldown(slot: number): boolean {
  const now = Date.now();
  if (now < (cooldowns.get(slot) ?? 0)) {
    say(slot, 'wp_command_cooldown');
    return false;
  }
  cooldowns.set(slot, now + settings.cooldownSeconds * 1000);
  return true;
}

function menuCommand(names: string[], open: (player: Player) => void, needsRoundLive = true): void {
  for (const name of names) {
    command(`sm_${name}`, cmd => {
      const player = caller(cmd, needsRoundLive);
      if (player && takeCooldown(player.slot)) open(player);
      return HookResult.Handled;
    });
  }
}

function onRefresh(cmd: CommandInvocation): HookResultValue {
  if (!settings.commandWpEnabled || !settings.skinEnabled) return HookResult.Handled;
  // No loaded data is required: !wp is also how a player retries after a failed load.
  const player = caller(cmd, true, false);
  if (!player || !takeCooldown(player.slot)) return HookResult.Handled;
  refreshPlayer(player);
  say(player.slot, 'wp_command_refresh_done');
  return HookResult.Handled;
}

function onInfo(cmd: CommandInvocation): HookResultValue {
  const player = caller(cmd, false);
  if (!player || !settings.skinEnabled) return HookResult.Handled;
  const slot = player.slot;
  say(slot, 'wp_info_website', settings.website);
  say(slot, 'wp_info_refresh');
  if (settings.gloveEnabled) say(slot, 'wp_info_glove');
  if (settings.agentEnabled) say(slot, 'wp_info_agent');
  if (settings.musicEnabled) say(slot, 'wp_info_music');
  if (settings.pinsEnabled) say(slot, 'wp_info_pin');
  if (settings.knifeEnabled) say(slot, 'wp_info_knife');
  return HookResult.Handled;
}

function onStatTrak(cmd: CommandInvocation): HookResultValue {
  const player = caller(cmd, false);
  const info = player ? statTrakTarget(player) : null;
  if (!player || !info) return HookResult.Handled;
  const defindex = player.pawn?.activeWeapon?.attributeManager.item.itemDefinitionIndex ?? 0;
  if (!info.statTrak && !maySelect(player, asTeam(player.teamNum) ?? 0, 'stattrak', { defindex })) {
    return HookResult.Handled;
  }
  info.statTrak = !info.statTrak;
  refreshWeapons(player);
  say(player.slot, 'wp_stattrak_action');
  return HookResult.Handled;
}

function onKill(cmd: CommandInvocation): HookResultValue {
  const player = caller(cmd, false, false);
  if (player?.pawn?.isValid) player.pawn.slay();
  return HookResult.Handled;
}

/** Server console: `wp_refresh <steamid64|all>`. */
function onAdminRefresh(cmd: CommandInvocation): HookResultValue {
  if (!settings.commandWpEnabled || !settings.skinEnabled || !commandsAllowed) return HookResult.Handled;
  const arg = cmd.arg(0).trim();
  if (arg === '') {
    cmd.reply('[WeaponPaints] Usage: wp_refresh <steamid64|all>');
    cmd.reply('[WeaponPaints]   wp_refresh all - Refresh skins for all players');
    cmd.reply('[WeaponPaints]   wp_refresh 76561198012345678 - Refresh skins by SteamID64');
    return HookResult.Handled;
  }
  const clients = Clients.all().filter(c => c.isValid() && !c.isBot && c.userId >= 0 &&
    (arg.toLowerCase() === 'all' || c.steamId === arg));
  if (clients.length === 0) {
    cmd.reply(arg.toLowerCase() === 'all'
      ? '[WeaponPaints] No players connected to refresh.'
      : `[WeaponPaints] Player with SteamID64 '${arg}' not found.`);
    return HookResult.Handled;
  }
  for (const client of clients) {
    const player = Player.fromSlot(client.slot);
    if (!player) continue;
    refreshPlayer(player);
    say(client.slot, 'wp_command_refresh_done');
    cmd.reply(`[WeaponPaints] Skins refreshed for ${client.name}`);
  }
  return HookResult.Handled;
}

function registerCommands(): void {
  const c = settings.commands;
  for (const name of c.statTrak) command(`sm_${name}`, onStatTrak);
  for (const name of c.skin) command(`sm_${name}`, onInfo);
  for (const name of c.refresh) command(`sm_${name}`, onRefresh);
  if (settings.commandKillEnabled) for (const name of c.kill) command(`sm_${name}`, onKill);
  command.server('wp_refresh', onAdminRefresh);
  if (settings.knifeEnabled) menuCommand(c.knife, openKnifeMenu);
  if (settings.skinEnabled) menuCommand(c.skinSelection, openSkinsMenu, false);
  if (settings.gloveEnabled) menuCommand(c.glove, openGlovesMenu);
  if (settings.agentEnabled) menuCommand(c.agent, openAgentsMenu);
  if (settings.musicEnabled) menuCommand(c.music, openMusicMenu);
  if (settings.pinsEnabled) menuCommand(c.pin, openPinsMenu);
}

// ---- events ----------------------------------------------------------------------------------

function registerEvents(): void {
  Events.on('player_spawn', ev => {
    const player = Player.fromSlot(ev.getPlayerSlot('userid'));
    if (!player?.pawn || !getLoadout(player.slot)) return;
    giveMusicKit(player);
    giveAgent(player);
    const slot = player.slot, userId = player.userId;
    nextFrame().then(() => {
      const current = Player.fromSlot(slot);
      if (current && current.userId === userId) giveGloves(current);
    }).catch(() => undefined);
    givePin(player);
  });
  Events.on('round_start', () => { setCommandsAllowed(true); mvpPlayed = false; });
  Events.on('round_end', () => { setCommandsAllowed(false); });
  Events.onPre('round_mvp', ev => {
    if (mvpPlayed || !settings.musicEnabled) return;
    const slot = ev.getPlayerSlot('userid');
    const player = Player.fromSlot(slot);
    const team = asTeam(player?.teamNum);
    const music = team === null ? 0 : getLoadout(slot)?.music.get(team) ?? 0;
    if (music === 0 || !player || !mayApply(player, team ?? 0, 'music', { defindex: music })) return;
    ev.setUint64('musickitid', String(music));
    ev.setInt('nomusic', 0);
    mvpPlayed = true;
    return HookResult.Changed;
  });
  Events.on('player_death', ev => {
    const attacker = ev.getPlayerSlot('attacker');
    const victim = ev.getPlayerSlot('userid');
    if (attacker < 0 || victim < 0 || attacker === victim) return;
    const player = Player.fromSlot(attacker);
    if (player && getLoadout(attacker)) countStatTrakKill(player);
  });
}

// ---- lifecycle -------------------------------------------------------------------------------

/** The contract's refresh(): re-apply loaded selections, no database round trip. */
function refreshSlot(slot: number): boolean {
  const player = Player.fromSlot(slot);
  const loadout = getLoadout(slot);
  if (!player || !loadout || loadout.userId !== player.userId) return false;
  reapply(player);
  return true;
}

/** The contract's reload(): read the database again, then re-apply (what `!wp` does). */
function reloadSlot(slot: number): boolean {
  const client = Clients.fromSlot(slot);
  const player = Player.fromSlot(slot);
  if (!client?.isValid() || client.isBot || !player || player.userId !== client.userId || !storeReady()) return false;
  refreshPlayer(player);
  return true;
}

export function OnPluginStart(): void {
  setGateHandle(publish('@edgegamers/s2s-weaponpaints', { refresh: refreshSlot, reload: reloadSlot }));
  settings = readSettings();
  configureApply(settings, catalog);
  configureMenus(settings, catalog);
  loadPhrases();
  registerCommands();
  registerEvents();
  void loadLanguage(settings.skinsLanguage);
  openStore(loadConnected);
}

export function OnPluginEnd(): void {
  for (const client of Clients.all()) {
    const loadout = getLoadout(client.slot);
    if (loadout) saveStatTrak(loadout);
  }
  // Writes still in flight at unload are dropped by the runtime; the ledger closes the connection.
  clearLoadouts();
}

export function OnMapStart(): void {
  resetMapState();
}

/** Fully connected and authenticated (upstream: player_connect_full), so the SteamID is known. */
export function OnClientPostAdminCheck(client: Client): void {
  void loadClient(client);
}

export function OnClientDisconnect(client: Client): void {
  const loadout = dropLoadout(client.slot);
  if (loadout && loadout.userId === client.userId) saveStatTrak(loadout);
  cooldowns.delete(client.slot);
}

export function OnEntitySpawned(entity: EntityRef | null, className: string): void {
  if (entity && className.startsWith('weapon_')) onWeaponSpawned(entity, className);
}
