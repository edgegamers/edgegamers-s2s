import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { createContext, runInContext } from 'node:vm';
import type { UiModelMethods } from '../../../packages/contracts/ui-types.ts';

// Run the production owner with actual report/sanction stores. Replace engine observations only.
const sourceDir = fileURLToPath(new URL('../src/', import.meta.url));
const mocks: Record<string, string> = {
  '@s2script/sdk/plugin':'export const use=()=>fixture.core,publish=(name,methods)=>{fixture.reports=methods;};',
  '@s2script/sdk/admin': 'export const ADMFLAG={GENERIC:1}; export const Admin={forSlot:s=>({hasFlags:()=>fixture.admin})};',
  '@s2script/sdk/bans': 'export const Bans={add:(id,m,r)=>{fixture.banCalls.push(id); fixture.onBan?.(); if(fixture.banThrows)throw Error("ban failed"); fixture.bans.set(id,{until:0,reason:r});},get:id=>fixture.bans.get(id)??null};',
  '@s2script/sdk/clients': 'export const Clients={fromSlot:s=>{if(!fixture.connected.has(s))return null;const id=fixture.userIds.get(s);const valid=()=>fixture.connected.has(s)&&fixture.userIds.get(s)===id;return {slot:s,isValid:valid,get steamId(){return valid()?fixture.engineIds.get(s):"0"},kickWithReason:r=>{if(valid()){fixture.kicks.push(s);fixture.onKick?.();}}};}};',
  '@s2script/cs2': 'export const Pawn={forSlot:s=>fixture.connected.has(s)&&fixture.engineIds.has(s)?{}:null};export const Player={fromSlot:s=>fixture.connected.has(s)&&fixture.engineIds.has(s)?{steamId:fixture.engineIds.get(s),playerName:"Admin"}:null};',
  './registry': 'export const isConnected=s=>fixture.connected.has(s), steamIdOf=s=>fixture.ids.get(s)??"", generationOf=s=>fixture.generations.get(s)??0, activeSlots=()=>[...fixture.connected], isParticipating=s=>fixture.live, isAlive=s=>fixture.alive,roleOf=s=>2,nameOf=s=>s===2?"Admin":"Accused";',
  '../game/game': 'export const roundEpoch=()=>fixture.epoch, inProgress=()=>fixture.live,game={get state(){return fixture.live?2:0;}};',
  '../game/logger': 'export const logCount=()=>1, logRoundAt=()=>3, makeLogRows=()=>[{a:"private log"}];',
  '../cs2/pawn': 'export const tellAll=s=>fixture.announcements.push(s),tell=(s,t)=>fixture.announcements.push(t),pawnOf=()=>{fixture.onPawn?.();return fixture.pawn;};',
  './msgs': 'export const msg=(k,...a)=>k, msgFor=(s,k,...a)=>k;',
  '../shop/shop': 'export const PurchaseResult={Success:0,InsufficientFunds:1,NotFound:2,NotPurchasable:3,WrongRole:4}; const item={id:"armor",nameKey:"armor",descKey:"description",price:10,limit:1}; export const getShopView=()=>({balance:fixture.balance,rows:fixture.shopRows??[{...item,descriptionKey:item.descKey,gate:fixture.gate}]}),balanceOf=()=>fixture.balance,canPurchase=()=>fixture.gate,itemById=id=>id===item.id?item:undefined,resultMessage=r=>"refused "+r,tryPurchase=()=>{fixture.purchases++;return 0};',
};
const bundle = await build({
  stdin: { contents: `export { uiModels } from './core/ui-owner.ts'; export {openCoreActionAdmission} from './core/action-admission.ts'; export {OnPluginStart as startReports} from '../../reports/src/plugin.ts';export {reportCoreMethods} from './core/report-owner.ts';export {bindReportsProvider,reportsBinding} from './core/reports-provider.ts';export {pending} from '../../reports/src/reports.ts';export {owedBy,guiltyCount} from '../../reports/src/sanctions.ts'; export { bindTttHudProvider, getTttHud } from './cs2/ttthud.ts';`, resolveDir: sourceDir, loader: 'ts' },
  bundle: true, format: 'cjs', platform: 'node', write: false,
  plugins: [{ name: 'engine-observations', setup(b) {
    b.onResolve({ filter: /.*/ }, (a) => a.path in mocks ? { path: a.path, namespace: 'engine' } : undefined);
    b.onLoad({ filter: /.*/, namespace: 'engine' }, (a) => ({ contents: mocks[a.path], loader: 'js' }));
  } }],
});
interface OwnerExports {
  openCoreActionAdmission():void;
  uiModels: UiModelMethods;
  startReports():void;reportCoreMethods:object;bindReportsProvider(provider:object):{dispose():void};reportsBinding():number;
  pending(): { id: number }[];
  owedBy(id: string): number;
  guiltyCount(id: string): number;
  bindTttHudProvider(provider: object): {dispose():void};
  getTttHud(): {forget(slot:number):void} | null;
}
function fixture() {
  const state = {
    connected: new Set([2, 3]), ids: new Map([[2, 'admin'], [3, 'accused']]), engineIds: new Map([[2, 'admin'], [3, 'accused']]), generations: new Map([[2, 4], [3, 1]]),
    userIds: new Map([[2, 12], [3, 13]]), epoch: 8, admin: true, live: true, alive: true, balance: 20, gate: 0, purchases: 0, banThrows: false,
    shopRows: undefined as undefined | {id:string;nameKey:string;descriptionKey:string;price:number;limit:number;gate:number}[],
    core:null as any,reports:null as any,pawn:null as any,onPawn:undefined as undefined|(()=>void),
    bans: new Map<string, { until: number }>(), banCalls: [] as string[], kicks: [] as number[], announcements: [] as string[], onKick: undefined as undefined | (() => void), onBan:undefined as undefined | (()=>void),
  };
  const module = { exports: {} as OwnerExports };
  const context = createContext({ fixture: state, module, exports: module.exports, console: { log() {} } });
  runInContext(bundle.outputFiles[0]!.text, context);
  module.exports.openCoreActionAdmission();
  const actor = { slot: 2, steamId: 'admin', generation: 4, roundEpoch: 8 };
  state.core={...module.exports.reportCoreMethods,matchesActor:module.exports.uiModels.matchesUiActor,getGame:()=>({state:2,roundsThisMap:3,epoch:state.epoch}),dispatchDomain:e=>e,hasDomain:()=>false};
  module.exports.startReports();module.exports.bindReportsProvider(state.reports);
  const fileReport = (steamId='accused')=>{state.ids.set(3,steamId);state.engineIds.set(3,steamId);return state.reports.fileReport(actor,{slot:3,steamId,generation:1,roundEpoch:state.epoch},'RDM').report.id;};

  return { state, api: module.exports, actor, fileReport };
}
test('conviction commits one verdict, one escalation and one queued sanction', () => {
  const f = fixture(), id = f.fileReport();
  assert.equal(f.api.uiModels.ruleUiReport(f.actor, id, f.api.reportsBinding(), 'convict', 2).status, 'success');
  assert.equal(f.api.owedBy('accused'), 2); assert.equal(f.api.guiltyCount('accused'), 1);
  assert.equal(f.api.uiModels.ruleUiReport(f.actor, id, f.api.reportsBinding(), 'convict', 2).status, 'refused');
  assert.equal(f.api.owedBy('accused'), 2); assert.equal(f.api.guiltyCount('accused'), 1);
});
test('a second admin click or synchronous kick reentry cannot ban the same report twice', () => {
  const f = fixture(), id = f.fileReport();
  f.state.onKick = () => assert.equal(f.api.uiModels.ruleUiReport(f.actor, id, f.api.reportsBinding(), 'ban', 0).status, 'refused');
  assert.equal(f.api.uiModels.ruleUiReport(f.actor, id, f.api.reportsBinding(), 'ban', 0).status, 'success');
  assert.equal(f.api.uiModels.ruleUiReport(f.actor, id, f.api.reportsBinding(), 'ban', 0).status, 'refused');
  assert.deepEqual(f.state.banCalls, ['accused']); assert.deepEqual(f.state.kicks, [3]);
});
test('a report without a SteamID refuses ban and remains pending', () => {
  const f = fixture(), id = f.fileReport('');
  assert.equal(f.api.uiModels.ruleUiReport(f.actor, id, f.api.reportsBinding(), 'ban', 0).status, 'refused');
  assert.equal(f.api.pending().length, 1); assert.deepEqual(f.state.banCalls, []);
});
test('a throwing ban reports uncertainty without reopening a duplicate sanction path', () => {
  const f = fixture(), id = f.fileReport(); f.state.banThrows = true;
  assert.equal(f.api.uiModels.ruleUiReport(f.actor, id, f.api.reportsBinding(), 'ban', 0).status, 'unknown');
  assert.equal(f.api.uiModels.ruleUiReport(f.actor, id, f.api.reportsBinding(), 'ban', 0).status, 'refused');
  assert.deepEqual(f.state.banCalls, ['accused']); assert.deepEqual(f.state.kicks, []);
});
test('an engine slot replacement is fenced even before the registry receives its lifecycle event', () => {
  const f = fixture(), id = f.fileReport(); f.state.engineIds.set(2, 'replacement');
  assert.equal(f.api.uiModels.matchesUiActor(f.actor), false);
  assert.equal(f.api.uiModels.getUiLogPage(f.actor, 0), null);
  assert.equal(f.api.uiModels.ruleUiReport(f.actor, id, f.api.reportsBinding(), 'ban', 0).status, 'refused');
  assert.equal(f.api.uiModels.buyUiItem(f.actor, 'armor').status, 'refused');
  assert.deepEqual(f.state.banCalls, []); assert.equal(f.state.purchases, 0);
});
test('revoked access preserves pending reports; the original shop owner still enforces price and role gates', () => {
  const f = fixture(), id = f.fileReport(); f.state.admin = false;
  assert.equal(f.api.uiModels.getUiReports(f.actor), null);
  assert.equal(f.api.uiModels.ruleUiReport(f.actor, id, f.api.reportsBinding(), 'convict', 2).status, 'refused');
  assert.equal(f.api.pending().length, 1);
  f.state.balance = 0; assert.equal(f.api.uiModels.buyUiItem(f.actor, 'armor').status, 'refused');
  f.state.balance = 20; f.state.gate = 4; assert.equal(f.api.uiModels.buyUiItem(f.actor, 'armor').status, 'refused');
  f.state.gate = 0; assert.equal(f.api.uiModels.buyUiItem(f.actor, 'armor').status, 'success');
  assert.equal(f.state.purchases, 1);
});

test('banning an earlier accused never kicks the native successor in their cached slot', () => {
  const f = fixture(), id = f.fileReport(); f.state.engineIds.set(3, 'successor');
  assert.equal(f.api.uiModels.ruleUiReport(f.actor, id, f.api.reportsBinding(), 'ban', 0).status, 'success');
  assert.deepEqual(f.state.banCalls, ['accused']); assert.deepEqual(f.state.kicks, []);
});
test('a reconnect with the same SteamID invalidates the prior captured native connection', () => {
  const f = fixture(); assert.equal(f.api.uiModels.matchesUiActor(f.actor), true);
  f.state.userIds.set(2, 22);
  assert.equal(f.api.uiModels.matchesUiActor(f.actor), false);
  assert.equal(f.api.uiModels.getUiLogPage(f.actor, 0), null);
});
test('disconnect cleanup forwards the cached retiring actor after its native player disappears', () => {
  const f = fixture(), forgotten: unknown[] = [];
  f.api.bindTttHudProvider({forget:(actor:unknown)=>forgotten.push(actor)});
  // Engine disconnection precedes Core removing the still-connected registry row.
  f.state.engineIds.delete(2);
  f.api.getTttHud()!.forget(2);
  assert.equal(forgotten.length, 1);
  assert.equal((forgotten[0] as {steamId:string}).steamId, 'admin');
});
test('Panorama retains original catalog order when the copied chat view is price sorted',()=>{
 const f=fixture();f.state.shopRows=['tripwire','healthshot','armor'].map(id=>({id,nameKey:id,descriptionKey:'description',price:10,limit:1,gate:0}));
 const rows=f.api.uiModels.getUiShop(f.actor)!.rows;
 assert.deepEqual(Array.from(rows,row=>row.itemId),['armor','healthshot','tripwire']);
 assert.deepEqual(f.state.shopRows.map(row=>row.id),['tripwire','healthshot','armor']);
});

test('a retired report selection cannot rule a recycled ID from a new attachment',()=>{
 const f=fixture(),id=f.fileReport(),stamp=f.api.reportsBinding();f.state.reports.resetReports();f.api.bindReportsProvider(f.state.reports);const replacement=f.fileReport();assert.equal(replacement,id);
 assert.equal(f.api.uiModels.ruleUiReport(f.actor,id,stamp,'ban',0).status,'refused');assert.equal(f.api.pending().length,1);assert.deepEqual(f.state.banCalls,[]);
});
test('Reports replacement during ban acknowledgement never pardons the replacement owner',()=>{
 const f=fixture(),id=f.fileReport();let pardons=0;const replacement={...f.state.reports,pardon:()=>{pardons++;return 0;}};
 f.state.onBan=()=>f.api.bindReportsProvider(replacement);
 assert.equal(f.api.uiModels.ruleUiReport(f.actor,id,f.api.reportsBinding(),'ban',0).status,'unknown');assert.equal(pardons,0);assert.deepEqual(f.state.kicks,[]);
});

test('native report slay is admitted only for current positive debt, alive actor and pawn',()=>{
 const f=fixture();let slays=0;f.state.pawn={slay:()=>slays++};const accused={slot:3,steamId:'accused',generation:1,roundEpoch:8};
 assert.equal((f.api.reportCoreMethods as any).slayReportDebtor(accused),false);const id=f.fileReport();f.api.uiModels.ruleUiReport(f.actor,id,f.api.reportsBinding(),'convict',2);
 assert.equal((f.api.reportCoreMethods as any).slayReportDebtor(accused),true);assert.equal(slays,1);assert.equal(f.api.owedBy('accused'),2);
 f.state.alive=false;assert.equal((f.api.reportCoreMethods as any).slayReportDebtor(accused),false);assert.equal(slays,1);
});
test('report attachment retirement during pawn lookup cannot use a previously read debt',()=>{
 const f=fixture();let slays=0;f.state.pawn={slay:()=>slays++};const id=f.fileReport();f.api.uiModels.ruleUiReport(f.actor,id,f.api.reportsBinding(),'convict',2);
 f.state.onPawn=()=>f.api.bindReportsProvider(f.state.reports);assert.equal((f.api.reportCoreMethods as any).slayReportDebtor({slot:3,steamId:'accused',generation:1,roundEpoch:8}),false);assert.equal(slays,0);
});

function reportHud(f: ReturnType<typeof fixture>, shown = true) {
  const calls: unknown[][] = [];
  const hud = {
    openReportPrompt: (a: {slot:number}, name: string) => { calls.push(['prompt', a.slot, name]); return shown; },
    openReportPicker: (a: {slot:number}) => { calls.push(['picker', a.slot]); return shown; },
    reportNotice: (a: {slot:number}, n: {kind:string;title:string}) => { calls.push([n.kind, a.slot, n.title]); return shown; },
    forget: () => {},
  };
  f.api.bindTttHudProvider(hud);
  return calls;
}
test('a picker report runs through Core and Reports with only the reason in chat', () => {
  const f = fixture(), calls = reportHud(f); f.state.admin = false;
  const targets = f.api.uiModels.getUiReportTargets(f.actor)!;
  assert.deepEqual(Array.from(targets, (t) => [t.target.slot, t.name]), [[3, 'Accused']]);
  assert.equal(f.api.uiModels.beginUiReport(f.actor, targets[0]!.target), true);
  assert.deepEqual(calls, [['awaiting', 2, 'Reporting Accused']]);
  assert.equal(f.state.reports.captureSay(f.actor, 'shot me at spawn').consumed, true);
  assert.deepEqual(calls.at(-1), ['result', 2, 'Report filed']);
  assert.equal(f.api.pending().length, 1);
  assert.deepEqual([...f.state.announcements], []);
});
test('when the HUD cannot present a report step Reports tells the player in chat instead', () => {
  const f = fixture(); reportHud(f, false);
  const target = f.api.uiModels.getUiReportTargets(f.actor)![0]!.target;
  assert.equal(f.api.uiModels.beginUiReport(f.actor, target), true);
  assert.deepEqual([...f.state.announcements], ['RDM_ASK_CONTEXT']);
});
test('a retired target or a missing Reports owner cannot start a report', () => {
  const f = fixture(); reportHud(f);
  const target = f.api.uiModels.getUiReportTargets(f.actor)![0]!.target;
  f.state.generations.set(3, 2);
  assert.equal(f.api.uiModels.beginUiReport(f.actor, target), false);
  assert.equal(f.state.reports.captureSay(f.actor, 'ordinary chat').consumed, false);
});
