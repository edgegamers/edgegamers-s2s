import {
  Admin, Clients, config, createScope, command, HookResult, Plugins, publish, Server, UserMessages, watchOptional,
  type Client, type CommandInvocation, type Scope,
} from '@s2script/sdk';
import type { PublishHandle, TypedInterfaceHandle } from '@s2script/sdk/interfaces';
import { chat, GameRules, Player } from '@s2script/cs2';
import type { Contract as SpecialDaysContract } from '../../jb/plugins/specialdays/api.d.ts';
import { DEFAULT_CONFIG, flagMask, parseConfig, type DecluttrConfig } from './config';
import { createChatPolicy, type ChatPlayer } from './chat';
import { createEffects } from './effects';
import { createLegs } from './legs';
import { color, loadPhrases, phrase, reply } from './phrases';

const CONFIG_FILE = 'Decluttr.json';
let settings: DecluttrConfig = parseConfig({}), scope: Scope, published: PublishHandle;
let revision = 0, mapActive = true, roundEnded = false;
let specialDays: TypedInterfaceHandle<SpecialDaysContract> | null = null;
const pendingNames = new Map<number, Client>();
const managedNames = new Map<number, { client: Client; original: string; applied: string }>();
const tttOwnsChat = () => Plugins.list().some(p => p.loaded && (p.id === '@edgegamers/ttt-core' || p.id === 'ttt-core'));
function ownsKillfeed(): boolean {
  if (tttOwnsChat()) return true;
  try { return specialDays?.getCurrent()?.type === 'gungame'; } catch { return false; }
}
function live(): boolean { const rules = GameRules.get(); return !!rules && !rules.warmupPeriod && !roundEnded && rules.hasMatchStarted !== false; }
function actor(slot: number): ChatPlayer | null {
  const client = Clients.fromSlot(slot), player = Player.fromSlot(slot);
  if (!client?.isValid() || !player?.ref.isValid()) return null;
  return { slot, steamId: client.steamId, name: player.playerName ?? client.name, team: player.teamNum ?? 0,
    alive: player.pawnIsAlive === true, bot: client.isBot, location: player.pawn?.lastPlaceName ?? '',
    valid: () => client.isValid() && player.ref.isValid(), send: text => client.chat(text) };
}
const policy = createChatPolicy(() => settings, {
  at: actor, all: () => Clients.all().map(c => actor(c.slot)).filter((p): p is ChatPlayer => p !== null),
  flags: (slot, mask) => Admin.forSlot(slot)?.hasFlags(mask) ?? false,
  now: () => Date.now(), tick: () => Server.tickCount, live, color, phrase,
  nativeAudience(sender, receiver, teamOnly) {
    const from = actor(sender), to = actor(receiver);
    if (!from || !to || teamOnly && from.team !== to.team) return false;
    return sender === receiver || !live() || from.alive || !to.alive || Server.getCvar('sv_allchat') === '1';
  },
});
const effects = createEffects(() => settings, ownsKillfeed);
const legs = createLegs(() => settings.hud.legs);
function readConfig(): DecluttrConfig {
  let text = config.readFile(CONFIG_FILE);
  if (text === null) { text = JSON.stringify(DEFAULT_CONFIG, null, 2) + '\n'; config.writeFile(CONFIG_FILE, text); }
  return parseConfig(JSON.parse(text));
}
function restoreNames(): void {
  for (const { client, original, applied } of managedNames.values()) {
    const player = client.isValid() ? Player.fromSlot(client.slot) : null;
    if (player?.playerName === applied) player.setName(original);
  }
  managedNames.clear();
}
function reconcileNames(): void {
  if (!settings.chat.advertising.names) { restoreNames(); return; }
  for (const client of Clients.all()) if (client.isValid()) pendingNames.set(client.slot, client);
}
function updateNames(): void {
  for (const [slot, client] of pendingNames) {
    pendingNames.delete(slot);
    const player = client.isValid() ? Player.fromSlot(slot) : null;
    if (!player?.ref.isValid()) continue;
    const current = player.playerName ?? '', owned = managedNames.get(slot);
    // Retain the desired name while we still own its effective replacement.
    const desired = owned?.client.isValid() && current === owned.applied ? owned.original : current;
    const name = policy.sanitizeName(slot, desired);
    if (name !== current && player.setName(name) && client.isValid()) managedNames.set(slot, { client, original: desired, applied: name });
    else if (name === desired) managedNames.delete(slot);
  }
}
function reload(cmd: CommandInvocation) {
  if (cmd.callerSlot >= 0 && !Admin.forSlot(cmd.callerSlot)?.hasFlags(flagMask(settings.reloadFlags))) {
    reply(cmd, 'no_permission'); return HookResult.Handled;
  }
  try {
    const next = readConfig(); // Validate every field before changing the working configuration.
    settings = next; effects.apply(); legs.update(); reconcileNames();
    published.emit('OnConfigChanged', { revision: ++revision }); reply(cmd, 'reload_ok');
  } catch (error) { console.log(`[Decluttr] Config reload failed: ${String(error)}`); reply(cmd, 'reload_failed'); }
  return HookResult.Handled;
}
export function OnPluginStart(): void {
  settings = readConfig(); loadPhrases(); scope = createScope(); legs.start(); effects.register(); effects.apply();
  command('sm_legs', cmd => {
    const client = Clients.fromSlot(cmd.callerSlot); if (!client?.isValid()) return HookResult.Handled;
    if (!settings.hud.legs) reply(cmd, 'legs_disabled');
    else { reply(cmd, legs.toggle(client) ? 'legs_hidden' : 'legs_visible'); if (legs.pending(client.slot)) reply(cmd, 'save_pending'); }
    return HookResult.Handled;
  });
  command('sm_decluttr_reload', reload);
  watchOptional('@edgegamers/jailbreak-specialdays', (service, attachment) => {
      specialDays = service; attachment.own({ dispose() { if (specialDays === service) specialDays = null; } });
    });
  published = publish('@edgegamers/decluttr', {
    checkChat: policy.checkChat, relayChat: policy.relayChat, formatChat: policy.formatChat, canReadChat: policy.canReadChat,
    sanitizeName: policy.sanitizeName, filterKillfeed: effects.filterKillfeed,
  });
  scope.clients.onSay((slot, text, teamOnly) => {
    if (tttOwnsChat()) return;
    if (!policy.checkChat(slot, text)) return HookResult.Handled;
    return policy.relayChat(slot, text, teamOnly);
  });
  chat.onCanHear(view => {
    if (tttOwnsChat() || !view.sender || !view.receiver) return;
    const allowed = policy.canReadChat(view.sender.slot, view.receiver.slot, view.teamOnly,
      view.sender.pawnIsAlive === true, view.receiver.pawnIsAlive === true, live());
    if (allowed !== null) { view.canHear = allowed; return HookResult.Handled; }
  });
  // Registered !commands run before onSay. Filter only genuine native player-chat echoes;
  // plugin replies have chat=false and no Valve player-chat localization token.
  UserMessages.onPre('CUserMessageSayText2', message => {
    if (message.readBool('chat') !== true || !(message.readString('messagename') ?? '').startsWith('#Cstrike_Chat_')) return;
    const text = message.readString('param2'); if (text === null) return;
    const slot = (message.readInt('entityindex') ?? 0) - 1;
    if (!policy.checkChat(slot, text)) return HookResult.Handled;
  });
  scope.events.on('round_start', () => { roundEnded = false; });
  scope.events.on('round_end', () => { roundEnded = true; });
  scope.events.on('player_team', event => policy.event('teamJoin', event.getPlayerSlot('userid')));
  scope.events.on('grenade_thrown', event => policy.event('grenade', event.getPlayerSlot('userid'), { grenade: event.getString('weapon') }));
  scope.events.onPre('player_changename', event => {
    const client = Clients.fromSlot(event.getPlayerSlot('userid'));
    if (client?.isValid()) pendingNames.set(client.slot, client);
  });
  scope.server.onGameFrame(() => { if (mapActive) { legs.update(); updateNames(); } }, { phase: 'post' });
  reconcileNames();
}
export function OnClientPutInServer(client: Client): void { legs.join(client); pendingNames.set(client.slot, client); }
export function OnClientCookiesCached(client: Client): void { legs.cached(client); }
export function OnClientDisconnect(client: Client): void {
  policy.forget(client.steamId);
  if (!managedNames.get(client.slot)?.client.isValid()) managedNames.delete(client.slot);
  if (!pendingNames.get(client.slot)?.isValid()) pendingNames.delete(client.slot);
}
export function OnMapEnd(): void { mapActive = false; effects.reset(); legs.reset(); policy.reset(); pendingNames.clear(); }
export function OnMapStart(): void { mapActive = true; roundEnded = false; effects.apply(); legs.update(); reconcileNames(); }
export function OnPluginEnd(): void {
  effects.dispose(); legs.dispose(); restoreNames(); policy.reset(); scope?.dispose(); UserMessages.off('CUserMessageSayText2');
}
