import assert from "node:assert/strict";
import vm from "node:vm";
import { buildSync } from "esbuild";

const source = buildSync({
  entryPoints: [new URL("../src/plugin.ts", import.meta.url).pathname],
  bundle: true, write: false, platform: "node", format: "cjs", external: ["@s2script/*"],
}).outputFiles[0].text;

export function fixture(options = {}) {
  const commands = new Map(), players = new Map(), targets = new Map(), menu = new Map();
  const messages = [], menus = [], sets = new Map(), dispatches = [];
  const replies = [], targetCalls = [], frames = [], events = [];
  let serial = 1, frameFails = false;
  const ref = valid => ({ index: serial, id: serial++, isValid: valid });
  const command = (name, handler) => commands.set(name, { flags: 0, handler });
  command.admin = (name, flags, handler) => commands.set(name, { flags, handler });
  const sdk = {
    command,
    Clients: { fromSlot: slot => players.get(slot)?.client ?? null },
    ADMFLAG: { SLAY: 32, CHEATS: 8192, KICK: 4, ROOT: 16384 }, HookResult: { Handled: 2 },
    topmenu: { addTab() {}, addCategory() {}, addItem: (category, item) => menu.set(item.id, { ...item, category }) },
    Admin: { forSlot: slot => ({ hasFlags: flags => !!(players.get(slot)?.flags & 16384) || (players.get(slot)?.flags & flags) === flags }),
      canTarget: (_caller, target) => !players.get(target)?.immune },
    MenuStyle: { Center: "center" },
    Menu: class {
      constructor(title) { this.title = title; this.items = []; menus.push(this); }
      addItem(info, display, opts) { this.items.push({ info, display, ...opts }); }
      onSelect(fn) { this.select = fn; }
      onCancel(fn) { this.cancel = fn; }
      display(slot) { this.slot = slot; }
      close() { this.closed = true; }
      pick(info) { this.select({ slot: this.slot, info }); }
    },
    Commands: { dispatch(name, slot, argString, source) {
      dispatches.push({ name, slot, argString, source });
      const entry = commands.get(name), p = players.get(slot);
      if (!entry) return false;
      if (entry.flags && !(p?.flags & 16384) && (p?.flags & entry.flags) !== entry.flags) return false;
      call(name, argString.split(" ").filter(Boolean), slot, source);
      return true;
    } },
    Translations: {
      load(name, seed) { sets.set(name, seed); },
      translate(slot, key, ...args) {
        replies.push([key, ...args]);
        const locale = options.locales?.[players.get(slot)?.language];
        const template = locale?.[key] ?? [...sets.values()].find(set => key in set)?.[key] ?? key;
        return template.replace(/\{(\d+)\}/g, (_, n) => String(args[Number(n) - 1] ?? "").replace(/[{}]/g, ""));
      },
    },
    nextFrame: () => frameFails ? Promise.reject(new Error("AsyncQueueFull")) : new Promise(resolve => frames.push(resolve)),
  };
  const cs2 = {
    ChatColors: { Blue: "\x0b", Red: "\x07", Grey: "\x08", Yellow: "\x09" },
    CsItem: { AK47: "weapon_ak47", M4A1S: "weapon_m4a1_silencer", USPS: "weapon_usp_silencer", HighExplosive: "weapon_hegrenade", Kevlar: "item_kevlar" },
    Player: {
      // Legacy fromSlot may omit pawnless controllers; admin targets/allConnected include them.
      fromUserId: id => [...players.values()].find(p => p.userId === id) ?? null,
      fromSlot: slot => players.get(slot)?.pawn ? players.get(slot) : null,
      allConnected: () => [...players.values()],
      target(pattern, callerSlot, filterImmunity) {
        targetCalls.push({ pattern, callerSlot, filterImmunity });
        const selected = targets.get(pattern) ?? [...players.values()].filter(p => `#${p.userId}` === pattern);
        return selected.filter(p => !filterImmunity || !p.immune);
      },
    },
    movement: { onProcessMove() {} },
    Events: { on() {}, fire: (...args) => events.push(args) }, pickPlayer() {},
  };
  const context = vm.createContext({ module: { exports: {} }, console, require(name) {
    if (name === "@s2script/sdk") return sdk;
    if (name === "@s2script/cs2") return cs2;
    throw new Error(`Unexpected import ${name}`);
  } });
  vm.runInContext(source, context);
  const api = context.module.exports;
  api.OnPluginStart?.();
  function pawn(p, health = 100) {
    const body = {
      health, armorValue: 0, valid: true, origin: { x: 10, y: 20, z: 30 }, eyeAngles: { x: 4, y: 5, z: 6 },
      hasDeathInfo: true, deathInfoOrigin: { x: 40, y: 50, z: 60 }, absVelocity: { x: 1, y: 2, z: 3 },
      weapons: [], teleports: [], gives: [], removes: [], giveFails: false,
      get isValid() { return this.valid; },
      setVelocity(x, y, z) { this.absVelocity = { x, y, z }; return true; },
      slay() { this.health = 0; },
      disarm() { if (this.disarmFails) return false; this.weapons = []; return true; },
      giveNamedItem(name) {
        this.gives.push(name);
        if (this.giveFails) return null;
        const gear = name.includes("usp") ? 1 : name.includes("grenade") ? 3 : 0;
        const given = weapon(gear); this.weapons.push(given);
        this.onGive?.(given);
        return given;
      },
      removeWeapon(w) {
        this.removes.push(w); if (w.removeFails) return false;
        this.weapons = this.weapons.filter(item => item !== w); w.valid = false;
        this.onRemove?.(w); return true;
      },
    };
    body.ref = ref(() => body.valid);
    body.ref.teleport = (pos, angles, velocity) => {
      if (!body.valid || body.teleportFails) return false;
      body.teleports.push([Array.from(pos), angles && Array.from(angles), Array.from(velocity)]);
      body.onTeleport?.(pos, angles, velocity);
      return true;
    };
    p.pawn = body;
    return body;
  }
  function weapon(gearSlot) {
    const item = { valid: true, data: { gearSlot }, isValid() { return this.valid; } };
    item.ref = ref(() => item.valid);
    return item;
  }
  function player(slot, health = 100) {
    const p = { flags: 16384, slot, userId: 100 + serial, steamId: `7656119800000000${slot}`, teamNum: 2, switches: [], respawns: 0,
      get pawnIsAlive() { return (this.pawn?.health ?? 0) > 0; },
      switchTeam(team) { this.switches.push(team); if (!this.switchFails) this.teamNum = team; this.onSwitch?.(); },
      respawn() {
        this.respawns++; if (this.respawnFails || this.pawnIsAlive) return false;
        if (this.pawn) this.pawn.valid = false;
        pawn(this); this.onRespawn?.(); return true;
      },
      setName(name) { this.playerName = name; return true; }, playerName: `player${slot}`,
    };
    p.ref = ref(() => players.get(slot) === p);
    p.client = { slot, get userId() { return players.get(slot) === p ? p.userId : -1; }, isValid: () => players.get(slot) === p };
    players.set(slot, p); pawn(p, health); targets.set(`#${slot}`, [p]);
    return p;
  }
  function call(name, args = [], callerSlot = -1, replySource = "console") {
    const entry = commands.get(name); assert.ok(entry, `${name} registered`);
    return entry.handler({ reply: text => messages.push({ slot: callerSlot, source: replySource, text }), replySource,
      callerSlot, args, arg: n => args[n] ?? "", argInt: (n, fallback) => parseInt(args[n], 10) || fallback,
      argsFrom: n => args.slice(n).join(" "), replyT: (...args) => replies.push(args) });
  }
  return { api, commands, players, replies, targetCalls, menu, menus, messages, sets, dispatches, events, player, pawn, weapon, call,
    targets(pattern, selected) { targets.set(pattern, selected); },
    openMenu(slot) { return menus.filter(m => m.slot === slot).at(-1); },
    failFrame() { frameFails = true; },
    async frame() { for (const resolve of frames.splice(0)) resolve(); await new Promise(resolve => setImmediate(resolve)); },
  };
}
