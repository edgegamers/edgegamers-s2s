import { buildSync } from 'esbuild';
import vm from 'node:vm';

const code = buildSync({
  entryPoints: ['src/plugin.ts'], bundle: true, write: false,
  platform: 'neutral', format: 'cjs', external: ['@s2script/*'],
}).outputFiles[0].text;

// Mirrors the CEntityInstance/CEntityIdentity offsets read in src/vscripts.ts.
const PRIVATE_VSCRIPTS = 0x08, IDENTITY = 0x10, NAME = 0x18, DESIGNER = 0x20;

class Vector {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
}

// Only the engine boundary is doubled. Tests execute the real bundled plugin.
export function fixture({ map = 'jb_arcade_b6', translations = {} } = {}) {
  const logs = [], inputs = [], damage = [], chat = [], center = [];
  const handlers = { create: [], spawn: [], remove: [], frame: [], mapStart: [], events: new Map(), inputs: [] };
  const players = new Map(), phrases = new Map();
  let timers = [], now = 0, serial = 1, layoutLie = false;

  const ptr = (target) => ({
    isNull: () => target === null || target === undefined || target === '',
    deref(offset) {
      if (target?.kind === 'instance') {
        if (offset === PRIVATE_VSCRIPTS) return ptr(target.ref.vscripts);
        if (offset === IDENTITY) return ptr({ kind: 'identity', ref: target.ref });
      }
      if (target?.kind === 'identity') {
        if (offset === NAME) return ptr(layoutLie ? 'garbage' : target.ref.name);
        if (offset === DESIGNER) return ptr(target.ref.className);
      }
      throw Error(`unexpected read at ${offset}`);
    },
    readString: () => String(target),
  });

  function entity(className, name = '', extra = {}) {
    const ref = {
      index: serial, id: serial++, className, name, vscripts: '', valid: true,
      origin: new Vector(), angles: new Vector(),
      isValid() { return this.valid; },
      acceptInput(input, value, activator, caller, delay) {
        inputs.push({ target: this, input, value, activator, caller, delay });
        if (input === 'KeyValue' && value?.startsWith('targetname ')) this.name = value.slice(11);
        return true;
      },
      teleport(origin, angles) {
        if (origin) this.origin = new Vector(...origin);
        if (angles) this.angles = new Vector(...angles);
      },
      takeDamage(amount, opts) { damage.push({ target: this, amount, ...opts }); return true; },
      remove() { this.valid = false; },
      ...extra,
    };
    return ref;
  }

  function spawn(className, name = '', extra = {}) {
    const ref = entity(className, name, extra);
    handlers.create.forEach((fn) => fn(ref, className));
    handlers.spawn.forEach((fn) => fn(ref, className));
    return ref;
  }

  function addPlayer(slot, { team = 2, origin = new Vector() } = {}) {
    const ref = spawn('player', '', { origin });
    const pawn = {
      ref, isValid: true, lifeState: 0, health: 100, teamNum: team, buttons: 0,
      get origin() { return ref.origin; }, eyeAngles: new Vector(),
      controller: null, aimTrace: () => null,
    };
    const player = { slot, teamNum: team, pawn, pawnIsAlive: true };
    pawn.controller = player;
    players.set(slot, player);
    return player;
  }

  const sdk = {
    Server: { get mapName() { return map; }, get gameTime() { return now / 1000; }, maxPlayers: 64 },
    Vector,
    createScope: () => ({
      server: { onMapStart: (fn) => handlers.mapStart.push(fn), onGameFrame: (fn) => handlers.frame.push(fn) },
      entities: {
        onCreate: (cls, fn) => handlers.create.push(fn),
        onSpawn: (cls, fn) => handlers.spawn.push(fn),
        onDelete: (cls, fn) => handlers.remove.push(fn),
      },
    }),
    hook: {
      on: (name, fn) => handlers.events.set(name, fn),
      onPre: (name, fn) => handlers.events.set(name, fn),
    },
    onInput: (cls, input, fn) => handlers.inputs.push({ cls, input, fn }),
    after(ms, fn) {
      const timer = { at: now + ms, fn, alive: true, kill() { const was = this.alive; this.alive = false; return was; } };
      timers.push(timer);
      return timer;
    },
    every() { throw Error('unexpected repeating timer'); },
    createEntity: (className) => entity(className),
    Chat: { toAll: (text) => chat.push(text), toSlot: (slot, text) => chat.push({ slot, text }) },
    Clients: { all: () => [...players.values()] },
    Translations: { load: (_name, seed) => { for (const [k, v] of Object.entries(seed)) phrases.set(k, v); },
      translate: (slot, key, ...args) => (translations[slot]?.[key] ?? phrases.get(key) ?? key)
        .replace(/\{(\d+)\}/g, (_, n) => String(args[Number(n) - 1] ?? '')) },
    Ptr: { from: (ref) => (ref.isValid() ? ptr({ kind: 'instance', ref }) : null) },
  };
  const cs2 = {
    Player: { all: () => [...players.values()], fromSlot: (slot) => players.get(slot) ?? null },
    CenterHtml: { to: (slot, html, seconds) => center.push({ slot, html, seconds }) },
    ChatColors: { Default: '\x01', White: '\x01', DarkRed: '\x02', LightPurple: '\x03', Green: '\x04', Olive: '\x05', Lime: '\x06', Red: '\x07', Grey: '\x08', Yellow: '\x09', Silver: '\x0a', Blue: '\x0b', DarkBlue: '\x0c', BlueGrey: '\x0d', Purple: '\x0e', LightRed: '\x0f', Orange: '\x10' },
    sceneNodeOf: (ref) => ({ absRotation: ref.angles }),
    wrapEntity: (cls, ref) => ref,
  };

  const module = { exports: {} };
  const context = vm.createContext({
    module, exports: module.exports,
    require: (name) => {
      if (name === '@s2script/cs2') return cs2;
      if (name === '@s2script/sdk' || name === '@s2script/sdk/unsafe') return sdk;
      throw Error(`unexpected runtime dependency ${name}`);
    },
    console: { log: (...a) => logs.push(a.join(' ')), warn: (...a) => logs.push(a.join(' ')), error: (...a) => logs.push(a.join(' ')) },
    Math,
  });
  vm.runInContext(code, context);
  const api = module.exports;

  return {
    api, logs, inputs, damage, chat, center, players,
    spawn, addPlayer,
    start() { api.OnPluginStart(); },
    /** A logic_script whose `vscripts` keyvalue names `vscript`. */
    script(name, vscript) { return spawn('logic_script', name, { vscripts: vscript }); },
    event(name, ev = {}) { handlers.events.get(name)?.(ev); },
    round() { this.event('round_prestart'); this.event('round_start'); },
    run(target, code, activator = null, caller = null) {
      for (const h of handlers.inputs) {
        if (h.cls === target.className && h.input.toLowerCase() === 'runscriptcode') {
          h.fn({ input: 'RunScriptCode', entity: target, activator, caller, value: code });
        }
      }
    },
    remove(ref) { handlers.remove.forEach((fn) => fn(ref, ref.className)); ref.valid = false; },
    advance(ms) {
      const end = now + ms;
      for (;;) {
        const next = timers.filter((t) => t.alive && t.at <= end).sort((a, b) => a.at - b.at)[0];
        if (!next) break;
        now = next.at;
        next.alive = false;
        next.fn();
      }
      now = end;
      timers = timers.filter((t) => t.alive);
    },
    frame() { handlers.frame.forEach((fn) => fn()); },
    messages(target) { return inputs.filter((i) => i.target === target && i.input === 'SetMessage').map((i) => i.value); },
    set layoutLie(value) { layoutLie = value; },
    get liveTimers() { return timers.filter((t) => t.alive).length; },
  };
}
