import { DEFAULT_CONFIG, flagMask, type DecluttrConfig } from './config';
const chatFormats = {
  public: 'decluttr.chat.public', team: 'decluttr.chat.team', dead: 'decluttr.chat.dead',
  spectator: 'decluttr.chat.spectator', traitor: 'decluttr.chat.traitor',
};
const eventFormats = { teamJoin: 'decluttr.announcements.team_join', grenade: 'decluttr.announcements.grenade' };
const channelPhrases: Readonly<Record<string, string>> = {
  normal: 'decluttr.channels.normal', public: 'decluttr.channels.public', team: 'decluttr.channels.team',
  dead: 'decluttr.channels.dead', spectator: 'decluttr.channels.spectator', traitor: 'decluttr.channels.traitor',
  teamJoin: 'decluttr.channels.team_join', grenade: 'decluttr.channels.grenade',
};
export interface ChatPlayer {
  slot: number; steamId: string; name: string; team: number; alive: boolean; bot: boolean; location: string;
  /** A dead pawn exists; a pawnless spectator is not marked dead. */
  dead?: boolean;
  valid(): boolean;
  send(text: string): void;
}
export interface ChatEnvironment {
  at(slot: number): ChatPlayer | null;
  all(): ChatPlayer[];
  flags(slot: number, mask: number): boolean;
  now(): number; tick(): number; live(): boolean;
  color(text: string): string;
  phrase(slot: number, key: string, ...args: string[]): string;
  nativeAudience?(sender: number, receiver: number, teamOnly: boolean): boolean;
}
// Player text must never become a template or a native chat color escape.
export function safeText(text: string): string {
  return text.replace(/[\x00-\x1f\x7f]/g, '').replaceAll('{', '｛').replaceAll('}', '｝');
}
function hasAdvertising(text: string, c: DecluttrConfig['chat']['advertising']): boolean {
  const ips = text.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g) ?? [];
  if (c.ips && ips.some(ip => ip.split('.').every(n => +n <= 255) && !c.allowedIps.includes(ip))) return true;
  if (!c.urls) return false;
  const domains = text.toLowerCase().match(/\b(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}\b/g) ?? [];
  return domains.some(host => !c.allowedDomains.some(value => {
    const allowed = value.toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');
    return host === allowed || host.endsWith(`.${allowed}`);
  }));
}
export function createChatPolicy(config: () => DecluttrConfig, env: ChatEnvironment) {
  const alerts = new Map<string, number>();
  const rejected = new Map<string, { tick: number; text: string }>();
  function warn(player: ChatPlayer, text: string, kind: 'chat' | 'name'): void {
    if (!player.valid()) return;
    const id = player.steamId || `bot:${player.slot}`, key = `${id}:${kind}`;
    const last = rejected.get(key), tick = env.tick();
    if (last?.tick === tick && last.text === text) return;
    rejected.set(key, { tick, text });
    if (kind === 'chat') player.send(env.phrase(player.slot, 'decluttr.advertising.blocked'));
    const c = config().chat.advertising, now = env.now();
    if (now - (alerts.get(id) ?? -Infinity) < c.cooldownSeconds * 1000) return;
    alerts.set(id, now);
    for (const staff of env.all()) {
      if (!player.valid()) break;
      if (staff.valid() && env.flags(staff.slot, flagMask(c.notifyFlags)))
        staff.send(env.phrase(staff.slot, 'decluttr.advertising.alert', safeText(player.name), safeText(player.steamId), safeText(text)));
    }
  }
  function checkChat(slot: number, text: string): boolean {
    const c = config().chat;
    if (c.hideCommands && /^\s*[!/]/.test(text)) return false;
    if (!c.advertising.chat || !hasAdvertising(text, c.advertising)) return true;
    const p = env.at(slot); if (p) warn(p, text, 'chat');
    return false;
  }
  function sanitizeName(slot: number, name: string): string {
    const c = config().chat.advertising;
    if (!c.names || !hasAdvertising(name, c)) return name;
    const p = env.at(slot); if (p) warn(p, name, 'name');
    return c.replacementName;
  }
  function canReadChat(sender: number, receiver: number, teamOnly: boolean, senderAlive: boolean, receiverAlive: boolean, live: boolean): boolean | null {
    const c = config().chat.dead;
    if (!c.enabled) return null;
    const from = env.at(sender), to = env.at(receiver);
    if (!from?.valid() || !to?.valid()) return false;
    if (teamOnly && from.team !== to.team) return false;
    return sender === receiver || !live || senderAlive && from.team > 1 || !receiverAlive || to.team <= 1 || env.flags(receiver, flagMask(c.readFlags));
  }
  function render(template: string, p: ChatPlayer, text: string, channel: string, recipient: number, extra: Record<string, string> = {}): string {
    const prefix = config().chat.format.prefixes.find(rule => env.flags(p.slot, flagMask(rule.flags)))?.text ?? '';
    const values: Record<string, string> = { name: safeText(p.name), message: safeText(text), prefix,
      team: env.phrase(recipient, p.team === 2 ? 'decluttr.teams.terrorists' : p.team === 3 ? 'decluttr.teams.counter_terrorists' : 'decluttr.teams.spectators'),
      channel: Object.hasOwn(channelPhrases, channel) ? env.phrase(recipient, channelPhrases[channel]) : safeText(channel),
      location: safeText(p.location), grenade: '',
      dead: '', team_chat: '', ...extra };
    return env.color(template.replace(/\{(name|message|prefix|team|channel|location|grenade|dead|team_chat)\}/g, (_, key: string) => values[key]));
  }
  function formatChat(slot: number, text: string, teamOnly: boolean, recipient: number, channel: string): string | null {
    const c = config().chat.format, p = env.at(slot);
    if (!c.enabled || !p?.valid()) return null;
    const kind = channel === 'traitor' || channel === 'dead' || channel === 'spectator' ? channel : teamOnly ? 'team' : 'public';
    const template = c.templates[kind] === DEFAULT_CONFIG.chat.format.templates[kind]
      ? env.phrase(recipient, chatFormats[kind]) : c.templates[kind];
    return render(template, p, text, channel, recipient, {
      dead: channel === 'dead' || (p.dead ?? !p.alive) ? env.phrase(recipient, 'decluttr.chat.dead_marker') : '',
      team_chat: teamOnly ? env.phrase(recipient, p.team === 2 ? 'decluttr.chat.team_marker_t' : p.team === 3 ? 'decluttr.chat.team_marker_ct'
        : p.team === 1 ? 'decluttr.chat.team_marker_spectator' : 'decluttr.chat.team_marker_unassigned') : '',
    });
  }
  function relayChat(slot: number, text: string, teamOnly: boolean): 0 | 2 {
    if (!config().chat.format.enabled) return 0;
    const from = env.at(slot); if (!from?.valid()) return 2;
    const channel = from.team <= 1 ? 'spectator' : (from.dead ?? !from.alive) ? 'dead' : 'normal';
    for (const to of env.all()) {
      if (!from.valid()) break;
      if (!to.valid()) continue;
      const allowed = canReadChat(slot, to.slot, teamOnly, from.alive, to.alive, env.live());
      if (!(allowed ?? (env.nativeAudience?.(slot, to.slot, teamOnly) ?? (!teamOnly || from.team === to.team)))) continue;
      const line = formatChat(slot, text, teamOnly, to.slot, channel);
      if (line !== null && from.valid() && to.valid()) to.send(line);
    }
    return 2;
  }
  function event(kind: 'teamJoin' | 'grenade', slot: number, extra: Record<string, string> = {}): void {
    const c = config().chat.format[kind], p = env.at(slot);
    if (!c.enabled || !p?.valid() || p.bot && !c.includeBots) return;
    const safe = Object.fromEntries(Object.entries(extra).map(([key, value]) => [key, safeText(value)]));
    for (const to of env.all()) {
      if (!p.valid()) break;
      if (!to.valid() || kind === 'grenade' && p.team !== to.team) continue;
      const template = c.template === DEFAULT_CONFIG.chat.format[kind].template
        ? env.phrase(to.slot, eventFormats[kind]) : c.template;
      to.send(render(template, p, '', kind, to.slot, safe));
    }
  }
  function forget(steamId: string): void {
    alerts.delete(steamId); rejected.delete(`${steamId}:chat`); rejected.delete(`${steamId}:name`);
  }
  return { checkChat, sanitizeName, canReadChat, formatChat, relayChat, event, forget,
    reset() { alerts.clear(); rejected.clear(); } };
}
