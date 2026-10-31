import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync } from 'node:fs';
import { EventBus } from '../../../plugins/core/src/core/bus.ts';
const bridgePath = new URL('../../../plugins/core/src/core/ordered.ts', import.meta.url);
const adapterPath = new URL('../ordered.ts', import.meta.url);
async function api() { assert.ok(existsSync(bridgePath), 'ordered coordinator is implemented'); assert.ok(existsSync(adapterPath), 'local feature adapter is implemented'); return { ...await import(bridgePath.href), ...await import(adapterPath.href) }; }
function copied(remote) { return { getHandlers: () => structuredClone(remote.getHandlers()), handleDomain: call => structuredClone(remote.handleDomain(structuredClone(call))) }; }
function oldTrace() { const bus = new EventBus(), out = []; bus.on('damage', e => { out.push('karma:' + e.canceled + ':' + e.damage); }); bus.on('damage', e => { out.push('economy'); e.canceled = true; e.damage = 7; }, { priority: 40 }); bus.on('damage', e => { out.push('effects'); throw Error('fixture'); }, { priority: 40 }); bus.on('damage', e => { out.push('special'); }, { priority: 10 }); bus.on('damage', e => { out.push('handlers'); }, { priority: 10 }); bus.on('damage', e => out.push('icons:' + e.canceled), { priority: 1000 }); const ev = bus.emit('damage', { slot: 1, attacker: 2, damage: 30, weapon: 'taser', canceled: false }); return { out, ev }; }
test('copied remote and local callbacks preserve priority, old install ties and canceled observers', async () => {
    const { createOrderedCoordinator, createFeatureAdapter } = await api();
    const c = createOrderedCoordinator({ log: () => { } }), out = [];
    c.forModule('icons').on('damage', e => out.push('icons:' + e.canceled), { priority: 1000 });
    const karma = createFeatureAdapter('karma', { emit: event => c.dispatchDomain(event), log: () => { } });
    karma.bus.on('damage', e => out.push('karma:' + e.canceled + ':' + e.damage));
    c.attach('karma', copied(karma));
    c.forModule('effects').on('damage', e => { out.push('effects'); throw Error('fixture'); }, { priority: 40 });
    c.forModule('handlers').on('damage', () => out.push('handlers'), { priority: 10 });
    c.forModule('economy').on('damage', e => { out.push('economy'); e.canceled = true; e.damage = 7; }, { priority: 40 });
    c.forModule('special').on('damage', () => out.push('special'), { priority: 10 });
    const ev = c.bus.emit('damage', { slot: 1, attacker: 2, damage: 30, weapon: 'taser', canceled: false });
    assert.deepEqual({ out, ev }, oldTrace());
});
test('feature adapter returns mutation made before throw; next local observer sees it', async () => { const { createOrderedCoordinator, createFeatureAdapter } = await api(); const c = createOrderedCoordinator({ log: () => { } }); const k = createFeatureAdapter('karma', { emit: e => c.dispatchDomain(e), log: () => { } }); k.bus.on('roleAssigning', e => { e.role = 4; e.canceled = true; throw Error('after mutation'); }, { priority: 40 }); c.attach('karma', copied(k)); const ev = { slot: 1, role: 2, canceled: false }; assert.equal(c.bus.emit('roleAssigning', ev), ev); assert.deepEqual(ev, { slot: 1, role: 4, canceled: true }); });
test('canceled game state skips opted-in remote rows; precommit reads stay unchanged', async () => { const { createOrderedCoordinator, createFeatureAdapter } = await api(); const c = createOrderedCoordinator({ log: () => { } }), seen = [], game = { state: 1 }; c.forModule('bootstrap').on('gameState', e => { seen.push(game.state); e.canceled = true; }, { priority: 10 }); const k = createFeatureAdapter('karma', { emit: e => c.dispatchDomain(e), log: () => { } }); k.bus.on('gameState', e => seen.push('karma:' + game.state)); c.attach('karma', copied(k)); c.forModule('icons').on('gameState', () => seen.push('icons'), { ignoreCanceled: true }); const ev = c.bus.emit('gameState', { state: 2, canceled: false }); if (!ev.canceled)
    game.state = 2; assert.deepEqual(seen, [1, 'karma:1']); assert.equal(game.state, 1); });
test('body DNA copyback preserves actual owner object before next operation', async () => { const { createOrderedCoordinator, createFeatureAdapter } = await api(); const c = createOrderedCoordinator({ log: () => { } }); const a = createFeatureAdapter('effects', { emit: e => c.dispatchDomain(e), log: () => { } }); a.bus.on('bodyCreate', e => { e.body.dnaSuppressed = true; }); c.attach('items', copied(a)); const body = { dnaSuppressed: false, identified: false }; const ev = { body, canceled: false }; c.bus.emit('bodyCreate', ev); assert.equal(ev.body, body); assert.equal(body.dnaSuppressed, true); assert.equal(body.identified, false); });
test('nested remote emit finishes before outer observer and does not overwrite outer payload', async () => { const { createOrderedCoordinator, createFeatureAdapter } = await api(); const c = createOrderedCoordinator({ log: () => { } }), seen = []; const a = createFeatureAdapter('karma', { emit: e => c.dispatchDomain(e), log: () => { } }); a.bus.on('damage', e => { const k = a.bus.emit('karma', { slot: e.attacker, oldKarma: 100, karma: 95, canceled: false }); seen.push('after:' + k.karma); }); a.bus.on('karma', e => { seen.push('enforce'); e.karma = 90; }, { priority: 1000, ignoreCanceled: true }); c.attach('karma', copied(a)); c.forModule('icons').on('damage', e => seen.push('monitor:' + e.damage), { priority: 1000 }); c.bus.emit('damage', { slot: 1, attacker: 2, damage: 15, weapon: 'ak47', canceled: false }); assert.deepEqual(seen, ['enforce', 'after:90', 'monitor:15']); });
test('detach/replacement during dispatch cannot substitute new handler into old snapshot', async () => { const { createOrderedCoordinator, createFeatureAdapter } = await api(); const c = createOrderedCoordinator({ log: () => { } }), seen = []; const first = createFeatureAdapter('karma', { emit: e => c.dispatchDomain(e), log: () => { } }); first.bus.on('damage', () => seen.push('old')); let attachment = c.attach('karma', copied(first)); let swapped = false; c.forModule('handlers').on('damage', () => { if (swapped)
    return; swapped = true; attachment.dispose(); const second = createFeatureAdapter('karma', { emit: e => c.dispatchDomain(e), log: () => { } }); second.bus.on('damage', () => seen.push('new')); attachment = c.attach('karma', copied(second)); }, { priority: 10 }); const ev = { slot: 1, attacker: 2, damage: 1, weapon: '', canceled: false }; c.bus.emit('damage', ev); c.bus.emit('damage', ev); assert.deepEqual(seen, ['old', 'new']); });
test('reject unknown, duplicate, foreign ownership and changed priority registrations', async () => { const { createOrderedCoordinator, createFeatureAdapter } = await api(); const c = createOrderedCoordinator({ log: () => { } }); const k = createFeatureAdapter('karma', { emit: e => c.dispatchDomain(e), log: () => { } }); assert.throws(() => k.bus.on('damage', () => { }, { priority: 10 }), /priority|registration/i); k.bus.on('damage', () => { }); assert.throws(() => k.bus.on('damage', () => { }), /duplicate/i); assert.throws(() => c.attach('karma', { getHandlers: () => ['effects.damage'], handleDomain: () => { } }), /owner|registration/i); assert.throws(() => c.attach('karma', { getHandlers: () => ['evil'], handleDomain: () => { } }), /unknown|registration/i); c.attach('karma', copied(k)); assert.throws(() => c.attach('karma', copied(k)), /duplicate/i); });
test('actual old taser callbacks retain reward, scan, guilt bookkeeping and icon ordering across copies', async () => {
    const { readFileSync } = await import('node:fs');
    const vm = await import('node:vm');
    const ts = await import('typescript');
    const { createOrderedCoordinator, createFeatureAdapter } = await api();
    const fixture = JSON.parse(readFileSync(new URL('./fixtures/old-damage-handlers.json', import.meta.url), 'utf8'));
    function trace(distributed) {
        const out = [], c = distributed ? createOrderedCoordinator({ log: () => { } }) : undefined, old = new EventBus();
        const ctx = { GameState: { InProgress: 2, Finished: 3 }, game: { state: 2 }, inWarmup: () => false, inProgress: () => true,
            isActive: () => false, RIFLES: new Set(), addBalance: (slot, n) => out.push('credit:' + n), noteDamage: () => out.push('aggressor'),
            pawnOf: () => ({ health: 50 }), setHealth: () => out.push('health'), roleName: () => 'Traitor',
            reg: { roleOf: () => 2, nameOf: () => 'victim' }, tell: (slot, msg) => out.push(msg), msgFor: (slot, key) => key,
            hasStickers: { 1: 1 }, stickers: { 1: 1 }, MAX_SLOTS: 64, revealRole: () => out.push('reveal-role'), revealIconToAll: () => out.push('reveal-icon') };
        const installOrder = ['installKarma', 'installEconomy', 'installEffects', 'installSpecialRounds', 'installHandlers', 'installIcons'];
        const group = { installKarma: 'karma', installEconomy: 'economy', installEffects: 'effects', installSpecialRounds: 'special', installHandlers: 'handlers', installIcons: 'icons' };
        for (const install of installOrder) {
            const r = fixture.handlers.find(r => r.install === install), exports = {};
            const js = ts.transpileModule('export const handler = ' + r.handler, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
            vm.runInNewContext(js, { ...ctx, exports });
            const opts = { priority: { karma: 60, economy: 40, effects: 40, special: 10, handlers: 10, icons: 1000 }[group[install]] };
            const fn = e => { out.push(group[install]); exports.handler(e); };
            if (distributed && install === 'installKarma') {
                const adapter = createFeatureAdapter('karma', { emit: e => c.dispatchDomain(e), log: () => { } });
                adapter.bus.on('damage', fn, opts);
                c.attach('karma', copied(adapter));
            }
            else
                (distributed ? c.forModule(group[install]) : old).on('damage', fn, opts);
        }
        const ev = (distributed ? c.bus : old).emit('damage', { slot: 2, attacker: 1, damage: 90, weapon: 'weapon_taser', canceled: false });
        return { out, canceled: ev.canceled, damage: ev.damage };
    }
    assert.deepEqual(trace(true), trace(false));
    assert.deepEqual(trace(true), { out: ['special', 'handlers', 'economy', 'credit:30', 'effects', 'TASER_SCANNED', 'SHOP_ITEM_STICKERS_HIT', 'reveal-role', 'karma', 'aggressor', 'icons', 'reveal-icon'], canceled: true, damage: 90 });
});
