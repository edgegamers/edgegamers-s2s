import assert from 'node:assert/strict';
import {test} from 'node:test';
import {buildSync} from 'esbuild';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
const code=buildSync({entryPoints:[fileURLToPath(new URL('../src/core/body-settings.ts',import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node'}).outputFiles[0]!.text;
function fixture(){const module={exports:{} as any};vm.runInContext(code,vm.createContext({module,console:{log(){}}}));return module.exports;}
const settings=(seconds:number)=>({bodiesEnabled:false,bodyHidePawn:true,bodySettle:true,propPickup:true,carryBodyOffset:seconds});
test('Body observation supplies copied owner snapshots with last value after detach',()=>{
 const m=fixture();assert.equal(m.readBodySetting('other'),undefined);
 const state=settings(10),lifetime=m.bindBodySettingsProvider({getRoundSettings:()=>state,refreshSettings:()=>state});state.carryBodyOffset=20;assert.equal(m.getBodySettings().carryBodyOffset,10);
 m.refreshBodySettings();assert.equal(m.getBodySettings().carryBodyOffset,20);const view=m.getBodySettings();view.carryBodyOffset=999;assert.equal(m.getBodySettings().carryBodyOffset,20);
 lifetime.dispose();state.carryBodyOffset=30;m.refreshBodySettings();assert.equal(m.getBodySettings().carryBodyOffset,20);
});
test('retired Body refresh cannot overwrite replacement and stale disposer cannot remove it',()=>{
 const m=fixture(),next=settings(20);const retired=m.bindBodySettingsProvider({getRoundSettings:()=>settings(10),refreshSettings(){m.bindBodySettingsProvider({getRoundSettings:()=>next,refreshSettings:()=>next});return settings(10);}});
 m.refreshBodySettings();assert.equal(m.getBodySettings().carryBodyOffset,20);retired.dispose();next.carryBodyOffset=30;m.refreshBodySettings();assert.equal(m.getBodySettings().carryBodyOffset,30);
});
test('Body nested bind and failed outer bind preserve replacement; plain failure restores prior',()=>{
 const m=fixture(),state=settings(20);m.bindBodySettingsProvider({getRoundSettings:()=>state,refreshSettings:()=>state});
 assert.throws(()=>m.bindBodySettingsProvider({getRoundSettings(){throw Error('unavailable')},refreshSettings:()=>settings(10)}),/unavailable/);state.carryBodyOffset=30;m.refreshBodySettings();assert.equal(m.getBodySettings().carryBodyOffset,30);
 assert.throws(()=>m.bindBodySettingsProvider({getRoundSettings(){m.bindBodySettingsProvider({getRoundSettings:()=>settings(40),refreshSettings:()=>settings(40)});throw Error('retired')},refreshSettings:()=>settings(10)}),/retired/);m.refreshBodySettings();assert.equal(m.getBodySettings().carryBodyOffset,40);
});
