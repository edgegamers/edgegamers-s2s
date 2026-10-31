import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
test('dead voice reminder reaches HintText as localized plain text',async()=>{
 const hints:string[]=[],sets:any[]=[];
 const mocks:Record<string,string>={'./warden':'export const isWarden=()=>false;'};
 const code=await build({stdin:{contents:"export * from './src/peace';export {loadMessages} from './src/messages';",resolveDir:fileURLToPath(new URL('..',import.meta.url)),loader:'ts'},bundle:true,format:'cjs',platform:'node',write:false,external:['@s2script/*','@edgegamers/jailbreak-core'],plugins:[{name:'warden',setup(b){b.onResolve({filter:/.*/},a=>a.path in mocks?{path:a.path,namespace:'fake'}:undefined);b.onLoad({filter:/.*/,namespace:'fake'},a=>({contents:mocks[a.path],loader:'js'}));}}]});
 const sdk={Translations:{load:(_n:string,s:any)=>sets.push(s),translate:(_s:number,k:string,...args:any[])=>{const text=sets.map(s=>s[k]).find(s=>s!==undefined)??k;return text.replace(/\{(\d+)\}/g,(_:any,n:string)=>String(args[+n-1]??''));}},Clients:{fromSlot:()=>({isBot:false})},Admin:{forSlot:()=>null},ADMFLAG:{CHAT:1},Voice:{setAudibleTo:()=>true}};
 const module={exports:{} as any};vm.runInNewContext(code.outputFiles[0]!.text,{module,exports:module.exports,require:(n:string)=>n==='@s2script/cs2'?{Player:{fromSlot:()=>({pawnIsAlive:false})},HintText:{to:(_s:number,t:string)=>hints.push(t)},ChatColors:{Blue:'\x0b',Red:'\x07',Grey:'\x08',Yellow:'\x09'}}:sdk});
 module.exports.loadMessages();module.exports.peaceOnVoice(1);
 assert.equal(hints.length,1);assert.doesNotMatch(hints[0]!,/»|\{[a-z]+\}|[\x01-\x10]/);
});
