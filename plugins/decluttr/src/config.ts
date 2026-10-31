export interface DecluttrConfig {
  version: number;
  reloadFlags: string;
  radio: { players: boolean; bots: boolean; grenades: boolean; wheel: boolean; pings: 'off' | 'all' | 'sound' };
  messages: {
    map: { enabled: boolean; mode: 'all' | 'filter'; rules: { map: string; words: string[] }[] };
    teamJoin: boolean; disconnect: 'off' | 'text' | 'all';
    money: boolean; teamAttack: boolean; saved: boolean; chicken: boolean;
    bombPlanted: boolean; planting: boolean; defusing: boolean;
    custom: { enabled: boolean; text: string[]; hint: string[]; radio: string[] };
  };
  hud: { radar: boolean; killfeed: 'off' | 'all' | 'self'; teamTags: { mode: 'off' | 'all' | 'walls' | 'distance'; distance: number }; legs: boolean };
  sounds: {
    music: 'off' | 'mvp' | 'all'; footsteps: boolean; landing: boolean;
    knife: 'off' | 'all' | 'team'; knifeEvents: string[];
    gunshots: 'off' | 'mute' | 'm4' | 'usp' | 'custom';
    replacement: { weaponId: number; soundType: number; itemDefIndex: number };
    custom: { enabled: boolean; events: string[] };
  };
  chat: {
    hideCommands: boolean;
    advertising: { chat: boolean; names: boolean; ips: boolean; urls: boolean; allowedIps: string[]; allowedDomains: string[]; replacementName: string; notifyFlags: string; cooldownSeconds: number };
    dead: { enabled: boolean; readFlags: string };
    format: {
      enabled: boolean;
      templates: { public: string; team: string; dead: string; spectator: string; traitor: string };
      prefixes: { flags: string; text: string }[];
      teamJoin: { enabled: boolean; includeBots: boolean; template: string };
      grenade: { enabled: boolean; includeBots: boolean; template: string };
    };
  };
}

export const DEFAULT_CONFIG: DecluttrConfig = {
  version: 1, reloadFlags: 'z',
  radio: { players: false, bots: false, grenades: false, wheel: false, pings: 'off' },
  messages: {
    map: { enabled: false, mode: 'all', rules: [] }, teamJoin: false, disconnect: 'off',
    money: false, teamAttack: false, saved: false, chicken: false,
    bombPlanted: false, planting: false, defusing: false,
    custom: { enabled: false, text: [], hint: [], radio: [] },
  },
  hud: { radar: false, killfeed: 'off', teamTags: { mode: 'off', distance: 150 }, legs: false },
  sounds: {
    music: 'off', footsteps: false, landing: false, knife: 'off', knifeEvents: [],
    gunshots: 'off', replacement: { weaponId: 0, soundType: 9, itemDefIndex: 61 },
    custom: { enabled: false, events: [] },
  },
  chat: {
    hideCommands: false,
    advertising: { chat: false, names: false, ips: true, urls: true, allowedIps: [], allowedDomains: [], replacementName: 'Player', notifyFlags: 'b', cooldownSeconds: 10 },
    dead: { enabled: false, readFlags: 'b' },
    format: {
      enabled: false,
      templates: {
        public: '{prefix}{blue}{name}{grey}: {message}',
        team: '{grey}(TEAM) {prefix}{blue}{name}{grey}: {message}',
        dead: '{grey}*DEAD* {prefix}{blue}{name}{grey}: {message}',
        spectator: '{grey}*SPEC* {prefix}{blue}{name}{grey}: {message}',
        traitor: '{grey}(TRAITOR) {prefix}{blue}{name}{grey}: {message}',
      },
      prefixes: [],
      teamJoin: { enabled: false, includeBots: false, template: '{blue}Decluttr {grey}» {blue}{name}{grey} joined {yellow}{team}{grey}.' },
      grenade: { enabled: false, includeBots: false, template: '{blue}{name}{grey} » {yellow}{grenade}{grey} at {yellow}{location}{grey}.' },
    },
  },
};

export function flagMask(flags: string): number {
  if (!/^[a-tz]+$/.test(flags)) throw new Error('Permissions require SourceMod flag letters a–t or z');
  const alphabet = 'abcdefghijklmnzopqrst';
  return [...flags].reduce((mask, flag) => mask | (1 << alphabet.indexOf(flag)), 0);
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function merge(base: unknown, value: unknown, path: string): unknown {
  if (record(base)) {
    if (!record(value)) throw new Error(`${path} must be an object`);
    for (const key of Object.keys(value)) if (!Object.hasOwn(base, key)) throw new Error(`Unknown setting ${path}.${key}`);
    return Object.fromEntries(Object.entries(base).map(([key, fallback]) => [key,
      Object.hasOwn(value, key) ? merge(fallback, value[key], `${path}.${key}`) : structuredCopy(fallback)]));
  }
  if (Array.isArray(base)) {
    if (!Array.isArray(value)) throw new Error(`${path} must be an array`);
    return value.map(structuredCopy);
  }
  if (typeof base !== typeof value || typeof value === 'number' && !Number.isFinite(value)) throw new Error(`Invalid ${path}`);
  return value;
}
function structuredCopy(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(structuredCopy);
  if (record(value)) return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, structuredCopy(v)]));
  return value;
}
function strings(value: unknown): asserts value is string[] {
  if (!Array.isArray(value) || value.some(v => typeof v !== 'string' || !v.trim())) throw new Error('Filter lists require nonempty strings');
}
function oneOf(value: string, choices: string[]): void {
  if (!choices.includes(value)) throw new Error(`Invalid mode ${value}`);
}
const placeholders = new Set(['name', 'message', 'prefix', 'team', 'channel', 'location', 'grenade',
  'default', 'white', 'darkred', 'green', 'lightyellow', 'lightblue', 'olive', 'lime', 'red',
  'lightpurple', 'purple', 'grey', 'gray', 'yellow', 'gold', 'silver', 'blue', 'darkblue', 'bluegrey', 'magenta', 'lightred', 'orange']);
function template(value: string): void {
  if (!value || /[\x00-\x08\x0b-\x1f\x7f\r\n]/.test(value)) throw new Error('Templates require printable single-line text');
  for (const match of value.matchAll(/\{([^{}]+)\}/g)) if (!placeholders.has(match[1].toLowerCase())) throw new Error(`Unknown template placeholder ${match[0]}`);
}

export function parseConfig(input: unknown): DecluttrConfig {
  const c = merge(DEFAULT_CONFIG, input, 'Decluttr') as DecluttrConfig;
  if (c.version !== 1) throw new Error('Unsupported Decluttr config version');
  for (const flags of [c.reloadFlags, c.chat.advertising.notifyFlags, c.chat.dead.readFlags]) flagMask(flags);
  oneOf(c.radio.pings, ['off', 'all', 'sound']);
  oneOf(c.messages.map.mode, ['all', 'filter']); oneOf(c.messages.disconnect, ['off', 'text', 'all']);
  oneOf(c.hud.killfeed, ['off', 'all', 'self']); oneOf(c.hud.teamTags.mode, ['off', 'all', 'walls', 'distance']);
  oneOf(c.sounds.music, ['off', 'mvp', 'all']); oneOf(c.sounds.knife, ['off', 'all', 'team']);
  oneOf(c.sounds.gunshots, ['off', 'mute', 'm4', 'usp', 'custom']);
  if (c.hud.teamTags.distance < 0 || c.chat.advertising.cooldownSeconds < 0) throw new Error('Distance/cooldown must be nonnegative');
  const { weaponId, soundType, itemDefIndex } = c.sounds.replacement;
  for (const number of [weaponId, itemDefIndex]) if (!Number.isInteger(number) || number < 0 || number > 4294967295) throw new Error('Weapon IDs must be uint32');
  if (!Number.isInteger(soundType) || soundType < -2147483648 || soundType > 2147483647) throw new Error('Sound type must be int32');
  for (const list of [c.messages.custom.text, c.messages.custom.hint, c.messages.custom.radio,
    c.sounds.knifeEvents, c.sounds.custom.events, c.chat.advertising.allowedIps, c.chat.advertising.allowedDomains]) strings(list);
  for (const rule of c.messages.map.rules) {
    if (!record(rule) || Object.keys(rule).some(k => k !== 'map' && k !== 'words') || typeof rule.map !== 'string' || !rule.map) throw new Error('Invalid map filter rule');
    strings(rule.words);
  }
  for (const prefix of c.chat.format.prefixes) {
    if (!record(prefix) || Object.keys(prefix).some(k => k !== 'flags' && k !== 'text') || typeof prefix.flags !== 'string' || typeof prefix.text !== 'string') throw new Error('Invalid chat prefix');
    flagMask(prefix.flags); template(prefix.text);
  }
  for (const text of [...Object.values(c.chat.format.templates), c.chat.format.teamJoin.template, c.chat.format.grenade.template]) template(text);
  const name = c.chat.advertising.replacementName;
  if (!name.trim() || name.length > 64 || /[\x00-\x1f\x7f{}]/.test(name)) throw new Error('Invalid replacement name');
  return c;
}
