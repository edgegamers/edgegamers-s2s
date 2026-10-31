import assert from 'node:assert/strict';
import {test} from 'node:test';
import {buildSync} from 'esbuild';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
const code=buildSync({entryPoints:[fileURLToPath(new URL('../src/core/world-settings.ts',import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node'}).outputFiles[0]!.text;
function fixture(){const module={exports:{} as any};vm.runInContext(code,vm.createContext({module,console:{log(){}}}));return module.exports;}
const settings=(seconds:number)=>({iconsEnabled:false,rolePanels:true,roleGlowSeconds:seconds});
test('World observation supplies copied owner snapshots with last value after detach',()=>{
 const m=fixture();assert.equal(m.readWorldSetting('other'),undefined);
 const state=settings(10),lifetime=m.bindWorldSettingsProvider({getRoundSettings:()=>state,refreshSettings:()=>state});state.roleGlowSeconds=20;assert.equal(m.getWorldSettings().roleGlowSeconds,10);
 m.refreshWorldSettings();assert.equal(m.getWorldSettings().roleGlowSeconds,20);const view=m.getWorldSettings();view.roleGlowSeconds=999;assert.equal(m.getWorldSettings().roleGlowSeconds,20);
 lifetime.dispose();state.roleGlowSeconds=30;m.refreshWorldSettings();assert.equal(m.getWorldSettings().roleGlowSeconds,20);
});
test('retired World refresh cannot overwrite replacement and stale disposer cannot remove it',()=>{
 const m=fixture(),next=settings(20);const retired=m.bindWorldSettingsProvider({getRoundSettings:()=>settings(10),refreshSettings(){m.bindWorldSettingsProvider({getRoundSettings:()=>next,refreshSettings:()=>next});return settings(10);}});
 m.refreshWorldSettings();assert.equal(m.getWorldSettings().roleGlowSeconds,20);retired.dispose();next.roleGlowSeconds=30;m.refreshWorldSettings();assert.equal(m.getWorldSettings().roleGlowSeconds,30);
});
test('World nested bind and failed outer bind preserve replacement; plain failure restores prior',()=>{
 const m=fixture(),state=settings(20);m.bindWorldSettingsProvider({getRoundSettings:()=>state,refreshSettings:()=>state});
 assert.throws(()=>m.bindWorldSettingsProvider({getRoundSettings(){throw Error('unavailable')},refreshSettings:()=>settings(10)}),/unavailable/);state.roleGlowSeconds=30;m.refreshWorldSettings();assert.equal(m.getWorldSettings().roleGlowSeconds,30);
 assert.throws(()=>m.bindWorldSettingsProvider({getRoundSettings(){m.bindWorldSettingsProvider({getRoundSettings:()=>settings(40),refreshSettings:()=>settings(40)});throw Error('retired')},refreshSettings:()=>settings(10)}),/retired/);m.refreshWorldSettings();assert.equal(m.getWorldSettings().roleGlowSeconds,40);
});
