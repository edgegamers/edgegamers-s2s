import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createContext,runInContext} from 'node:vm';
import {fileURLToPath} from 'node:url';

test('Jailbreak broadcasts resolve each recipient and keep plain UI values safe', async () => {
  const result=await build({stdin:{contents:"export * from '../src/phrases.ts'",resolveDir:fileURLToPath(new URL('.',import.meta.url)),loader:'ts'},bundle:true,format:'cjs',platform:'node',write:false,
    plugins:[{name:'engine',setup(b){b.onResolve({filter:/^@s2script\//},a=>({path:a.path,namespace:'engine'}));b.onLoad({filter:/.*/,namespace:'engine'},a=>({loader:'js',contents:a.path==='@s2script/cs2'?
      'export const ChatColors={Blue:"\\x0b",Red:"\\x07",Grey:"\\x08",Yellow:"\\x09"};':
      `let phrases={};export const Translations={load:(n,s)=>Object.assign(phrases,s),translate:(slot,key,...args)=>(slot===3&&key==='notice'?'Hinweis {1}':phrases[key]??key).replace(/\\{(\\d+)\\}/g,(_,n)=>String(args[Number(n)-1]??'').replace(/[{}]/g,''))};export const Clients={all:()=>[{slot:3,isValid:()=>true},{slot:4,isValid:()=>true},{slot:5,isValid:()=>false}]};export const Chat={toSlot:(slot,text)=>fixture.messages.push({slot,text})};` }));}}]});
  const fixture={messages:[] as {slot:number,text:string}[]},module={exports:{} as any};
  runInContext(result.outputFiles[0]!.text,createContext({fixture,module,exports:module.exports}));
  const p=module.exports;
  p.loadPhrases('test',{notice:'{blue}Guard {grey}» {blue}{1}{grey}',label:'Guard: {1}',Red:'Localized red'});
  p.tellAllPhrase('notice','{red}Alice\x07');
  assert.equal(fixture.messages.length,2);
  assert.deepEqual(JSON.parse(JSON.stringify(fixture.messages[0])),{slot:3,text:'Hinweis redAlice'});
  assert.match(fixture.messages[1]!.text,/Guard .*» .*redAlice/);
  assert.equal(p.plainPhraseFor(4,'label','{red}Alice\x07'),'Guard: redAlice');
  assert.equal(p.plainPhraseFor(4,'\x07Red\x08'),'Localized red');
});
