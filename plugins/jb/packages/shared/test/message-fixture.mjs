import {build} from 'esbuild';
import {createContext,runInContext} from 'node:vm';
import {fileURLToPath} from 'node:url';

export async function messages(owner, overrides = {}) {
  const entry=fileURLToPath(new URL(`../../../plugins/${owner}/src/messages.ts`,import.meta.url));
  const result=await build({entryPoints:[entry],bundle:true,format:'cjs',platform:'node',write:false,external:['@s2script/*']});
  const sets=new Map();
  const sdk={Translations:{load:(name,seed)=>sets.set(name,seed),translate:(slot,key,...args)=>{
    const text=overrides[key] ?? [...sets.values()].map(set=>set[key]).find(value=>value!==undefined) ?? key;
    return text.replace(/\{(\d+)\}/g,(_,n)=>String(args[Number(n)-1]??'').replace(/[{}]/g,''));
  }},Clients:{all:()=>[]},Chat:{}};
  const cs2={ChatColors:new Proxy({Blue:'\x0b',Red:'\x07',Grey:'\x08',Yellow:'\x09'},{get:(target,key)=>target[key]??'\x01'}),Player:{}};
  const module={exports:{}};
  runInContext(result.outputFiles[0].text,createContext({module,exports:module.exports,require:name=>name==='@s2script/cs2'?cs2:sdk}));
  module.exports.loadMessages();
  return module.exports.msgFor(3);
}
