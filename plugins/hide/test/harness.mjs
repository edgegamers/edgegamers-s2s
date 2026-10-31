import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { buildSync } from 'esbuild';

const code = buildSync({
  entryPoints: ['src/plugin.ts'], bundle: true, write: false,
  platform: 'neutral', format: 'cjs', external: ['@s2script/*'],
}).outputFiles[0].text;

// Only the engine boundary is doubled. Tests execute the real bundled plugin.
export function fixture(options = {}) {
  const clients = new Map(), players = new Map(), commands = new Map();
  const rules = new Map(), writes = [], messages = [], logs = [], frames = [];
  const disk = options.disk ?? new Map();
  const definitions = new Map(), phraseSets = new Map();
  let configText = options.config === undefined ? null : JSON.stringify(options.config);
  let admission = true, transmitAvailable = true, now = 0, serial = 100;
  let ruleWrites = 0;
  let schemaWraps = 0;
  const key = ref => `${ref.index}:${ref.id}`;
  const command = (name, handler) => {
    assert.ok(!commands.has(name), `duplicate command ${name}`);
    commands.set(name, { handler, flags: 0 });
  };
  command.admin = (name, flags, handler) => {
    assert.ok(!commands.has(name), `duplicate command ${name}`);
    commands.set(name, { handler, flags });
  };
  const sdk = {
    command, ADMFLAG: { ROOT: 16384 }, HookResult: { Handled: 2 },
    config: {
      readFile(name) { assert.equal(name, 'HidePlayers.json'); return configText; },
      writeFile(name, content) { assert.equal(name, 'HidePlayers.json'); configText = content; },
    },
    Clients: { all: () => [...clients.values()], fromSlot: slot => clients.get(slot) ?? null },
    CookieAccess: { Public: 0 },
    Cookies: {
      register(name, opts) { const c = { name, ...opts }; definitions.set(name, c); return c; },
      get(c, cookie) { return c.cache.get(cookie.name) ?? cookie.default ?? ''; },
      areCached: c => c.cached,
      set(c, cookie, value) {
        assert.ok(c.isValid(), 'cannot write a disconnected connection');
        writes.push({ steamId: c.steamId, name: cookie.name, value, accepted: admission });
        if (!admission || c.isBot || c.steamId === '0') return false;
        c.cache.set(cookie.name, value);
        c.dirty.add(cookie.name);
        disk.set(`${c.steamId}:${cookie.name}`, value);
        return true;
      },
    },
    Transmit: {
      setVisibleTo(ref, viewers) {
        ruleWrites++;
        if (!transmitAvailable || !ref.isValid()) return false;
        assert.ok(viewers.every(slot => slot >= 0 && slot < 64));
        rules.set(key(ref), [...viewers]); return true;
      },
      reset(ref) { rules.delete(key(ref)); return ref.isValid(); },
      resetAll() { rules.clear(); },
    },
    createScope: () => ({ server: { onGameFrame(fn, opts) {
      assert.equal(opts?.phase, 'post'); frames.push(fn);
    } } }),
    Translations: {
      load(name, seed) { phraseSets.set(name, { ...seed }); },
      translate(slot, name, ...args) {
        for (const [set, seed] of phraseSets) {
          let phrases = seed;
          if (clients.get(slot)?.language === 'ru') {
            phrases = { ...seed, ...JSON.parse(readFileSync(`translations/ru/${set}.phrases.json`, 'utf8')) };
          }
          if (name in phrases) return phrases[name].replace(/\{(\d+)\}/g, (_, n) => String(args[Number(n) - 1] ?? '').replace(/[{}]/g, ''));
        }
        return name;
      },
    },
  };
  const cs2 = {
    Player: { allConnected: () => [...players.values()] },
    PlayerConnectedState: { Connected: 0 },
    CSPlayerState: { STATE_OBSERVER_MODE: 6 },
    wrapEntity(className, ref) {
      schemaWraps++;
      if (className === 'CBasePlayerController') return { get pawn() { return ref.currentPawn; } };
      if (className === 'CCSPlayerPawnBase') return ref;
      throw Error(`unexpected schema ${className}`);
    },
  };
  const module = { exports: {} };
  const context = vm.createContext({
    module, exports: module.exports,
    require: name => {
      if (name === '@s2script/cs2') return cs2;
      if (name === '@s2script/sdk' || name.startsWith('@s2script/sdk/')) return sdk;
      throw Error(`unexpected runtime dependency ${name}`);
    },
    console: { log: (...args) => logs.push(args.join(' ')), warn: (...args) => logs.push(args.join(' ')), error: (...args) => logs.push(args.join(' ')) },
    Date: class extends Date { static now() { return now; } },
  });
  vm.runInContext(code, context);
  const api = module.exports;
  function entity(index) {
    return { index, id: serial++, valid: true, playerState: 0, isValid() { return this.valid; } };
  }
  function add(slot, opts = {}) {
    const c = {
      slot, steamId: opts.steamId ?? String(765000 + slot), isBot: opts.bot ?? false,
      userId: serial++, signonState: 6, cached: opts.cached ?? true,
      cache: new Map(), dirty: new Set(), language: opts.language ?? 'en',
      isValid: () => clients.get(slot) === c,
      chat: text => messages.push({ slot, text }),
    };
    if (c.cached) c.cache.set('hide_player_status', opts.cookie ?? disk.get(`${c.steamId}:hide_player_status`) ?? '');
    clients.set(slot, c);
    const pawn = entity(100 + slot), controller = entity(slot + 1);
    controller.currentPawn = pawn;
    players.set(slot, { slot, teamNum: opts.team ?? 2, connected: 0, ref: controller, playerPawn: pawn });
    return c;
  }
  function invoke(name, slot = 0, root = false) {
    const entry = commands.get(name);
    assert.ok(entry, `command ${name} must be registered`);
    if (entry.flags && slot >= 0 && !root) return false;
    entry.handler({ callerSlot: slot, args: [], argString: '', argCount: 0,
      reply: text => messages.push({ slot, text }), replyToChat: text => messages.push({ slot, text }) });
    return true;
  }
  function frame(ms = 16) { now += ms; frames.forEach(fn => fn()); }
  function cache(slot, value) {
    const c = clients.get(slot);
    if (!c.dirty.has('hide_player_status')) c.cache.set('hide_player_status', value);
    c.cached = true;
    api.OnClientCookiesCached?.(c);
  }
  function disconnect(slot) {
    const c = clients.get(slot);
    const p = players.get(slot);
    clients.delete(slot); players.delete(slot);
    api.OnClientDisconnect?.(c);
    if (p?.playerPawn) p.playerPawn.valid = false;
  }
  return {
    api, clients, players, commands, rules, writes, messages, logs, disk, definitions,
    add, invoke, frame, cache, disconnect, entity,
    start() { api.OnPluginStart(); },
    hidden(target, viewer) { return rules.has(key(target)) && !rules.get(key(target)).includes(viewer); },
    setConfig(value) { configText = typeof value === 'string' ? value : JSON.stringify(value); },
    get config() { return JSON.parse(configText); },
    set admission(value) { admission = value; },
    set transmitAvailable(value) { transmitAvailable = value; },
    get ruleWrites() { return ruleWrites; },
    get schemaWraps() { return schemaWraps; },
  };
}
