import assert from 'node:assert/strict';
import { test } from 'node:test';
import vm from 'node:vm';
import { buildSync } from 'esbuild';

const bundle = path => buildSync({ entryPoints: [path], bundle: true, write: false,
  platform: 'neutral', format: 'cjs', external: ['@s2script/*'] }).outputFiles[0].text;
const effectsCode = bundle('src/effects.ts'), configCode = bundle('src/config.ts');
const plain = value => JSON.parse(JSON.stringify(value));

// Only the native SDK boundary is doubled; every decision runs the bundled effects module.
function fixture() {
  const events = new Map(), messages = new Map(), commands = new Map(), players = new Map();
  const damageHooks = new Map(), spawns = [], writes = [], sounds = [], cvars = new Map([['mp_teammates_are_enemies', '0']]);
  let cfg, owner = false, serial = 1, tick = 10, recipients, disposed = false;
  const subscribe = (map, name, handler) => {
    const list = map.get(name) ?? []; list.push(handler); map.set(name, list);
  };
  const scope = {
    events: { onPre: (n, h) => subscribe(events, n, h), on: (n, h) => subscribe(events, n, h) },
    clients: { onDisconnect() {} },
    entities: { onSpawn: (_n, h) => spawns.push(h), onCreate: (_n, h) => spawns.push(h) },
    server: { onGameFrame() {} },
    dispose() { disposed = true; events.clear(); spawns.length = 0; },
  };
  const sdk = {
    HookResult: { Continue: 0, Changed: 1, Handled: 2, Stop: 3 },
    createScope: () => scope, hook: scope.events,
    command: { onClientCommand: (n, h) => subscribe(commands, n, h) },
    UserMessages: { onPre: (n, h) => subscribe(messages, n, h), off: n => messages.delete(n) },
    Events: { setRecipients: slots => { recipients = [...slots]; } },
    Clients: { all: () => [...players.values()].map(p => p.client), fromSlot: s => players.get(s)?.client ?? null },
    Server: { getCvar: n => cvars.get(n) ?? '1', setCvar(n, v) { writes.push([n, v]); cvars.set(n, String(Number.isFinite(Number(v)) ? Number(v) : v)); return true; },
      get mapName() { return 'de_dust2'; }, get gameTime() { return tick / 64; }, get tickCount() { return tick; } },
    Sound: { emit: name => { sounds.push(name); return 1; } },
    SDKHook: (ref, type, fn) => { damageHooks.set(`${ref.id}:${type}`, fn); return true; },
    SDKUnhook: (ref, type) => damageHooks.delete(`${ref.id}:${type}`),
    SDKHookType: { OnTakeDamage: 'OnTakeDamage', OnTakeDamagePost: 'OnTakeDamagePost' },
  };
  const cs2 = { Player: { fromSlot: s => players.get(s) ?? null, allConnected: () => [...players.values()] },
    PlayerConnectedState: { Disconnecting: 3 } };
  const load = code => {
    const module = { exports: {} };
    vm.runInNewContext(code, { module, exports: module.exports, require: name => name === '@s2script/cs2' ? cs2 : sdk });
    return module.exports;
  };
  const { parseConfig } = load(configCode); cfg = parseConfig({});
  const api = load(effectsCode).createEffects(() => cfg, () => owner);
  function add(slot, team = 2, bot = false) {
    const ref = index => ({ index, id: serial++, valid: true, isValid() { return this.valid; } });
    const controller = ref(slot + 1), pawn = ref(100 + slot), userId = serial++;
    const p = { slot, userId, teamNum: team, connected: 0, ref: controller, musicKitID: 12,
      pawn: { ref: pawn, isValid: true }, client: { slot, userId, isBot: bot, isValid: () => players.get(slot) === p } };
    players.set(slot, p); for (const fn of spawns) fn(pawn, 'player');
    return p;
  }
  function event(name, fields = {}) {
    recipients = undefined;
    const e = { getInt: n => fields[n] ?? 0, getPlayerSlot: n => fields[n] ?? -1,
      getString: n => String(fields[n] ?? ''), getBool: n => Boolean(fields[n]),
      setInt: (n, v) => { fields[n] = v; }, setBool: (n, v) => { fields[n] = v; } };
    const result = Math.max(0, ...(events.get(name) ?? []).map(h => h(e) ?? 0));
    return { result, fields, recipients };
  }
  function message(name, fields = {}) {
    const m = { name, recipients: [0, 1, 2],
      readInt: n => typeof fields[n] === 'number' ? fields[n] : null,
      readString: n => typeof fields[n] === 'string' ? fields[n] : null,
      readStrings: n => Array.isArray(fields[n]) ? fields[n] : null,
      setInt(n, v) { fields[n] = v; return true; } };
    return { result: Math.max(0, ...(messages.get(name) ?? []).map(h => h(m) ?? 0)), fields };
  }
  return { api, players, commands, cvars, writes, sounds, messages, add, event, message,
    setConfig: value => { cfg = parseConfig(value); }, get config() { return cfg; },
    set owner(value) { owner = value; }, get disposed() { return disposed; },
    nextTick() { tick++; },
    command(name, slot) { return Math.max(0, ...(commands.get(name) ?? []).map(h => h(slot, '') ?? 0)); },
    damage(attacker, victim, damageType = 4) {
      const info = { attacker: attacker.pawn.ref, victim: victim.pawn.ref, inflictor: attacker.pawn.ref, damageType, damage: 20 };
      damageHooks.get(`${victim.pawn.ref.id}:OnTakeDamage`)?.(info);
    },
    replace(slot) { const p = players.get(slot); p.ref.valid = false; p.pawn.ref.valid = false; return add(slot); },
  };
}

test('all native switches default off and registration is stable across reloads', () => {
  const f = fixture(); f.add(0); f.api.register(); f.api.apply();
  assert.equal(f.writes.length, 0);
  assert.equal(f.command('coverme', 0), 0); assert.equal(f.command('player_ping', 0), 0);
  assert.equal(f.message('CUserMessageTextMsg', { param: ['#Pet_Killed'] }).result, 0);
  assert.equal(f.event('player_team').result, 0); assert.equal(f.event('round_end').result, 0);
  f.setConfig({ radio: { players: true } }); f.api.apply();
  assert.equal(f.command('coverme', 0), 2);
  f.setConfig({}); f.api.apply(); assert.equal(f.command('coverme', 0), 0);
});

test('player and bot radio, wheel and full ping blocking remain independent', () => {
  const f = fixture(); f.add(0); f.add(1, 2, true); f.api.register();
  f.setConfig({ radio: { players: true, wheel: true, pings: 'all' } });
  for (const name of ['coverme', 'go_a', 'deathcry']) {
    assert.equal(f.command(name, 0), 2); assert.equal(f.command(name, 1), 0);
  }
  assert.equal(f.command('coverme', -1), 0);
  assert.equal(f.command('playerchatwheel', 0), 2); assert.equal(f.command('player_ping', 0), 2);
  f.setConfig({ radio: { bots: true } }); f.api.apply();
  assert.equal(f.cvars.get('bot_chatter'), 'off');
  assert.equal(f.command('coverme', 0), 0); assert.equal(f.command('coverme', 1), 2);
});

test('sound-only ping suppresses only its broadcast and preserves command and marker processing', () => {
  const f = fixture(); f.add(0); f.api.register(); f.setConfig({ radio: { pings: 'sound' } });
  assert.equal(f.command('player_ping', 0), 0);
  const e = f.event('player_ping', { userid: 0, x: 200, urgent: true });
  assert.equal(e.result, 2); assert.equal(e.fields.x, 200); assert.equal(e.fields.urgent, true);
});

test('map chat filtering targets only map SayText and uses exact/prefix/ANY precedence', () => {
  const f = fixture(); f.api.register();
  f.setConfig({ messages: { map: { enabled: true, mode: 'filter', rules: [
    { map: 'ANY', words: ['global'] }, { map: 'de_', words: ['prefix'] }, { map: 'DE_DUST2', words: ['blocked'] },
  ] } } });
  const send = text => f.message('CUserMessageSayText', { playerindex: -1, text }).result;
  assert.equal(send('A BLOCKED map advert'), 2); assert.equal(send('global prefix ordinary'), 0);
  assert.equal(f.message('CUserMessageSayText', { playerindex: 1, text: 'blocked' }).result, 0);
  f.setConfig({ messages: { map: { enabled: true, mode: 'all' } } }); assert.equal(send('anything'), 2);
  f.setConfig({ messages: { map: { enabled: true, mode: 'filter', rules: [{ map: 'de_', words: ['prefix'] }, { map: 'ANY', words: ['global'] }] } } });
  assert.equal(send('prefix'), 2); assert.equal(send('global'), 0);
  f.setConfig({ messages: { map: { enabled: true, mode: 'filter', rules: [{ map: 'ANY', words: ['global'] }] } } });
  assert.equal(send('global'), 2);
});

test('custom filters inspect actual repeated TextMsg/RadioText fields and scalar HintText only', () => {
  const f = fixture(); f.api.register();
  f.setConfig({ messages: { custom: { enabled: true, text: ['bad text'], radio: ['bad radio'], hint: ['bad hint'] } } });
  assert.equal(f.message('CUserMessageTextMsg', { param: ['name', 'bad text'] }).result, 2);
  assert.equal(f.message('CCSUsrMsg_RadioText', { params: ['name', 'bad radio'] }).result, 2);
  assert.equal(f.message('CCSUsrMsg_HintText', { message: 'bad hint' }).result, 2);
  assert.equal(f.message('CUserMessageTextMsg', { param: ['bad text extra'] }).result, 0);
  assert.equal(f.message('CCSUsrMsg_RadioText', { params: ['unrelated'], msg_name: 'bad radio' }).result, 0);
  assert.equal(f.message('CCSUsrMsg_HintText', { message: 'unrelated' }).result, 0);
  f.setConfig({ messages: { custom: { enabled: false, text: ['bad text'] } } });
  assert.equal(f.message('CUserMessageTextMsg', { param: ['bad text'] }).result, 0);
});

test('stock money, team attack, saved and chicken notifications are independent and pass other text', () => {
  const f = fixture(); f.api.register();
  const cases = [['money', '#Player_Cash_Award_Killed_Enemy'], ['money', '#Team_Cash_Award_Loser_Bonus'],
    ['teamAttack', '#Cstrike_TitlesTXT_Hint_careful_around_teammates'], ['saved', '#Chat_SavePlayer_Savior'], ['chicken', '#Pet_Killed']];
  for (const [flag, token] of cases) {
    f.setConfig({ messages: { [flag]: true } });
    assert.equal(f.message('CUserMessageTextMsg', { param: ['name', token] }).result, 2, token);
    assert.equal(f.message('CUserMessageTextMsg', { param: ['#Other', 'ordinary'] }).result, 0);
  }
  f.setConfig({ messages: { teamAttack: true } });
  assert.equal(f.message('CCSUsrMsg_HintText', { message: '#SFUI_Notice_Killed_Teammate' }).result, 2);
});

test('team joins, disconnect text, and bomb HUD broadcasts suppress independently', () => {
  const f = fixture(); f.api.register();
  for (const [config, name] of [[{ teamJoin: true }, 'player_team'], [{ disconnect: 'text' }, 'player_disconnect'], [{ bombPlanted: true }, 'bomb_planted']]) {
    f.setConfig({ messages: config }); assert.equal(f.event(name).result, 2);
    assert.equal(f.event(name === 'bomb_planted' ? 'player_team' : 'bomb_planted').result, 0);
  }
});

test('disconnect icon suppression targets disconnect deaths and preserves normal combat deaths', () => {
  const f = fixture(); const p = f.add(0); f.api.register(); f.setConfig({ messages: { disconnect: 'all' } });
  p.connected = 3;
  assert.equal(f.event('player_death', { userid: 0, attacker: -1, weapon: 'world' }).result, 2);
  assert.equal(f.event('player_death', { userid: 0, attacker: 1, weapon: 'ak47' }).result, 0);
  p.connected = 0;
  assert.equal(f.event('player_death', { userid: 0, attacker: -1, weapon: 'world' }).result, 0);
  f.setConfig({ messages: { disconnect: 'text' } }); p.connected = 3;
  assert.equal(f.event('player_death', { userid: 0, attacker: -1 }).result, 0);
});

test('plant/defuse filters read every radio parameter without suppressing unrelated radio', () => {
  const f = fixture(); f.api.register();
  f.setConfig({ messages: { planting: true } });
  assert.equal(f.message('CCSUsrMsg_RadioText', { params: ['player', '#Cstrike_TitlesTXT_Planting_Bomb'] }).result, 2);
  assert.equal(f.message('CCSUsrMsg_RadioText', { params: ['#Cstrike_TitlesTXT_Defusing_Bomb'] }).result, 0);
  f.setConfig({ messages: { defusing: true } });
  assert.equal(f.message('CCSUsrMsg_RadioText', { params: ['player', '#Cstrike_TitlesTXT_Defusing_Bomb'] }).result, 2);
  assert.equal(f.message('CCSUsrMsg_RadioText', { params: ['unrelated'] }).result, 0);
});

test('native cvar features apply independently and restore canonical readback values', () => {
  const f = fixture(); f.api.register();
  f.cvars.set('sv_ignoregrenaderadio', '0'); f.cvars.set('sv_disable_radar', '0');
  f.cvars.set('sv_footsteps', '1'); f.cvars.set('sv_min_jump_landing_sound', '1');
  f.setConfig({ radio: { grenades: true }, hud: { radar: true }, sounds: { footsteps: true, landing: true } }); f.api.apply();
  for (const [name, value] of [['sv_ignoregrenaderadio', '1'], ['sv_disable_radar', '1'], ['sv_footsteps', '0'], ['sv_min_jump_landing_sound', '999999']]) assert.equal(f.cvars.get(name), value);
  f.setConfig({}); f.api.apply();
  assert.equal(f.cvars.get('sv_ignoregrenaderadio'), '0'); assert.equal(f.cvars.get('sv_disable_radar'), '0');
  assert.equal(f.cvars.get('sv_footsteps'), '1'); assert.equal(f.cvars.get('sv_min_jump_landing_sound'), '1');
});

test('cvar restoration preserves intervening edits and later ownership uses the new baseline', () => {
  const f = fixture(); f.api.register(); f.cvars.set('sv_disable_radar', '0');
  f.setConfig({ hud: { radar: true } }); f.api.apply();
  assert.equal(f.cvars.get('sv_disable_radar'), '1');
  f.cvars.set('sv_disable_radar', '9'); f.setConfig({}); f.api.apply(); assert.equal(f.cvars.get('sv_disable_radar'), '9');
  f.setConfig({ hud: { radar: true } }); f.api.apply(); f.api.dispose(); assert.equal(f.cvars.get('sv_disable_radar'), '9');
});

test('team overhead all/walls/distance modes apply native cvars and release old mode assignments', () => {
  const f = fixture(); f.api.register(); f.cvars.set('sv_teamid_overhead', '1'); f.cvars.set('sv_teamid_overhead_always_prohibit', '0'); f.cvars.set('sv_teamid_overhead_maxdist', '4000');
  f.setConfig({ hud: { teamTags: { mode: 'all' } } }); f.api.apply(); assert.equal(f.cvars.get('sv_teamid_overhead'), '0');
  f.setConfig({ hud: { teamTags: { mode: 'walls' } } }); f.api.apply();
  assert.equal(f.cvars.get('sv_teamid_overhead'), '1'); assert.equal(f.cvars.get('sv_teamid_overhead_always_prohibit'), '1'); assert.equal(f.cvars.get('sv_teamid_overhead_maxdist'), '0');
  f.setConfig({ hud: { teamTags: { mode: 'distance', distance: 150 } } }); f.api.apply(); assert.equal(f.cvars.get('sv_teamid_overhead_maxdist'), '150');
  f.setConfig({}); f.api.apply(); assert.equal(f.cvars.get('sv_teamid_overhead_maxdist'), '4000'); assert.equal(f.cvars.get('sv_teamid_overhead_always_prohibit'), '0');
});

test('killfeed policy intersects supplied recipients and standalone death hook defers to an owner', () => {
  const f = fixture(); f.add(0); f.add(1); f.api.register(); const incoming = [1, 2];
  assert.deepEqual(plain(f.api.filterKillfeed(0, incoming)), [1, 2]);
  f.setConfig({ hud: { killfeed: 'self' } }); assert.deepEqual(plain(f.api.filterKillfeed(0, incoming)), []);
  assert.deepEqual(plain(f.api.filterKillfeed(1, incoming)), [1]); assert.deepEqual(incoming, [1, 2]);
  const death = f.event('player_death', { userid: 1, attacker: 0 }); assert.equal(death.result, 2); assert.deepEqual(death.recipients, [0]);
  f.owner = true; assert.equal(f.event('player_death', { userid: 1, attacker: 0 }).result, 0);
  assert.deepEqual(plain(f.api.filterKillfeed(1, incoming)), [1]);
  f.setConfig({ hud: { killfeed: 'all' } }); assert.deepEqual(plain(f.api.filterKillfeed(1, incoming)), []);
});

test('gunshot modes edit only sound fields and never suppress the bullet message', () => {
  const f = fixture(); f.api.register();
  const original = { weapon_id: 7, sound_type: 2, item_def_index: 7, seed: 41, spread: .2, player: 5, extra: { attack_tick_count: 100 }, origin: { x: 2, y: 3, z: 4 } };
  for (const [mode, expected] of [['off', {}], ['mute', { sound_type: 0 }], ['m4', { weapon_id: 0, sound_type: 9, item_def_index: 60 }], ['usp', { weapon_id: 0, sound_type: 9, item_def_index: 61 }], ['custom', { weapon_id: 99, sound_type: 3, item_def_index: 88 }]]) {
    f.setConfig({ sounds: { gunshots: mode, replacement: { weaponId: 99, soundType: 3, itemDefIndex: 88 } } });
    const sent = f.message('CMsgTEFireBullets', structuredClone(original));
    assert.ok(sent.result < 2, mode); assert.deepEqual(sent.fields, { ...original, ...expected }, mode);
  }
});

test('custom sound event filters support hashes and names globally, including world sources', () => {
  const f = fixture(); f.api.register(); f.setConfig({ sounds: { custom: { enabled: true, events: ['123456', 'Weapon_Test'] } } });
  assert.equal(f.message('CMsgSosStartSoundEvent', { soundevent_hash: 123456, source_entity_index: 0 }).result, 2);
  assert.equal(f.message('CCSUsrMsg_WeaponSound', { sound: 'weapon_test.fire', entidx: 0 }).result, 2);
  assert.equal(f.message('CMsgSosStartSoundEvent', { soundevent_hash: 987, source_entity_index: 0 }).result, 0);
  assert.equal(f.message('CCSUsrMsg_WeaponSound', { sound: 'Other.fire', entidx: 0 }).result, 0);
  f.setConfig({ sounds: { custom: { enabled: false, events: ['123456'] } } }); assert.equal(f.message('CMsgSosStartSoundEvent', { soundevent_hash: 123456 }).result, 0);
});

test('all knife mode uses verified default hashes/names and supports configured replacements', () => {
  const f = fixture(); f.api.register(); f.setConfig({ sounds: { knife: 'all' } });
  assert.equal(f.message('CMsgSosStartSoundEvent', { soundevent_hash: 3756387178, source_entity_index: 0 }).result, 2);
  assert.equal(f.message('CCSUsrMsg_WeaponSound', { sound: 'Weapon_Knife.Hit.Heavy', entidx: 100 }).result, 2);
  assert.equal(f.message('CMsgSosStartSoundEvent', { soundevent_hash: 123, source_entity_index: 0 }).result, 0);
  f.setConfig({ sounds: { knife: 'all', knifeEvents: ['custom.knife'] } });
  assert.equal(f.message('CCSUsrMsg_WeaponSound', { sound: 'Custom.Knife.Hit', entidx: 100 }).result, 2);
  assert.equal(f.message('CMsgSosStartSoundEvent', { soundevent_hash: 3756387178 }).result, 0);
});

test('team knife sounds require same-tick source-attributed damage, valid identities and actual team hits', () => {
  const f = fixture(); const a = f.add(0), teammate = f.add(1), enemy = f.add(2, 3), other = f.add(3); f.api.register();
  f.setConfig({ sounds: { knife: 'team' } });
  const sound = p => f.message('CMsgSosStartSoundEvent', { soundevent_hash: 3756387178, source_entity_index: p.pawn.ref.index }).result;
  f.damage(a, teammate); assert.equal(sound(a), 2); assert.equal(sound(other), 0);
  assert.equal(f.message('CMsgSosStartSoundEvent', { soundevent_hash: 2486534908, source_entity_index: a.pawn.ref.index }).result, 0);
  f.nextTick(); assert.equal(sound(a), 0);
  f.damage(a, enemy); assert.equal(sound(a), 0);
  f.damage(a, teammate, 2); assert.equal(sound(a), 0);
  f.damage(a, teammate); f.replace(0); assert.equal(sound(f.players.get(0)), 0);
  f.damage(other, teammate); f.cvars.set('mp_teammates_are_enemies', '1'); assert.equal(sound(other), 0);
});

test('music modes preserve event fields and restore only still-owned controller assignments', () => {
  const f = fixture(); const p = f.add(0); f.api.register(); f.setConfig({ sounds: { music: 'mvp' } });
  const mvp = f.event('round_mvp', { userid: 0, reason: 3, nomusic: 0 });
  assert.ok(mvp.result < 2); assert.equal(mvp.fields.nomusic, 1); assert.equal(mvp.fields.reason, 3); assert.equal(p.musicKitID, 0);
  assert.equal(f.event('round_end', { nomusic: 0 }).fields.nomusic, 0);
  f.setConfig({}); f.api.apply(); assert.equal(p.musicKitID, 12);
  f.setConfig({ sounds: { music: 'all' } });
  assert.equal(f.event('round_end', { nomusic: 0, winner: 2 }).fields.nomusic, 1);
  assert.equal(f.event('round_mvp', { userid: 0, nomusic: 0 }).fields.nomusic, 1);
  assert.ok(f.sounds.includes('StopSoundEvents.StopAllMusic'));
  p.musicKitID = 44; f.api.dispose(); assert.equal(p.musicKitID, 44);
});

test('map reset clears native ownership and damage correlation; dispose deactivates command listeners', () => {
  const f = fixture(); const a = f.add(0), b = f.add(1); f.api.register(); f.cvars.set('sv_disable_radar', '0');
  f.setConfig({ hud: { radar: true }, radio: { players: true }, sounds: { knife: 'team' } }); f.api.apply(); f.damage(a, b); f.api.reset();
  assert.equal(f.cvars.get('sv_disable_radar'), '0');
  assert.equal(f.message('CMsgSosStartSoundEvent', { soundevent_hash: 3756387178, source_entity_index: a.pawn.ref.index }).result, 0);
  f.api.apply(); assert.equal(f.cvars.get('sv_disable_radar'), '1');
  f.api.dispose(); assert.equal(f.cvars.get('sv_disable_radar'), '0'); assert.equal(f.command('coverme', 0), 0);
});
