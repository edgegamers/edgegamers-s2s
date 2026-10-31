import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createUiModels, type UiModelOwner } from '../src/core/ui-model.ts';
import type { UiActor } from '../../../packages/contracts/ui-types.ts';

const actor: UiActor = { slot: 2, steamId: '76561198000000002', generation: 4, roundEpoch: 8 };
const other: UiActor = { slot: 5, steamId: '76561198000000005', generation: 1, roundEpoch: 8 };
function fixture() {
  let valid = true, admin = true, alive = true;
  const calls: string[] = [];
  const owner: UiModelOwner = {
    matchesActor: (a) => [actor, other].some((c) => (c === actor ? valid : true) && a.slot === c.slot && a.generation === c.generation && a.roundEpoch === c.roundEpoch && a.steamId === c.steamId),
    isAdmin: () => admin,
    canBuy: () => alive,
    shopStamp: () => ({mapEpoch:1,roundEpoch:actor.roundEpoch,state:2,role:2,alive:true,participating:true,shopBinding:1}),
    matchesShopStamp: () => true,
    shop: () => { calls.push('shop'); return { balance: 20, rows: [] }; },
    buy: () => { calls.push('buy'); return { status: 'success', title: 'Purchased', message: 'item', tone: 'good' }; },
    reports: () => { calls.push('reports'); return { rows: [], baseSlays: 2, maxQueued: 10 }; },
    rule: () => { calls.push('rule'); return { status: 'success', title: 'Guilty', message: '2 slays', tone: 'bad' }; },
    logPage: () => { calls.push('log'); return { rows: [{ a: 'secret' }], round: 3, count: 1 }; },
    actors: () => [actor],
    reportsAvailable: () => true,
    answerPrompt: (_slot, yes) => { calls.push(yes ? 'yes' : 'no'); return true; },
    reportTargets: () => { calls.push('targets'); return [{ target: other, name: 'Other' }]; },
    beginReport: (_slot, target) => { calls.push(`begin:${target}`); return true; },
  };
  return { owner,model: createUiModels(owner), calls, valid: (v: boolean) => { valid = v; }, admin: (v: boolean) => { admin = v; }, alive: (v: boolean) => { alive = v; } };
}
test('a retired connection or round can neither read private data nor spend or rule', () => {
  const f = fixture();
  for (const stale of [{ ...actor, generation: 3 }, { ...actor, roundEpoch: 7 }, { ...actor, steamId: 'replacement' }]) {
    assert.equal(f.model.getUiShop(stale), null);
    assert.equal(f.model.getUiReports(stale), null);
    assert.equal(f.model.getUiLogPage(stale, 0), null);
    assert.equal(f.model.buyUiItem(stale, 'armor').status, 'refused');
    assert.equal(f.model.ruleUiReport(stale, 1, 1, 'ban', 0).status, 'refused');
  }
  assert.deepEqual(f.calls, []);
});
test('revoking GENERIC access invalidates reads and actions immediately', () => {
  const f = fixture();
  assert.equal(f.model.getUiAdmins().length, 1);
  assert.equal(f.model.getUiLogPage(actor, 0)?.rows[0]?.a, 'secret');
  f.calls.length = 0; f.admin(false);
  assert.deepEqual(f.model.getUiAdmins(), []);
  assert.equal(f.model.getUiReports(actor), null);
  assert.equal(f.model.getUiLogPage(actor, 0), null);
  assert.equal(f.model.ruleUiReport(actor, 1, 1, 'convict', 2).status, 'refused');
  assert.deepEqual(f.calls, []);
});
test('death closes the action gate even with a current connection and HUD', () => {
  const f = fixture(); f.alive(false);
  assert.equal(f.model.buyUiItem(actor, 'armor').status, 'refused');
  assert.deepEqual(f.calls, []);
});
test('malformed navigation and sanction payloads never reach their owner', () => {
  const f = fixture();
  for (const at of [NaN, Infinity, -1, 0.5]) assert.equal(f.model.getUiLogPage(actor, at), null);
  for (const slays of [NaN, Infinity, -1, 0.5]) assert.equal(f.model.ruleUiReport(actor, 1, 1, 'convict', slays).status, 'refused');
  assert.equal(f.model.ruleUiReport(actor, 0, 1, 'ban', 0).status, 'refused');
  assert.deepEqual(f.calls, []);
});
test('the current authorized actor reaches the existing owner once per decision', () => {
  const f = fixture();
  assert.equal(f.model.buyUiItem(actor, 'armor').status, 'success');
  assert.equal(f.model.ruleUiReport(actor, 1, 1, 'convict', 2).status, 'success');
  assert.deepEqual(f.calls, ['buy', 'rule']);
});

test('private report rows are discarded when access retires during the owner read',()=>{
 const f=fixture();f.owner.reports=()=>{f.admin(false);return {rows:[],baseSlays:2,maxQueued:10};};assert.equal(f.model.getUiReports(actor),null);
 const g=fixture();g.owner.reports=()=>{g.valid(false);return {rows:[],baseSlays:2,maxQueued:10};};assert.equal(g.model.getUiReports(actor),null);
});

test('private shop rows are discarded when actor identity retires during its owner read',()=>{
 const f=fixture();f.owner.shop=()=>{f.valid(false);return {balance:20,rows:[]};};
 assert.equal(f.model.getUiShop(actor),null);
});

test('player report models need only a current connection, never admin access', () => {
  const f = fixture(); f.admin(false);
  assert.equal(f.model.answerUiReportPrompt(actor, true), true);
  assert.deepEqual(f.model.getUiReportTargets(actor), [{ target: other, name: 'Other' }]);
  assert.equal(f.model.beginUiReport(actor, other), true);
  assert.deepEqual(f.calls, ['yes', 'targets', 'begin:5']);
});
test('stale reporters, stale or self targets and malformed answers never reach Reports', () => {
  const f = fixture();
  assert.equal(f.model.beginUiReport(actor, { ...other, generation: 2 }), false);
  assert.equal(f.model.beginUiReport(actor, actor), false);
  assert.equal(f.model.beginUiReport(actor, null as unknown as UiActor), false);
  assert.equal(f.model.answerUiReportPrompt(actor, 'yes' as unknown as boolean), false);
  f.valid(false);
  assert.equal(f.model.answerUiReportPrompt(actor, false), false);
  assert.equal(f.model.getUiReportTargets(actor), null);
  assert.equal(f.model.beginUiReport(actor, other), false);
  assert.deepEqual(f.calls, []);
});
test('the picker is withheld while Reports is absent or the reporter retires during the read', () => {
  const f = fixture(); f.owner.reportsAvailable = () => false;
  assert.equal(f.model.getUiReportTargets(actor), null);
  const g = fixture(); g.owner.reportTargets = () => { g.valid(false); return [{ target: other, name: 'Other' }]; };
  assert.equal(g.model.getUiReportTargets(actor), null);
});
