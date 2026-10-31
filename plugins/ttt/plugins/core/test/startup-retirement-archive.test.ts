import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import vm from 'node:vm';
import { SPECS, CANONICAL_FIELDS } from '../src/core/settings-specs.ts';
import { SPECS as SHOP_SPECS } from '../../shop/src/settings-specs.ts';
import { readValues } from '../../../packages/contracts/config.ts';
import { configFixture } from '../../../packages/contracts/test/config-runtime.mjs';
import { fixture as worldFixture } from '../../world/test/fixture.mjs';
import { fixture as itemsFixture } from '../../items/test/fixture.mjs';
import { fixture as bodiesFixture } from '../../bodies/test/fixture.mjs';
import { fixture as shopFixture } from '../../shop/test/fixture.mjs';
import { fixture as hudFixture } from '../../ui/test/hudkit-fixture.mjs';

function artifact(owner: string): string {
  return execFileSync('unzip', ['-p', resolve(`../${owner}/dist/_edgegamers_ttt-${owner}.s2sp`), 'plugin.js'], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
}
const corePlugin = execFileSync('unzip', ['-p', resolve(process.env.TTT_TEST_ARCHIVE ?? 'dist/_edgegamers_ttt-core.s2sp'), 'plugin.js'], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
const worldPlugin = artifact('world'), itemsPlugin = artifact('items'), bodiesPlugin = artifact('bodies');
const shopPlugin = artifact('shop');

/** Real Core startup and actual retained World/Items/Bodies artifacts; fake only SDK boundaries. */
function startup({ missing = false, fail = false, handoff = null, actualShop = false }: { missing?: boolean; fail?: boolean; handoff?: unknown; actualShop?:boolean } = {}) {
  const world = worldFixture(worldPlugin), items = itemsFixture(itemsPlugin), bodies = bodiesFixture(bodiesPlugin);
  world.settings.roleGlowSeconds = 1;
  for (const [slot, player] of world.players) {
    const name = slot === 0 ? 'Tester' : `Player${slot}`;
    world.roster.find((row: any) => row.actor.slot === slot).name = name;
    player.playerName = name;
    const setName = player.setName;
    player.setName = (value: string) => { setName(value); player.playerName = value; };
  }
  world.deliver('roleAssigned', { slot: 0, role: 2 });
  world.deliver('gameState', { state: 3, canceled: false });
  assert.ok(items.methods.placeStation(items.actor(0), 1));
  items.methods.armCluster(items.actor(0));
  items.methods.grantTaser(items.actor(0));
  vm.runInContext('poisonRemaining[0] = 20; poisonTimer[0] = 0.5;', items.ctx);
  bodies.spawn(0);
  assert.equal(world.entities.length, 2);
  assert.ok(world.depth() > 0);
  assert.equal(bodies.methods.getStatus().tracked, 1);
  const oldWorldEntities = [...world.entities], oldItemEntities = [...items.entities];
  const oldBodyEntities = [...bodies.entities];
  const cf = configFixture([...SPECS, ...CANONICAL_FIELDS]);
  const calls: { operation: string; phase: string }[] = [], logs: string[] = [];
  const frames: { callback(): void; phase: string }[] = [], attachments: { name: string; callback(provider: any, scope: any): void }[] = [];
  const clients = new Map<number, any>(), players = new Map<number, any>(), eventHandlers = new Map<string, Function[]>();
  let nativeLookups=0; const mapCallbacks:Function[]=[];
  let phase = 'LOAD', published: any, now = 10, phrases: Record<string, string> = {};
  const translation={onRead:null as ((slot:number,key:string)=>void)|null};
  const retained = { panels: 1, communication: 2, wallet: 50, prompt: 1, reports: 2, slays: 3, karma: 74, firstDamage: 1 };
  const settings = readValues(SHOP_SPECS, spec => spec.default);
  const record = (operation: string): void => { calls.push({ operation, phase }); };
  const fake = (owner: string, overrides: Record<string, Function>) => new Proxy(overrides, {
    get: (target, key) => (...args: unknown[]) => {
      record(`${owner}.${String(key)}`);
      return target[String(key)]?.(...args);
    },
  });
  const services: Record<string, any> = {
    world: world.methods, items: items.methods, bodies: bodies.methods,
    ui: fake('ui', { resetAll() { retained.panels = 0; } }),
    communication: fake('communication', { reset() { retained.communication = 0; } }),
    shop: fake('shop', { getRoundSettings: () => settings, refreshSettings: () => settings, getHandlers: () => [], resetShop() { retained.wallet = 0; } }),
    reports: fake('reports', { getHandlers: () => [], resetFlow() { retained.prompt = 0; }, resetReports() { retained.reports = 0; }, resetSanctions() { retained.slays = 0; } }),
    special: fake('special', { getHandlers: () => [] }),
    karma: fake('karma', {
      getRoundSettings: () => ({ defaultKarma: 50, minimumKarma: 0, timeoutThreshold: 20, timeoutRounds: 4, warningWindowHours: 24, perRound: 1, perRoundWin: 1 }),
      getHandlers: () => [], resetRound() { retained.firstDamage = 0; },
    }),
  };
  const shop=actualShop?shopFixture(shopPlugin):null;
  if(shop){
    for(const key of Object.keys(shop.core))shop.core[key]=(...args:unknown[])=>published[key](...args);
    services.shop=shop.methods;
  }
  // Each actual owner keeps a hard proxy which resolves the new Core publication by name.
  for (const owner of [world, items, bodies]) {
    for (const key of Object.keys(owner.core)) owner.core[key] = (...args: unknown[]) => published[key](...args);
  }
  for (const slot of [0, 1, 2]) {
    const player = world.players.get(slot), client = world.clients.get(slot);
    Object.assign(player, { slot, teamNum: 2, pawnHealth: 100, pawnIsAlive: true });
    Object.assign(player.pawn, { lifeState: 0, health: 100, maxHealth: 100, buttons: 0, takesDamage: true });
    Object.assign(client, { slot, name: player.playerName, isBot: true });
    players.set(slot, player); clients.set(slot, client);
  }
  const wrappedWorld = new Proxy(world.methods, { get: (target, key) => (...args: unknown[]) => {
    record(`world.${String(key)}`);
    if (fail && key === 'hideIcons') throw Error('native hide failed');
    const value = target[String(key)](...args);
    return value;
  } });
  services.world = wrappedWorld;
  for (const owner of ['items', 'bodies']) {
    const actual = services[owner];
    services[owner] = new Proxy(actual, { get: (target, key) => (...args: unknown[]) => {
      record(`${owner}.${String(key)}`); return target[String(key)](...args);
    } });
  }
  const noRegistration = () => ({ dispose() {} });
  const eventRegistration = (name: string, callback: Function) => { const handlers = eventHandlers.get(name) ?? []; handlers.push(callback); eventHandlers.set(name, handlers); };
  const scope = {
    events: { on: eventRegistration, onPre: noRegistration },
    clients: new Proxy({}, { get: () => noRegistration }), entities: { onCreate: noRegistration },
    server: { onPrecache: noRegistration, onMapStart(callback:Function) {mapCallbacks.push(callback);}, onGameFrame(callback: () => void, opts?: { phase: string }) { frames.push({ callback, phase: opts?.phase ?? 'PRE' }); } },
  };
  const command = Object.assign(() => {}, { admin() {}, server() {}, onClientCommand() {} });
  const server = { ...cf.server, get gameTime() { return now; }, mapName: 'de_dust2', command() {} };
  const unsupported: any = new Proxy(function () {}, {
    get: (_target, key) => key === Symbol.toPrimitive ? () => '' : unsupported,
    apply() { throw Error('unexpected SDK operation'); }, construct: () => ({}),
  });
  const context = vm.createContext({ module: { exports: {} }, console: { log: (line: string) => logs.push(line) },
    require(name: string) {
      if (name === '@s2script/sdk/plugin') return { createScope: () => scope,
        previous: () => handoff,
        publish(name: string, methods: any) { assert.equal(name, '@edgegamers/ttt-core'); published = methods; },
        watchOptional(name: string, callback: any) { attachments.push({ name, callback }); } };
      if (name === '@s2script/sdk/config') return { config: cf.config };
      if (name === '@s2script/sdk/server') return { Server: server };
      if (name === '@s2script/sdk/commands') return { command };
      if (name === '@s2script/sdk/clients') return { Clients: { fromSlot: (slot: number) => {nativeLookups++;return clients.get(slot) ?? null;} } };
      if (name === '@s2script/sdk/entity') return { Entity: { findByClass: () => [] } };
      if (name === '@s2script/sdk/usermessages') return { UserMessages: { onPre: noRegistration } };
      if (name === '@s2script/sdk/translations') return { Translations: { load(_name: string, seed: Record<string, string>) { phrases = seed; }, translate(slot: number, key: string) { translation.onRead?.(slot,key); return phrases[key] ?? key; } } };
      if (name === '@s2script/cs2') return new Proxy({ Pawn: { forSlot: (slot: number) => {nativeLookups++;return players.get(slot)?.pawn ?? null;} }, Player: { fromSlot: (slot: number) => {nativeLookups++;return players.get(slot) ?? null;}, allConnected: () => [...players.values()] }, items: { onCanAcquire: noRegistration }, GameRules: { get: () => ({ warmupPeriod: true }) } }, { get: (target, key) => Reflect.get(target, key) ?? unsupported });
      return unsupported;
    },
  });
  const read = (expression: string): any => vm.runInContext(expression, context);
  vm.runInContext(corePlugin, context);
  read('module.exports.OnPluginStart()');
  // Stock sync finalize_loading_plugins marks Core Active, then drains attachments before first PRE.
  phase = 'ACTIVE';
  if (!missing) for (const { name, callback } of attachments) {
    const service=services[name.split('/')[1].replace(/^ttt-/, '')];
    if(service) callback(service, { own() {} });
  }
  calls.length = 0;
  const frame = (which: string): void => { phase = which; now += 0.015625; for (const row of frames) if (row.phase.toLowerCase() === which.toLowerCase()) row.callback(); };
  return { read, calls, logs, retained, world, items, bodies, players, clients, shop, translation, cf, frames, frame, oldWorldEntities, oldItemEntities, oldBodyEntities, published, get nativeLookups(){return nativeLookups;}, map(){for(const callback of mapCallbacks)callback();},
    // Exercise the actual private binder without duplicating the ordered attachment scope.
    rebindShop() { context.testShop=services.shop; return read('bindShopProvider(testShop)'); },
    event(name: string) { phase = 'EVENT'; for (const handler of eventHandlers.get(name) ?? []) handler({}); } };
}

test('actual Core first PRE retires retained native owners before queued work and preserves map records', () => {
  const f = startup();
  assert.equal(f.read('nameOf(0)'), '[T] Tester');
  f.read('nextPreFrame(() => { if (nameOf(0) !== "Tester") throw Error("queued work preceded restoration"); });');
  assert.ok(!f.world.ops.some((op: any[]) => op[0] === 'input' && op[2] === 'Kill'));
  f.frame('POST');
  assert.equal(f.bodies.methods.getStatus().tracked, 1, 'POST never performs retirement');
  assert.equal(f.read('preFrameDepth()'), 1);
  f.frame('PRE');
  assert.ok(f.oldWorldEntities.every((entity: any) => f.world.ops.some((op: any[]) => op[0] === 'input' && op[1] === entity.ref.index && op[2] === 'Kill')));
  assert.ok(f.oldItemEntities.every((entity: any) => !entity.isValid()));
  assert.ok(f.oldBodyEntities.every((entity: any) => !entity.isValid()));
  assert.equal(f.bodies.methods.getStatus().tracked, 0);
  assert.equal(vm.runInContext('clusterCharge[0]', f.items.ctx), 0);
  assert.equal(vm.runInContext('poisonRemaining[0]', f.items.ctx), 0);
  assert.equal(vm.runInContext('poisonTimer[0]', f.items.ctx), 0);
  assert.equal(vm.runInContext('jobs.size', f.world.context), 0);
  assert.equal(f.read('nameOf(0)'), 'Tester');
  assert.equal(f.read('playerCount()'), 3);
  assert.equal(f.read("bus2.has('gameState')"), true);
  assert.equal(f.read('preFrameDepth()'), 1, 'the retirement PRE leaves queued work for after simulation/snapshot');
  assert.deepEqual(f.retained, { panels: 0, communication: 0, wallet: 0, prompt: 0, reports: 2, slays: 3, karma: 74, firstDamage: 0 });
  assert.ok(f.calls.every(call => call.phase === 'PRE'));
  assert.ok(!f.calls.some(call => call.operation === 'reports.resetReports' || call.operation === 'reports.resetSanctions'));
  const hide = f.calls.filter(call => /\.hide(Icons|Effects|WeaponFx)$/.test(call.operation));
  const killAt = f.calls.findIndex(call => call.operation === 'bodies.clearBodies');
  assert.deepEqual(hide.map(call => call.operation), ['world.hideIcons', 'items.hideWeaponFx', 'items.hideEffects']);
  assert.ok(hide.every(call => f.calls.indexOf(call) < killAt));
  const retiredCalls = f.calls.length;
  f.frame('PRE');
  assert.equal(f.read('preFrameDepth()'), 0);
  assert.equal(f.calls.filter(call => /\.resetIcons$|\.resetEffects$|\.resetWeaponFx$/.test(call.operation)).length, 3, 'retirement runs once');
  assert.ok(!f.logs.some(log => /queued work preceded|callback threw/.test(log)));
  assert.ok(f.calls.length >= retiredCalls);
});

test('actual Core rejects countdown start until retirement has passed through a simulation frame', () => {
  const f = startup();
  assert.equal(f.read('setState(1)'), false);
  assert.equal(f.read('game.state'), 0);
  f.frame('PRE');
  assert.equal(f.read('setState(1)'), false, 'events cannot start a round between retirement and the following PRE');
  f.frame('PRE');
  assert.equal(f.read('setState(1)'), true);
  assert.equal(f.read('game.state'), 1);
});

test('actual Core startup retirement does not require absent optional owners', () => {
  const f = startup({ missing: true });
  f.frame('PRE'); f.frame('PRE');
  assert.equal(f.read('playerCount()'), 3);
  assert.equal(f.read('setState(1)'), true);
});

test('actual Core startup never starts a round after a genuine native cleanup failure', () => {
  const f = startup({ fail: true });
  assert.throws(() => f.frame('PRE'), /native hide failed/);
  const attempted = f.calls.length;
  f.frame('PRE');
  assert.equal(f.calls.length, attempted, 'failed retirement is not retried every frame');
  assert.equal(f.read('setState(1)'), false);
  assert.equal(f.bodies.methods.getStatus().tracked, 1);
});

test('actual Core consumes reload identity before roster seeding and publishes the next handoff', () => {
  const prior = { version: 1, mapName: 'de_dust2', gameState: 2, roundEpoch: 41,
    connectionGenerations: Array.from({ length: 64 }, (_, slot) => slot < 3 ? 9 : 3), roundsThisMap: 7 };
  const f = startup({ handoff: prior });
  assert.equal(f.read('roundEpoch()'), 42);
  assert.equal(f.read('generationOf(0)'), 10, 'restored floor is incremented by actual addPlayer');
  assert.equal(f.read('game.roundsThisMap'), 8, 'the abandoned active round receives one terminal bucket');
  assert.equal(f.read('game.state'), 0);
  assert.equal(f.read('matchesUiActor({slot:0,steamId:steamIdOf(0),generation:9,roundEpoch:41})'), false);
  const snapshot = JSON.parse(JSON.stringify(f.read('module.exports.OnPluginState()')));
  assert.deepEqual(snapshot, { version: 1, mapName: 'de_dust2', gameState: 0, roundEpoch: 42,
    connectionGenerations: Array.from({ length: 64 }, (_, slot) => slot < 3 ? 10 : 3), roundsThisMap: 8 });
  assert.deepEqual(prior.connectionGenerations.slice(0, 3), [9, 9, 9]);
  f.read('module.exports.OnPluginEnd()');
  const replacement = startup({ handoff: snapshot });
  assert.equal(replacement.read('roundEpoch()'), 43);
  assert.equal(replacement.read('generationOf(0)'), 11);
  assert.equal(replacement.read('game.roundsThisMap'), 8, 'Waiting reload does not count another abandoned active round');
});

test('actual Core retirement and identity handoff reject retained owner timers and deferred item tickets', () => {
  const f = startup({ handoff: { version: 1, mapName: 'de_dust2', gameState: 2, roundEpoch: 1,
    connectionGenerations: Array(64).fill(1), roundsThisMap: 1 } });
  const oldItemTickets = f.items.queue.map((row: any) => row.ticket);
  assert.ok(oldItemTickets.length > 0);
  assert.ok(f.world.timers.length > 0, 'the retained World glow timer exists before replacement');
  f.frame('PRE');
  const beforeQueue = f.read('preFrameDepth()');
  const beforeGive = f.items.ops.filter((row: any[]) => row[0] === 'give').length;
  const beforeModel = f.world.ops.filter((row: any[]) => row[0] === 'model').length;
  for (const timer of f.world.timers) timer.fn();
  for (const ticket of oldItemTickets) f.items.methods.runPreFrame(ticket);
  assert.equal(f.read('preFrameDepth()'), beforeQueue, 'an expired glow timer cannot queue work in the new Core');
  assert.equal(f.items.ops.filter((row: any[]) => row[0] === 'give').length, beforeGive, 'an old item ticket cannot grant to the replacement actor');
  assert.equal(f.world.ops.filter((row: any[]) => row[0] === 'model').length, beforeModel);
  assert.equal(vm.runInContext('jobs.size', f.items.ctx), 0, 'a rejected retained item ticket drops its private closure');
});


test('actual published Core context admission remains closed through retirement and pure guards read no SDK',()=>{
 const f=startup();assert.equal(f.published.getWorldActionContext(0),null);f.frame('PRE');assert.equal(f.published.getWorldActionContext(0),null);
 f.frame('PRE');const view=f.published.getWorldActionContext(0);assert.ok(view);const {pawn,...stamp}=view;const before=f.nativeLookups;
 for(let n=0;n<64;n++)assert.equal(f.published.matchesWorldActionContext(stamp),true);assert.equal(f.nativeLookups,before);
 const original=f.world.methods.hideIcons;let closingObserved=false;f.world.methods.hideIcons=()=>{closingObserved=true;assert.equal(f.published.matchesWorldActionContext(stamp),false);assert.equal(f.published.getWorldActionContext(0),null);original();};
 f.read('module.exports.OnPluginEnd()');assert.equal(closingObserved,true);assert.equal(f.published.matchesWorldActionContext(stamp),false);
});
test('actual Core map teardown closes action admission before native cleanup and only reopens after success',()=>{
 const f=startup();f.frame('PRE');f.frame('PRE');const view=f.published.getWorldActionContext(0);assert.ok(view);const {pawn,...stamp}=view;
 const original=f.world.methods.hideIcons;let closingObserved=false;f.world.methods.hideIcons=()=>{closingObserved=true;assert.equal(f.published.matchesWorldActionContext(stamp),false);assert.equal(f.published.getWorldActionContext(0),null);original();};
 f.map();assert.equal(closingObserved,true);assert.equal(f.published.matchesWorldActionContext(stamp),false);assert.ok(f.published.getWorldActionContext(0));
 f.world.methods.hideIcons=()=>{throw Error('map hide failed');};assert.throws(()=>f.map(),/map hide failed/);assert.equal(f.published.getWorldActionContext(0),null);
});

test('actual published stamped queue skips admission SDK work and retains a native identity check at PRE',()=>{
 const f=startup();f.frame('PRE');f.frame('PRE');const view=f.published.getWorldActionContext(0);assert.ok(view);const {pawn,...stamp}=view;
 const before=f.nativeLookups;assert.equal(f.published.scheduleWorldPreFrame(900,stamp.actor,stamp),true);assert.equal(f.nativeLookups,before);
 f.read('game.state = 2;');f.read('drainPreFrame()');assert.ok(f.calls.some(row=>row.operation==='world.runPreFrame'),'Countdown/Waiting-to-active state commit does not cancel an actor-bound queued model');assert.ok(f.nativeLookups>before,'PRE native actor check remains fresh');
 const g=startup();g.frame('PRE');g.frame('PRE');const next=g.published.getWorldActionContext(0);const {pawn:ignored,...nextStamp}=next;
 assert.equal(g.published.scheduleWorldPreFrame(901,nextStamp.actor,nextStamp),true);g.world.clients.get(0).valid=false;g.calls.length=0;g.read('drainPreFrame()');assert.ok(!g.calls.some(row=>row.operation==='world.runPreFrame'),'SDK connection expiration before Core disconnect rejects the queued callback');
});

test('actual Core entry rejects same-Steam SDK successors during pawn lookup before registry lifecycle events',()=>{
 for(const steamId of ['76561198000000009','0']){
  const f=startup();f.frame('PRE');f.frame('PRE');const row=f.world.connect(3,2,'NewBot');const old=f.world.players.get(3),client=f.world.clients.get(3);old.steamId=steamId;client.steamId=steamId;row.actor.steamId=steamId;
  Object.assign(old,{slot:3,teamNum:2,pawnHealth:100,pawnIsAlive:true,playerName:'NewBot'});Object.assign(old.pawn,{lifeState:0,health:100,maxHealth:100,buttons:0,takesDamage:true});Object.assign(client,{slot:3,name:'NewBot',isBot:steamId==='0'});
  f.players.set(3,old);f.clients.set(3,client);f.read(`addPlayer(3,${JSON.stringify(steamId)},'NewBot');setRole(3,2);setAlive(3,true);setParticipating(3,true);`);
  const oldPawn=old.pawn,newPawn={...oldPawn,ref:f.world.ref()},successor={...old,ref:f.world.ref(),pawn:newPawn},nextClient={...client,valid:true};let replaced=false;
  Object.defineProperty(old,'pawn',{get(){if(!replaced){replaced=true;client.valid=false;old.ref.valid=false;f.players.set(3,successor);f.clients.set(3,nextClient);f.world.players.set(3,successor);f.world.clients.set(3,nextClient);row.pawn=newPawn.ref;}return newPawn;}});
  const generation=f.read('generationOf(3)'),creates=f.world.entities.length,depth=f.world.depth();f.world.deliver('roleAssigned',{slot:3,role:2});
  assert.equal(replaced,true);assert.equal(f.read('generationOf(3)'),generation,'no Core disconnect/connect event ran');assert.equal(client.steamId,steamId,'stock expired bot token may still expose the same zero SteamID');assert.equal(client.isValid(),false);
  assert.equal(f.world.entities.length,creates,'World had no prior slot3 connection cache and must not adopt the successor under the old Core generation');assert.equal(f.world.depth(),depth);assert.equal(f.published.getWorldActionContext(3),null);
 }
});

test('actual World first SDK adoption rejects successors after Core sealed context but before registry lifecycle events',()=>{
 for(const steamId of ['76561198000000009','0']){
  const f=startup();f.frame('PRE');f.frame('PRE');const row=f.world.connect(3,3,'FirstDetective'),old=f.world.players.get(3),client=f.world.clients.get(3);old.steamId=steamId;client.steamId=steamId;row.actor.steamId=steamId;
  Object.assign(old,{slot:3,teamNum:2,pawnHealth:100,pawnIsAlive:true,playerName:'FirstDetective'});Object.assign(old.pawn,{lifeState:0,health:100,maxHealth:100,buttons:0,takesDamage:true});Object.assign(client,{slot:3,name:'FirstDetective',isBot:steamId==='0'});
  f.players.set(3,old);f.clients.set(3,client);f.read(`addPlayer(3,${JSON.stringify(steamId)},'FirstDetective');setRole(3,3);setAlive(3,true);setParticipating(3,true);`);
  const oldPawn=old.pawn,newPawn={...oldPawn,ref:f.world.ref()},successor={...old,ref:f.world.ref(),pawn:newPawn},nextClient={...client,valid:true};successor.setName=(name:string)=>f.world.ops.push(['name',3,successor.ref.id,name]);let replaced=false;
  const lookup=f.world.players.get.bind(f.world.players);f.world.players.get=(slot:number)=>{if(slot===3&&!replaced){replaced=true;client.valid=false;old.ref.valid=false;oldPawn.ref.valid=false;f.players.set(3,successor);f.clients.set(3,nextClient);f.world.players.set(3,successor);f.world.clients.set(3,nextClient);row.pawn=newPawn.ref;}return lookup(slot);};
  const generation=f.read('generationOf(3)'),depth=f.world.depth();f.world.ops.length=0;f.world.deliver('roleAssigned',{slot:3,role:3});
  assert.equal(replaced,true);assert.equal(f.read('generationOf(3)'),generation,'Core lifecycle is still delayed');assert.equal(client.isValid(),false);
  assert.ok(!f.world.ops.some((operation:any[])=>operation[0]==='name'&&operation[1]===3),'a first-use World cache must not rename the successor under the old Core registry generation');assert.equal(f.world.depth(),depth);
 }
});

test('actual published Core shop projection rejects same-Steam and bot successors during Shop callbacks',()=>{
 for(const steamId of ['76561198000000001','0'])for(const seam of ['canGrantShopItem','formatPhrase']){
  const f=startup({actualShop:true});f.frame('PRE');f.frame('PRE');
  const player=f.players.get(1),client=f.clients.get(1);player.steamId=steamId;client.steamId=steamId;
  f.read(`addPlayer(1,${JSON.stringify(steamId)},'Player1');setRole(1,2);setParticipating(1,true);setAlive(1,true);game.state=2;`);
  const actor=f.published.getWorldPlayers(1)[0].actor;assert.equal(f.published.matchesUiActor(actor),true);
  const generation=f.read('generationOf(1)');f.shop!.fund(1,100);let replaced=false;const callback=f.shop!.core[seam];
  f.shop!.core[seam]=(...args:unknown[])=>{
   const value=callback(...args);if(!replaced){replaced=true;client.valid=false;player.ref.valid=false;
    f.clients.set(1,{...client,valid:true});f.players.set(1,{...player,ref:f.world.ref(),pawn:{...player.pawn,ref:f.world.ref()}});
   }return value;
  };
  assert.equal(f.published.getUiShop(actor),null,`${steamId}/${seam}`);
  assert.equal(replaced,true);assert.equal(f.read('generationOf(1)'),generation,'no Core lifecycle callback ran');
 }
});

test('actual Core Shop and stock HUD collect bounded fresh views and do not paint a successor',()=>{
 const f=startup({actualShop:true});f.frame('PRE');f.frame('PRE');
 f.read('setRole(1,2);setParticipating(1,true);setAlive(1,true);game.state=2;');f.shop!.fund(1,100);
 const ui=hudFixture();const actor=f.published.getWorldPlayers(1)[0].actor;ui.actors.set(1,actor);let views=0;
 for(const name of Object.keys(ui.core))ui.core[name]=(...args:unknown[])=>{if(name==='getUiShop')views++;return f.published[name](...args);};
 assert.equal(ui.api.openShop(actor),true);assert.equal(views,2);assert.equal(ui.titles('TTT Shop',1).length,1);
 views=0;ui.clear();ui.click(1,'s2_m0_r1');assert.equal(views,1);assert.equal(ui.titles('TTT Shop',1).length,1);
 ui.clear();const callback=f.shop!.core.canGrantShopItem;let replaced=false;
 f.shop!.core.canGrantShopItem=(...args:unknown[])=>{const value=callback(...args);if(!replaced){replaced=true;f.clients.get(1).valid=false;}return value;};
 ui.click(1,'s2_m0_r1');assert.equal(replaced,true);assert.equal(ui.writes.filter((w:any)=>w.op==='set').length,0);
});

test('actual Core final shop seal rejects private catalogue changes during row translation or final native identity reads',()=>{
 for(const seam of ['translation','identity'])for(const change of ['role','state','epoch','alive','participating']){
  const f=startup({actualShop:true});f.frame('PRE');f.frame('PRE');
  f.read('setRole(1,2);setParticipating(1,true);setAlive(1,true);game.state=2;');f.shop!.fund(1,100);
  const actor=f.published.getWorldPlayers(1)[0].actor;let armed=false,changed=false;
  const mutate=()=>{changed=true;f.read(change==='role'?'setRole(1,3);':change==='state'?'game.state=3;':change==='epoch'?'restoreRoundIdentity(roundEpoch(),game.roundsThisMap);':change==='alive'?'setAlive(1,false);':'setParticipating(1,false);');};
  // Row translations use the actual SDK signature (slot,key,...args); sort phrases use slot -1.
  f.translation.onRead=(slot:number)=>{if(slot===1&&!changed){if(seam==='translation')mutate();else armed=true;}};
  if(seam==='identity'){
   const get=f.players.get.bind(f.players);f.players.get=(slot:number)=>{if(slot===1&&armed&&!changed)mutate();return get(slot);};
  }
  assert.equal(f.published.getUiShop(actor),null,`${seam}/${change}`);assert.equal(changed,true);
 }
});

test('actual stock shop cannot submit a copied restricted catalogue after later UI native identity callbacks retire authority',()=>{
 for(const stage of ['rows','detail','subtitle'])for(const change of ['role','state','epoch','map','alive','participating','binding','closing']){
  const f=startup({actualShop:true});f.frame('PRE');f.frame('PRE');
  f.read('setRole(1,2);setParticipating(1,true);setAlive(1,true);game.state=2;');f.shop!.fund(1,100);
  const ui=hudFixture(),actor=f.published.getWorldPlayers(1)[0].actor;ui.actors.set(1,actor);let views=0,armed=false,checks=0,changed=false;
  for(const name of Object.keys(ui.core))ui.core[name]=(...args:unknown[])=>{const value=f.published[name](...args);if(name==='getUiShop'&&++views===2)armed=true;return value;};
  const get=f.players.get.bind(f.players),target=stage==='rows'?1:stage==='detail'?2:3;
  f.players.get=(slot:number)=>{const player=get(slot);if(slot===1&&armed&&++checks===target){changed=true;
   if(change==='binding')f.rebindShop();else f.read(change==='role'?'setRole(1,1);':change==='state'?'game.state=3;':change==='epoch'?'restoreRoundIdentity(roundEpoch(),game.roundsThisMap);':change==='map'?'bumpMapEpoch();':change==='alive'?'setAlive(1,false);':change==='participating'?'setParticipating(1,false);':'closeWorldActionAdmission();');
  }return player;};
  ui.api.openShop(actor);assert.equal(changed,true,`${stage}/${change}`);
  assert.equal(ui.writes.filter((w:any)=>w.op==='set').length,0,`${stage}/${change}`);
 }
});

test('actual shop stamps share startup and teardown admission and reject malformed or rebound projections',()=>{
 const f=startup({actualShop:true});const actor=f.published.getWorldPlayers(1)[0].actor;
 assert.equal(f.published.getUiShop(actor),null);f.frame('PRE');assert.equal(f.published.getUiShop(actor),null);
 f.frame('PRE');f.read('setRole(1,2);setAlive(1,true);setParticipating(1,true);game.state=2;');
 const view=f.published.getUiShop(actor);assert.ok(view);assert.equal(f.published.matchesUiActor(actor),true);
 for(const stamp of [null,{}, {...view.stamp,mapEpoch:-1},{...view.stamp,roundEpoch:NaN},{...view.stamp,state:4},{...view.stamp,role:5},{...view.stamp,alive:1},{...view.stamp,participating:null},{...view.stamp,shopBinding:Infinity}])assert.equal(f.published.matchesUiActor(actor,stamp),false);
 const previous=f.rebindShop();assert.equal(f.published.matchesUiActor(actor,view.stamp),false);
 const second=f.published.getUiShop(actor);f.rebindShop();const latest=f.published.getUiShop(actor);assert.ok(second&&latest);
 previous.dispose();assert.equal(f.published.matchesUiActor(actor,latest.stamp),true,'same-handle older attachment cannot dispose a newer binding');
 const hide=f.world.methods.hideIcons;f.world.methods.hideIcons=()=>{assert.equal(f.published.matchesUiActor(actor,latest.stamp),false);assert.equal(f.published.getUiShop(actor),null);hide();};
 f.read('module.exports.OnPluginEnd()');
});

test('actual same-actor nested stock paint survives retirement of its outer role projection',()=>{
 const f=startup({actualShop:true});f.frame('PRE');f.frame('PRE');f.read('setRole(1,2);setAlive(1,true);setParticipating(1,true);game.state=2;');f.shop!.fund(1,100);
 const ui=hudFixture(),actor=f.published.getWorldPlayers(1)[0].actor;ui.actors.set(1,actor);let views=0,armed=false,nested=false;
 for(const name of Object.keys(ui.core))ui.core[name]=(...args:unknown[])=>{const value=f.published[name](...args);if(name==='getUiShop'&&++views===2)armed=true;return value;};
 const get=f.players.get.bind(f.players);f.players.get=(slot:number)=>{const player=get(slot);if(slot===1&&armed&&!nested){nested=true;armed=false;f.read('setRole(1,1);');assert.equal(ui.api.openShop(actor),true);}return player;};
 ui.api.openShop(actor);assert.equal(nested,true);assert.equal(ui.titles('TTT Shop',1).length,1);
 assert.equal(ui.writes.some((w:any)=>w.op==='set'&&/C4 Explosive|Gloves|Camouflage|Body Paint/.test(String(w.value))),false);
 ui.clear();ui.click(1,'s2_m0_r1');assert.equal(ui.titles('TTT Shop',1).length,1,'outer retirement did not erase the newer action table');
});

test('actual generic and stamped native identity callbacks seal same-Steam and bot registry successors',()=>{
 for(const steamId of ['76561198000000001','0'])for(const stamped of [false,true]){
  const f=startup({actualShop:true});f.frame('PRE');f.frame('PRE');
  const player=f.players.get(1),client=f.clients.get(1);player.steamId=steamId;client.steamId=steamId;
  f.read(`addPlayer(1,${JSON.stringify(steamId)},'Player1');setRole(1,2);setParticipating(1,true);setAlive(1,true);game.state=2;`);f.shop!.fund(1,100);
  const actor=f.published.getWorldPlayers(1)[0].actor,view=f.published.getUiShop(actor);let changed=false;
  assert.ok(view);const valid=client.isValid;
  client.isValid=function(){const result=valid.call(this);if(!changed){changed=true;f.read(`removePlayer(1);addPlayer(1,${JSON.stringify(actor.steamId)},'Player1');setRole(1,2);setParticipating(1,true);setAlive(1,true);`);}return result;};
  assert.equal(f.published.matchesUiActor(actor,stamped?view.stamp:undefined),false,`${steamId}/${stamped}`);assert.equal(changed,true);
 }
});
