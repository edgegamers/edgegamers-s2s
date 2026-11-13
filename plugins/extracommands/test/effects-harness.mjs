import assert from "node:assert/strict";
import vm from "node:vm";
import { buildSync } from "esbuild";
import { chatColors } from "./chat-colors.mjs";

// Exercise the real registrations and effect manager, replacing only host-injected operations.
const source = buildSync({ entryPoints: [new URL("../src/plugin.ts", import.meta.url).pathname], bundle: true,
  platform: "node", format: "cjs", external: ["@s2script/*"], write: false }).outputFiles[0].text;

export function fixture() {
  const commands = new Map(), players = new Map(), timers = new Set(), replies = [], targetsCalled = [];
  const fades = [], teleports = [], beams = [], events = new Map(), moves = [], activities = [], logs = [];
  let targets = [], now = 0, identity = 0, failBeamAt = -1, failFade = false, onFade, onBeam, failTimer = false;
  const timer = (ms, fn, repeat) => {
    if (failTimer) throw Error("AsyncQueueFull");
    const t = { alive: true, due: now + ms, ms, fn, repeat, kill() { const was = this.alive; this.alive = false; timers.delete(this); return was; } };
    timers.add(t); return t;
  };
  const command = (name, handler) => commands.set(name, { flags: 0, handler });
  command.admin = (name, flags, handler) => commands.set(name, { flags, handler });
  const sdk = {
    command, topmenu: { addTab() {}, addCategory() {}, addItem() {} },
    Activity: {
      showT(actor, key, ...args) { activities.push({ actor, key, args }); replies.push([key, ...args]); },
      describe(actor) { return `actor<${typeof actor === "number" ? actor : actor.callerSlot}>`; },
      log(actor, target, message) { logs.push({ actor, target, message }); },
    },
    Translations: { load() {}, translate: (_slot, key, ...args) => { replies.push([key, ...args]); return key; } }, ADMFLAG: { SLAY: 32, CHEATS: 8192, KICK: 4 }, HookResult: { Handled: 2 },
    Clients: { fromSlot: slot => players.get(slot)?.client ?? null },
    every: (ms, fn) => timer(ms, fn, true), after: (ms, fn) => timer(ms, fn, false),
    delay: ms => new Promise(resolve => timer(ms, resolve, false)),
    Vector: class { constructor(x, y, z) { Object.assign(this, { x, y, z }); } },
  };
  const cs2 = {
    ChatColors: chatColors,
    CsItem: { AK47: "weapon_ak47" },
    Player: { allConnected: () => [...players.values()], fromSlot: slot => players.get(slot)?.pawn ? players.get(slot) : null,
      fromUserId: uid => [...players.values()].find(p => p.userId === uid) ?? null,
      target(pattern, caller, immunity) { targetsCalled.push([pattern, caller, immunity]); return targets; } },
    Pawn: { forSlot: slot => players.get(slot)?.pawn ?? null },
    Fade: { to(slot, opts) { fades.push([slot, structuredClone(opts)]); onFade?.(); return !failFade; }, blind: () => true },
    Beam: { draw(start, end, opts) {
      if (beams.length === failBeamAt) return null;
      const b = { start: structuredClone(start), end: structuredClone(end), opts, removed: false,
        updates: 0, update(a, z) { this.start = structuredClone(a); this.end = structuredClone(z); this.updates++; },
        remove() { const was = !this.removed; this.removed = true; return was; } };
      beams.push(b); onBeam?.(); return b;
    } },
    Events: { on: (name, handler) => events.set(name, handler) },
    movement: { onProcessMove: fn => moves.push(fn) },
  };
  const context = vm.createContext({ module: { exports: {} }, console, require(name) {
    if (name === "@s2script/sdk") return sdk;
    if (name === "@s2script/cs2") return cs2;
    throw Error(name);
  } });
  vm.runInContext(source, context);
  const api = context.module.exports; api.OnPluginStart?.();
  const addPawn = (p, props = {}) => {
    const pawn = { ref: { index: 100 + p.slot, id: ++identity, teleport(origin, angles, velocity) {
      teleports.push({ pawn, origin: structuredClone(origin), angles: structuredClone(angles), velocity: structuredClone(velocity) });
      if (!pawn.failTeleport && angles) pawn.eyeAngles = { x: angles[0], y: angles[1], z: angles[2] };
      return !pawn.failTeleport;
    } }, isValid: true, lifeState: 0, health: 100, takesDamage: true, velocityModifier: 1, moveType: 2,
    origin: { x: 10, y: 20, z: 30 }, eyeAngles: { x: 11, y: 22, z: 7 }, movementServices: { maxspeed: 250 }, maxSpeed: 250,
    scales: [], setModelScale(scale) { if (this.failScale) return false; this.scales.push(scale); return true; }, ...props };
    p.pawn = pawn; return pawn;
  };
  const addPlayer = (slot = 1, props = {}) => {
    const p = { slot, userId: ++identity, ref: { index: slot + 1, id: ++identity }, steamId: "0", ...props };
    p.client = { slot, userId: p.userId, isValid: () => players.get(slot) === p };
    players.set(slot, p); addPawn(p); return p;
  };
  return { api, players, commands, timers, replies, targetsCalled, fades, teleports, beams, activities, logs, addPlayer, addPawn,
    setTargets: list => targets = list,
    failBeams: index => failBeamAt = index, failFades: () => failFade = true, failTimers: () => failTimer = true,
    onFade: fn => onFade = fn, onBeam: fn => onBeam = fn,
    call(name, args = [], callerSlot = -1) {
      assert.ok(commands.has(name), `${name} must be registered`);
      return commands.get(name).handler({ reply() {}, replySource: "console", callerSlot, args, arg: i => args[i] ?? "", argFloat: (i, fallback) => parseFloat(args[i] ?? fallback), replyT: (...a) => replies.push(a) });
    },
    move(p) { for (const fn of moves) fn({ player: p }); },
    event(name, slot) { events.get(name)?.({ getPlayerSlot: () => slot }); },
    tick(ms) {
      const end = now + ms;
      while (true) {
        const t = [...timers].filter(t => t.alive && t.due <= end).sort((a, b) => a.due - b.due)[0];
        if (!t) break;
        now = t.due;
        if (!t.repeat) t.kill();
        t.fn();
        if (t.alive) t.due = now + t.ms;
      }
      now = end;
    },
  };
}
