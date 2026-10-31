import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
test('perk purchases translate for each online gang member and exclude outsiders',async()=>{
 const sets:any[]=[],sent:{slot:number,text:string}[]=[];
 const players=[1,2,3].map(slot=>({slot,steamId:'7656119800000000'+slot,playerName:'P'+slot}));
 const clients=players.map(p=>({...p,isValid:()=>true,chat:(text:string)=>sent.push({slot:p.slot,text})}));
 const sdk={Translations:{load:(_n:string,s:any)=>sets.push(s),translate:(slot:number,key:string,...args:any[])=>{const text=slot===1&&key==='JB_GANGPERKS_PURCHASED'?'achat {1} {2} {3}':sets.map(s=>s[key]).find(s=>s!==undefined)??key;return text.replace(/\{(\d+)\}/g,(_:any,n:string)=>String(args[+n-1]??'').replace(/[{}]/g,''));}},Clients:{all:()=>clients},Chat:{toSlot:(slot:number,text:string)=>sent.push({slot,text})}};
 const code=await build({stdin:{contents:"export {runPerk} from './src/commands';export {deps} from './src/state';export {loadMessages} from './src/messages';export {PAINT_COLOR} from './src/perks';",resolveDir:fileURLToPath(new URL('..',import.meta.url)),loader:'ts'},bundle:true,platform:'node',format:'cjs',write:false,external:['@s2script/*']});
 const module={exports:{} as any};vm.runInNewContext(code.outputFiles[0]!.text,{module,exports:module.exports,require:(name:string)=>name==='@s2script/cs2'?{Player:{all:()=>players,fromSlot:(slot:number)=>players.find(p=>p.slot===slot)},ChatColors:{Blue:'\x0b',Grey:'\x08',Red:'\x07',Yellow:'\x09'}}:sdk});
 const api=module.exports;api.loadMessages();api.deps.gangs={isReady:()=>true,getGangOf:(id:string)=>({id:id===players[2]!.steamId?2:1}),getGangStat:()=>0,getPlayerStat:()=>0,hasPermission:()=>true,tryPurchase:()=>100,setGangStat:()=>true,sendGangChat:(_id:number,text:string)=>{for(const slot of [1,2])sent.push({slot,text});}};
 api.runPerk(api.PAINT_COLOR,1,['RED']);
 assert.equal(sent.length,2);assert.match(sent.find(m=>m.slot===1)!.text,/achat/);assert.doesNotMatch(sent.find(m=>m.slot===2)!.text,/achat/);assert.ok(sent.every(m=>m.slot!==3));
});
