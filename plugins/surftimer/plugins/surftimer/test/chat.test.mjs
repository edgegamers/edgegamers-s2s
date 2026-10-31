import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createContext,runInContext} from 'node:vm';

test('Surf broadcasts resolve each recipient locale and ignore legacy prefixes', async () => {
  const code=await build({stdin:{contents:"export * from './src/phrases.ts';export * from './src/chat.ts';",resolveDir:process.cwd(),loader:'ts'},bundle:true,format:'cjs',platform:'node',write:false,external:['@s2script/*']});
  const messages=[],sets=new Map();
  const sdk={config:{getString:()=>'{green}[Custom]'},Clients:{all:()=>[{slot:1,isValid:()=>true},{slot:2,isValid:()=>true}]},Chat:{toSlot:(slot,text)=>messages.push({slot,text})},Translations:{load:(name,seed)=>sets.set(name,seed),translate:(slot,key,...args)=>{
    const text=slot===1&&key==='SURF_STOPPED'?'Arrêté':([...sets.values()].map(set=>set[key]).find(Boolean)??key);
    return text.replace(/\{(\d+)\}/g,(_,n)=>String(args[Number(n)-1]??'').replace(/[{}]/g,''));
  }}};
  const colors=new Proxy({Blue:'\x0b',Red:'\x07',Grey:'\x08',Yellow:'\x09'},{get:(target,key)=>target[key]??'\x01'});
  const module={exports:{}};runInContext(code.outputFiles[0].text,createContext({module,exports:module.exports,require:name=>name==='@s2script/cs2'?{ChatColors:colors}:sdk}));
  const p=module.exports;p.loadPhrases();p.refreshPrefix?.();
  p.tellAll(slot=>p.phraseFor(slot,'SURF_STOPPED'));
  assert.equal(messages.length,2);
  assert.equal(messages[0].text,'Arrêté');
  assert.match(messages[1].text,/Surf .*» .*stopped/);
  assert.doesNotMatch(messages[1].text,/Custom|\[/);
});
