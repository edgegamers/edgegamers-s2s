import assert from 'node:assert/strict';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import {buildSync} from 'esbuild';
import {SPECS} from '../../shop/src/settings-specs.ts';
import {SPECS as coreSpecs,CANONICAL_FIELDS} from '../src/core/settings-specs.ts';
import {configFixture} from '../../../packages/contracts/test/config-runtime.mjs';

const code=buildSync({stdin:{contents:"export * from './src/shop/settings'; export * from './src/core/cvars';",resolveDir:fileURLToPath(new URL('..',import.meta.url)),loader:'ts'},bundle:true,write:false,format:'cjs',platform:'node',target:'es2020',external:['@s2script/sdk/server','@s2script/sdk/config']}).outputFiles[0]!.text;
function defaults(){const values={economy:{},items:{},dna:{}};for(const spec of SPECS){const [section,key]=spec.path.split('.');values[section][key]=spec.default;}return values;}
function fixture(){const registered=[],cf=configFixture([...coreSpecs,...CANONICAL_FIELDS]);const context=vm.createContext({module:{exports:{}},console:{log(){}},require(name){if(name==='@s2script/sdk/config')return {config:cf.config};assert.equal(name,'@s2script/sdk/server');return {Server:{...cf.server,registerCvar:(name,spec)=>{registered.push({name,spec});return cf.server.registerCvar(name,spec);}}};}});vm.runInContext(code,context);return {methods:context.module.exports,registered};}

test('Core read-only Shop observation starts with exact107 immutable defaults and unknown alias is undefined',()=>{const {methods:m}=fixture();assert.equal(SPECS.length,107);for(const spec of SPECS)assert.equal(m.readShopSetting(spec.name),spec.default,spec.name);assert.equal(m.readShopSetting('not_owned'),undefined);assert.equal(m.n('sm_ttt_shop_armor_amount'),100);assert.equal(m.b('sm_ttt_shop_tripwire_glow'),true);assert.equal(m.s('sm_ttt_shop_taser_weapon'),'weapon_taser');});
test('Core binds copied owner values and only explicit owner refresh promotes observations',()=>{const {methods:m}=fixture();const snapshot=defaults();snapshot.items.armorAmount=123;const provider={getRoundSettings:()=>snapshot,refreshSettings:()=>snapshot};m.bindShopSettingsProvider(provider);assert.equal(m.readShopSetting('sm_ttt_shop_armor_amount'),123);snapshot.items.armorAmount=234;assert.equal(m.readShopSetting('sm_ttt_shop_armor_amount'),123);m.refreshShopSettings();assert.equal(m.readShopSetting('sm_ttt_shop_armor_amount'),234);});
test('detach retains last observation and old disposer cannot remove a replacement',()=>{const {methods:m}=fixture();const snapshot=defaults();snapshot.items.armorAmount=123;const provider={getRoundSettings:()=>snapshot,refreshSettings:()=>snapshot};const first=m.bindShopSettingsProvider(provider);first.dispose();snapshot.items.armorAmount=234;m.refreshShopSettings();assert.equal(m.readShopSetting('sm_ttt_shop_armor_amount'),123);const old=m.bindShopSettingsProvider(provider);const replacement=defaults();replacement.items.armorAmount=345;m.bindShopSettingsProvider({getRoundSettings:()=>replacement,refreshSettings:()=>replacement});old.dispose();replacement.items.armorAmount=456;m.refreshShopSettings();assert.equal(m.readShopSetting('sm_ttt_shop_armor_amount'),456);});
test('failed owner refresh leaves whole previous observation and readonly dna compatibility current',()=>{const {methods:m}=fixture();const snapshot=defaults();snapshot.items.armorAmount=123;snapshot.dna.glow=true;m.bindShopSettingsProvider({getRoundSettings:()=>snapshot,refreshSettings:()=>{throw Error('owner unavailable')}});m.refreshShopSettings();assert.equal(m.readShopSetting('sm_ttt_shop_armor_amount'),123);assert.equal(m.cfg.dnaGlow,true);assert.equal(Object.getOwnPropertyDescriptor(m.cfg,'dnaGlow').set,undefined);assert.equal('roleCredits' in m.cfg,false);});
test('Core no longer registers any107 Shop canonical aliases',()=>{const {methods:m,registered}=fixture();m.registerCvars();const names=new Set(registered.map(r=>r.name));assert.ok(names.has('sm_ttt_round_countdown'));for(const spec of SPECS)assert.equal(names.has(spec.name),false,spec.name);});

test('retired refresh cannot overwrite a replacement copied settings observation',()=>{
 const {methods:m}=fixture(),old=defaults(),replacement=defaults();old.items.armorAmount=101;replacement.items.armorAmount=202;
 m.bindShopSettingsProvider({getRoundSettings:()=>old,refreshSettings(){m.bindShopSettingsProvider({getRoundSettings:()=>replacement,refreshSettings:()=>replacement});return old;}});
 m.refreshShopSettings();assert.equal(m.readShopSetting('sm_ttt_shop_armor_amount'),202);
});
test('nested bind keeps the newest attachment and old disposer cannot retire it',()=>{
 const {methods:m}=fixture(),old=defaults(),replacement=defaults();old.items.armorAmount=101;replacement.items.armorAmount=202;
 const stale=m.bindShopSettingsProvider({getRoundSettings(){m.bindShopSettingsProvider({getRoundSettings:()=>replacement,refreshSettings:()=>replacement});return old;},refreshSettings:()=>old});
 stale.dispose();replacement.items.armorAmount=303;m.refreshShopSettings();assert.equal(m.readShopSetting('sm_ttt_shop_armor_amount'),303);
});
test('failed bind restores the prior attachment without changing its observation',()=>{
 const {methods:m}=fixture(),old=defaults();old.items.armorAmount=101;
 m.bindShopSettingsProvider({getRoundSettings:()=>old,refreshSettings:()=>old});
 assert.throws(()=>m.bindShopSettingsProvider({getRoundSettings(){throw Error('unavailable');},refreshSettings:()=>defaults()}),/unavailable/);
 assert.equal(m.readShopSetting('sm_ttt_shop_armor_amount'),101);old.items.armorAmount=303;m.refreshShopSettings();assert.equal(m.readShopSetting('sm_ttt_shop_armor_amount'),303);
});
test('outer bind failure cannot restore over a nested replacement',()=>{
 const {methods:m}=fixture(),replacement=defaults();replacement.items.armorAmount=202;
 assert.throws(()=>m.bindShopSettingsProvider({getRoundSettings(){m.bindShopSettingsProvider({getRoundSettings:()=>replacement,refreshSettings:()=>replacement});throw Error('retired');},refreshSettings:()=>defaults()}),/retired/);
 replacement.items.armorAmount=303;m.refreshShopSettings();assert.equal(m.readShopSetting('sm_ttt_shop_armor_amount'),303);
});
test('rebinding the same handle has a distinct lifetime from its retired disposer',()=>{
 const {methods:m}=fixture(),snapshot=defaults(),provider={getRoundSettings:()=>snapshot,refreshSettings:()=>snapshot};
 const retired=m.bindShopSettingsProvider(provider);m.bindShopSettingsProvider(provider);retired.dispose();snapshot.items.armorAmount=303;m.refreshShopSettings();assert.equal(m.readShopSetting('sm_ttt_shop_armor_amount'),303);
});
