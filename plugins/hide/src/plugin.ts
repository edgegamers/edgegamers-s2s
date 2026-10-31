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

// Embedded English keeps a standalone .s2sp usable; operator phrase files override it.
const english = {
  'Player.Hide.Enabled': '{orange}[Hide]{default} You {green}turned on{default} hide players!',
  'Player.Hide.Disabled': '{orange}[Hide]{default} You {lightred}turned off{default} hide players!',
  'Player.SaveFailed': '{orange}[Hide]{default} Your setting changed, but could not be saved yet. Retrying while you stay connected.',
};

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
interface Rule { entity: EntityRef; viewers: string; }
const preferences = new Map<number, Preference>();
const rules = new Map<string, Rule>();
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
  cmd.replyToChat(Translations.translate(client.slot, state.enabled ? 'Player.Hide.Enabled' : 'Player.Hide.Disabled'));
  if (!client.isBot && !save(state)) {
    cmd.replyToChat(Translations.translate(client.slot, 'Player.SaveFailed'));
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
    cmd.reply('[HidePlayers] You have successfully reloaded the config.');
  } catch (error) {
    cmd.reply('[HidePlayers] An error occurred.');
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
  const players = Player.allConnected().map(player => {
    const client = Clients.fromSlot(player.slot);
    const state = client?.isValid() ? preference(client) : undefined;
    return {
      slot: player.slot, team: player.teamNum, pawn: player.playerPawn,
      hiding: !!state?.enabled && player.connected === PlayerConnectedState.Connected && !isObserver(player, state),
    };
  });
  const active = new Set<string>();
  for (const target of players) {
    if (!target.pawn?.isValid()) continue;
    const key = `${target.pawn.index}:${target.pawn.id}`;
    const hidden = new Set<number>();
    for (const viewer of players) {
      if (!viewer.hiding || viewer.slot === target.slot) continue;
      if (settings.mode === '@all' ||
          (settings.mode === '@team' && viewer.team === target.team) ||
          (settings.mode === '@enemy' && viewer.team !== target.team)) {
        hidden.add(viewer.slot);
      }
    }
    if (hidden.size === 0) continue;
    active.add(key);
    // Unoccupied slots remain allowed; joining clients start with hiding off.
    const viewers = slots.filter(slot => !hidden.has(slot));
    const signature = viewers.join(',');
    if (rules.get(key)?.viewers === signature) continue;
    if (Transmit.setVisibleTo(target.pawn, viewers)) {
      rules.set(key, { entity: target.pawn, viewers: signature });
    } else if (!visibilityWarning) {
      console.log('[HidePlayers] Could not apply a transmit rule. Check the s2script transmit capability and server gamedata. Retrying.');
      visibilityWarning = true;
    }
  }
  for (const [key, rule] of rules) {
    if (!active.has(key)) {
      Transmit.reset(rule.entity);
      rules.delete(key);
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
