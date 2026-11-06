import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {configFixture} from '../../../packages/contracts/test/config-runtime.mjs';
import {SPECS,CANONICAL_FIELDS} from '../src/core/settings-specs.ts';
const code=(await build({stdin:{contents:"export * from './cvars';export * from './body-settings';export {refreshSettings} from './settings';",resolveDir:fileURLToPath(new URL('../src/core/',import.meta.url)),loader:'ts'},bundle:true,write:false,format:'cjs',platform:'node',external:['@s2script/sdk/*'],plugins:[{name:'other-owner-refresh',setup(b){b.onResolve({filter:/^\.\.\/(karma\/karma|special\/rounds)$/},a=>({path:a.path,namespace:'other'}));b.onLoad({filter:/.*/,namespace:'other'},()=>({contents:'export const refreshKarmaSettings=()=>{},refreshSpecialSettings=()=>{};',loader:'js'}));}}] })).outputFiles[0]!.text;
test('Bodies refresh precedes Core cfg rebuild without adding attachment-time promotion',()=>{
 const cf=configFixture([...SPECS,...CANONICAL_FIELDS]),module={exports:{} as any};vm.runInContext(code,vm.createContext({module,console:{log(){}},require(n:string){if(n==='@s2script/sdk/config')return {config:cf.config};if(n==='@s2script/sdk/server')return {Server:cf.server};throw Error(n);}}));const m=module.exports;m.registerCvars();m.refreshSettings();assert.equal(m.cfg.bodySettle,true);
 let state={bodiesEnabled:false,bodySettle:false,bodyHidePawn:false,propPickup:false,carryBodyOffset:19.5},calls=0;
 const lifetime=m.bindBodySettingsProvider({getRoundSettings:()=>state,refreshSettings:()=>{calls++;return state;}});
 assert.equal(m.cfg.bodiesEnabled,true);assert.equal(m.cfg.bodySettle,true);assert.equal(m.n('sm_ttt_carry_body_offset'),19.5);
 m.refreshSettings();assert.equal(calls,1);assert.equal(m.cfg.bodiesEnabled,false);assert.equal(m.cfg.bodySettle,false);assert.equal(m.cfg.bodyHidePawn,false);assert.equal(m.cfg.propPickup,false);
 state={...state,bodySettle:true};assert.equal(m.cfg.bodySettle,false);m.refreshSettings();assert.equal(m.cfg.bodySettle,true);
 lifetime.dispose();state={...state,bodySettle:false};m.refreshSettings();assert.equal(m.cfg.bodySettle,true);assert.equal(calls,2);
});
