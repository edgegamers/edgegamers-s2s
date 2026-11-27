// HidePlayers 1.3.2 by xstage / edgegamers, ported to s2script 2026-10-11.
// GPL-3.0-only. See LICENSE and NOTICE for upstream attribution.
import {
  ADMFLAG, Clients, command, CookieAccess, Cookies, createScope,
  HookResult, Translations, Transmit,
} from '@s2script/sdk';
import type { Client, CommandInvocation, Cookie, EntityRef, HookResultValue } from '@s2script/sdk';
import { CSPlayerState, Player, PlayerConnectedState, wrapEntity } from '@s2script/cs2';
import type { CBasePlayerController, CCSPlayerPawnBase } from '@s2script/cs2';
import { commandNames, readConfig } from './config';
import type { HideConfig } from './config';

// Embedded English keeps standalone archives usable; operator phrase files override it.
import { phrase, plain } from './phrases';
import english from '../translations/hideplayers.phrases.json';

interface Preference {
  client: Client;
  enabled: boolean;
  pending: boolean;
  retryAt: number;
  observerView?: {
    controllerKey: string;
    controller: CBasePlayerController;
    pawnKey?: string;
    pawn?: CCSPlayerPawnBase;
  };
}
// One rule per hidden pawn, keyed by entity index. `lo`/`hi` are the slots hidden from it (bits
// 0-31 and 32-63), so an unchanged rule is two integer compares and builds nothing.
interface Rule { entity: EntityRef; id: number; lo: number; hi: number; pass: number; }
const preferences = new Map<number, Preference>();
const rules = new Map<number, Rule>();
let pass = 0;
const slots = Array.from({ length: 64 }, (_, slot) => slot);
const reloadCommands = new Set(['css_hide_reload', 'hide_reload']);
let settings: HideConfig;
let cookie: Cookie;
let visibilityWarning = false;
let mapActive = true;

const parseCookie = (value: string): boolean => value.trim().toLowerCase() === 'true';

function preference(client: Client): Preference {
  const current = preferences.get(client.slot);
  if (current?.client.isValid()) return current;
  const state: Preference = {
    client,
    // Also reads local accepted writes when the database cache is still loading.
    enabled: !client.isBot && parseCookie(Cookies.get(client, cookie)),
    pending: false,
    retryAt: 0,
  };
  preferences.set(client.slot, state);
  return state;
}

function save(state: Preference): boolean {
  state.pending = !Cookies.set(state.client, cookie, state.enabled ? 'True' : 'False');
  state.retryAt = Date.now() + 1000;
  return !state.pending;
}

function toggle(cmd: CommandInvocation): HookResultValue {
  const client = Clients.fromSlot(cmd.callerSlot);
  if (!client?.isValid()) return HookResult.Handled;
  const state = preference(client);
  state.enabled = !state.enabled;
  cmd.replyToChat(phrase(client.slot, state.enabled ? 'hide.players.enabled' : 'hide.players.disabled'));
  if (!client.isBot && !save(state)) {
    cmd.replyToChat(phrase(client.slot, 'hide.preferences.save_failed'));
  }
  updateVisibility();
  return HookResult.Handled;
}

function reload(cmd: CommandInvocation): HookResultValue {
  try {
    const next = readConfig();
    commandNames(next.cmds); // Reject malformed edits before replacing working settings.
    settings = next;
    updateVisibility();
    replyPhrase(cmd, 'hide.config.reloaded');
  } catch (error) {
    replyPhrase(cmd, 'hide.config.reload_failed');
    console.log(`[HidePlayers] An error occurred while reloading the configuration: ${String(error)}`);
  }
  return HookResult.Handled;
}

export function OnPluginStart(): void {
  settings = readConfig();
  cookie = Cookies.register('hide_player_status', { access: CookieAccess.Public, default: '', description: '' });
  Translations.load('hideplayers', english);
  for (const name of commandNames(settings.cmds)) {
    if (reloadCommands.has(name)) throw new Error(`${name} is reserved for config reload`);
    command(name, toggle);
  }
  for (const name of reloadCommands) command.admin(name, ADMFLAG.ROOT, reload);
  for (const client of Clients.all()) preference(client);
  // Read state after simulation, before the engine's outgoing snapshots. Native
  // CheckTransmit enforces the rules; no JS runs inside its per-recipient hook.
  createScope().server.onGameFrame(updateVisibility, { phase: 'post' });
}

export function OnClientPutInServer(client: Client): void {
  preference(client);
}

export function OnClientCookiesCached(client: Client): void {
  if (!client.isValid() || client.isBot || !Cookies.areCached(client)) return;
  const state = preference(client);
  if (!state.pending) state.enabled = parseCookie(Cookies.get(client, cookie));
}

export function OnClientDisconnect(client: Client): void {
  const state = preferences.get(client.slot);
  // Client handles are already invalid here; persistence happens while connected.
  if (state && !state.client.isValid()) {
    if (state.pending) console.log('[HidePlayers] A player disconnected before their preference could be saved.');
    preferences.delete(client.slot);
  }
}

function isObserver(player: Player, state: Preference): boolean {
  // wrapEntity installs every accessor on a new view. Reuse those live views
  // until the entity serial changes, including across respawns at the same index.
  const controllerKey = `${player.ref.index}:${player.ref.id}`;
  if (state.observerView?.controllerKey !== controllerKey) {
    state.observerView = {
      controllerKey,
      controller: wrapEntity('CBasePlayerController', player.ref),
    };
  }
  const view = state.observerView;
  // Player.pawn follows m_hPlayerPawn; observer state must instead follow m_hPawn.
  const currentPawn = view.controller.pawn;
  if (currentPawn === null) {
    view.pawnKey = undefined;
    view.pawn = undefined;
    return false;
  }
  const pawnKey = `${currentPawn.index}:${currentPawn.id}`;
  if (view.pawnKey !== pawnKey) {
    view.pawn = wrapEntity('CCSPlayerPawnBase', currentPawn);
    view.pawnKey = pawnKey;
  }
  return view.pawn?.playerState === CSPlayerState.STATE_OBSERVER_MODE;
}

function updateVisibility(): void {
  if (!mapActive) return;
  const now = Date.now();
  for (const [slot, state] of preferences) {
    if (!state.client.isValid()) preferences.delete(slot);
    else if (state.pending && now >= state.retryAt) save(state);
  }
  // Nobody is hiding and nothing is hidden: the usual frame. Skip the player pass entirely.
  if (rules.size === 0) {
    let anyone = false;
    for (const state of preferences.values()) if (state.enabled) { anyone = true; break; }
    if (!anyone) return;
  }
  const players = Player.allConnected().map(player => {
    const client = Clients.fromSlot(player.slot);
    const state = client?.isValid() ? preference(client) : undefined;
    return {
      slot: player.slot, team: player.teamNum, pawn: player.playerPawn,
      hiding: !!state?.enabled && player.connected === PlayerConnectedState.Connected && !isObserver(player, state),
    };
  });
  pass++;
  const mode = settings.mode;
  for (const target of players) {
    const pawn = target.pawn;
    if (!pawn?.isValid()) continue;
    let lo = 0, hi = 0;
    for (const viewer of players) {
      if (!viewer.hiding || viewer.slot === target.slot) continue;
      if (mode === '@all' ||
          (mode === '@team' && viewer.team === target.team) ||
          (mode === '@enemy' && viewer.team !== target.team)) {
        if (viewer.slot < 32) lo |= 1 << viewer.slot; else hi |= 1 << (viewer.slot - 32);
      }
    }
    if (lo === 0 && hi === 0) continue;
    const rule = rules.get(pawn.index);
    if (rule && rule.id === pawn.id) {
      rule.pass = pass;
      if (rule.lo === lo && rule.hi === hi) continue;
    }
    // Unoccupied slots remain allowed; joining clients start with hiding off.
    const viewers = slots.filter(slot => ((slot < 32 ? lo >>> slot : hi >>> (slot - 32)) & 1) === 0);
    if (Transmit.setVisibleTo(pawn, viewers)) {
      // A new entity at a reused index: the old entity's rule goes with it.
      if (rule && rule.id !== pawn.id) Transmit.reset(rule.entity);
      rules.set(pawn.index, { entity: pawn, id: pawn.id, lo, hi, pass });
    } else if (!visibilityWarning) {
      console.log('[HidePlayers] Could not apply a transmit rule. Check the s2script transmit capability and server gamedata. Retrying.');
      visibilityWarning = true;
    }
  }
  for (const [index, rule] of rules) {
    if (rule.pass !== pass) {
      Transmit.reset(rule.entity);
      rules.delete(index);
    }
  }
}

function clearRules(): void {
  Transmit.resetAll();
  rules.clear();
  visibilityWarning = false;
  for (const state of preferences.values()) state.observerView = undefined;
}

export function OnMapEnd(): void { mapActive = false; clearRules(); }
export function OnMapStart(): void { clearRules(); mapActive = true; }
export function OnPluginEnd(): void { clearRules(); preferences.clear(); }

function replyPhrase(cmd: CommandInvocation, key: string): void {
  const text = phrase(cmd.callerSlot, key);
  // Reload phrases also serve console callers; only the owned leading chat header changes.
  cmd.reply(cmd.replySource === 'chat' && cmd.callerSlot >= 0 ? text.replace(
    /^([\x01-\x10])\[([^\]\r\n]+)\] ?(?:\x08 ?)?/,
    (_prefix, color: string, label: string) => `${color}${label} \x08» `,
  ) : plain(text));
}
