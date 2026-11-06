import {configFixture} from '../../../packages/contracts/test/config-runtime.mjs';
import {SPECS} from '../src/settings-specs.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import {translationsVia,ChatColors as testChatColors} from '../../../packages/contracts/test/translations-double.mjs';
const dir = fileURLToPath(new URL('..', import.meta.url));
function fixture() {
  const result = buildSync({ entryPoints: [`${dir}/test/entry.ts`], bundle: true, write: false, format: 'cjs', platform: 'node', external: ['@s2script/*'] });
  const scores = [], bans = [], kicks = [], messages = [], commands = [];
  const ids = ['A','B','C']; const roles = [1,1,2]; const participating = [true,true,false];
  const settings = { karmaDefault: 50, karmaMin: 0, karmaTimeoutThreshold: 20, karmaRoundTimeout: 4, karmaWarningWindowMs: 86400000, karmaPerRound: 1, karmaPerRoundWin: 2 };
  const values = { sm_ttt_karma_inno_on_inno_guilty: -10, sm_ttt_karma_inno_on_inno_innocent: -2, sm_ttt_karma_inno_on_inno_victim_guilty: -3, sm_ttt_karma_inno_on_inno_victim_innocent: 4, sm_ttt_karma_inno_on_traitor: 5 };
  const state = { state: 2, winner: 1 }; let lowCommand = ''; let kickHook = () => {};
  const core = { activeSlots: () => [0,1,2], roleOf: s => roles[s], steamIdOf: s => ids[s] ?? '', isParticipating: s => participating[s], getGame: () => state, getKarmaSettings: () => settings, getNumber: n => values[n] ?? 0, formatKarmaWarning: n => `sit out ${n}` };
  const players = [0,1,2].map(slot => ({ userId: slot + 100, set score(value) { scores.push([slot,value]); }, kick(reason) { kicks.push([slot,reason]); kickHook(slot); } }));
  const configuration=configFixture(SPECS,{...values,sm_ttt_karma_per_round_win:2,sm_ttt_karma_low_command:''});
  const context = vm.createContext({ module: { exports: {} }, console: { log() {} }, require(name) {
    if(name==='@s2script/sdk/translations')return translationsVia((slot,key,args)=>core.formatKarmaWarning(args[0]));
    if (name === '@s2script/cs2') return { ChatColors:testChatColors, Player: { fromSlot: s => players[s] ?? null } };
    if (name === '@s2script/sdk/config') return {config:configuration.config};
    if (name === '@s2script/sdk/server') return { Server: { ...configuration.server, command: s => commands.push(s) } };
    if (name === '@s2script/sdk/bans') return { Bans: { add: (...a) => bans.push(a) } };
    if (name === '@s2script/sdk/chat') return { Chat: { toSlot: (...a) => messages.push(a) } };
    throw Error(name);
  } });
  vm.runInContext(result.outputFiles[0].text, context);
  const api = context.module.exports; api.bindCore(core); api.initializeSettings();
  const handlers = new Map();
  const bus = { on(kind, fn, options = {}) { const list = handlers.get(kind) ?? []; list.push({ fn, priority: options.priority ?? 60, ignoreCanceled: options.ignoreCanceled ?? false }); list.sort((a,b) => a.priority-b.priority); handlers.set(kind,list); }, emit(kind, event) { for(const h of [...(handlers.get(kind) ?? [])]) { if(h.ignoreCanceled && event.canceled) continue; try { h.fn(event); } catch {} } return event; } };
  api.installKarma(bus);
  for(const slot of [0,1,2]) bus.emit('join',{slot});
  return { api, bus, core, ids, roles, participating, settings, values, state, scores, bans, kicks, messages, commands, players, handlers, lowCommand: s => configuration.server.setCvar('sm_ttt_karma_low_command',s), onKick: h => kickHook=h };
}

test('same-side kills multiply penalties; canceled damage still determines self-defence', () => {
  const f=fixture();
  f.bus.emit('death',{slot:1,killer:0});f.bus.emit('death',{slot:1,killer:0});f.api.flushKarma();
  assert.equal(f.api.karmaOf(0),20);assert.equal(f.api.karmaOf(1),58);
  const g=fixture();g.bus.emit('damage',{slot:0,attacker:1,canceled:true});g.bus.emit('death',{slot:1,killer:0});g.api.flushKarma();
  assert.equal(g.api.didStrikeFirst(1,0),true);assert.equal(g.api.karmaOf(0),48);assert.equal(g.api.karmaOf(1),47);
});
test('old-trap forgiveness consumes one death but retains bad-kill multiplier', () => {
  const f=fixture();f.api.suppressKarmaOnce(1);f.bus.emit('death',{slot:1,killer:0});f.bus.emit('death',{slot:1,killer:0});f.api.flushKarma();
  assert.equal(f.api.karmaOf(0),30);assert.equal(f.api.karmaOf(1),54);
});
test('round award includes dead participants and excludes nonparticipants', () => {
  const f=fixture();f.bus.emit('gameState',{state:3,canceled:false});
  assert.deepEqual([0,1,2].map(s=>f.api.karmaOf(s)),[52,52,50]);
});
test('leave settles deltas without punishment, reconnect preserves bench, new occupant does not inherit it', () => {
  const f=fixture();f.lowCommand('sm_ban #{0} 2880 Low Karma');f.api.queueKarma(0,-35);f.bus.emit('leave',{slot:0});
  assert.equal(f.kicks.length,0);assert.equal(f.bans.length,0);
  f.bus.emit('join',{slot:0});assert.equal(f.api.karmaOf(0),15);assert.equal(f.api.timeoutRemaining(0),4);
  const role={slot:0,role:1,canceled:false};f.bus.emit('roleAssigning',role);assert.equal(role.role,4);assert.equal(f.api.timeoutRemaining(0),3);assert.deepEqual(f.messages,[[0,'sit out 4']]);
  f.bus.emit('leave',{slot:0});f.ids[0]='D';f.bus.emit('join',{slot:0});assert.equal(f.api.karmaOf(0),50);assert.equal(f.api.timeoutRemaining(0),0);
});
test('low karma resets before synchronous kick/leave and persists against captured SteamID', () => {
  const f=fixture();f.lowCommand('sm_ban #{0} 2880 Low Karma');f.onKick(slot=>{f.bus.emit('leave',{slot});f.ids[slot]='';});
  f.api.queueKarma(0,-60);f.api.flushKarma();assert.equal(f.api.karmaOf(0),50);assert.deepEqual(f.bans,[['A',2880,'Low Karma']]);assert.equal(f.kicks.length,1);
  f.ids[0]='A';f.bus.emit('join',{slot:0});assert.equal(f.api.karmaOf(0),50);f.api.flushKarma();assert.equal(f.kicks.length,1);
});
test('custom low command is exclusive, blank disables punishment, admin raises unbounded karma and clears timeout', () => {
  const f=fixture();f.lowCommand('kickid {0} custom');f.api.adminSetKarma(0,-10);assert.deepEqual(f.commands,['kickid 100 custom']);assert.equal(f.bans.length,0);assert.equal(f.kicks.length,0);
  f.lowCommand('');f.api.adminSetKarma(0,-10);assert.equal(f.commands.length,1);assert.equal(f.api.karmaOf(0),50);
  f.api.adminSetKarma(0,10);assert.equal(f.api.timeoutRemaining(0),4);f.api.adminSetKarma(0,155);assert.equal(f.api.karmaOf(0),155);assert.equal(f.api.timeoutRemaining(0),0);
});
test('karma veto prevents write; callback mutations before throw are preserved', () => {
  const f=fixture();f.bus.on('karma',e=>{e.karma=77;throw Error('after mutation');},{priority:40});f.api.setKarma(0,90);assert.equal(f.api.karmaOf(0),77);
  f.bus.on('karma',e=>{e.canceled=true;},{priority:10});f.api.setKarma(0,10);assert.equal(f.api.karmaOf(0),77);
});
