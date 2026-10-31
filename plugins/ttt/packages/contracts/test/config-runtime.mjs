// SDK config/Cvar fixture used by owner source and actual archive tests.
import {readValues,parseLegacy,parseJsonc,materializeJsonc,normalizeValues,serializeValues,copyValues} from '../config.ts';
export function configFixture(specs,legacy={}) {
 let values=readValues(specs,spec=>Object.hasOwn(legacy,spec.name)?parseLegacy(spec,String(legacy[spec.name])):spec.default);
 let file=serializeValues(values),writeFails=false,deferred=false;const queued=[];const listeners=[],aliases=new Map(),hooks=new Map();
 const at=path=>path.split('.').reduce((v,k)=>v?.[k],values);
 const config={getString:p=>String(at(p)??''),getInt:p=>Number(at(p)??0),getFloat:p=>Number(at(p)??0),getBool:p=>Boolean(at(p)),readFile:()=>file,writeFile:(_n,text)=>{if(!writeFails)file=text;},onChange:h=>listeners.push(h)};
 const server={registerCvar(n,s){if(!aliases.has(n))aliases.set(n,String(s.default));return true;},getCvar:n=>aliases.get(n)??'',setCvar(n,value){const previous=aliases.get(n)??'';aliases.set(n,value);const deliver=()=>{for(const h of [...(hooks.get(n)??[])])h(n,value,previous);};if(deferred)queued.push(deliver);else deliver();return true;},onCvarChange(n,h){const list=hooks.get(n)??[];list.push(h);hooks.set(n,list);return {dispose(){const idx=list.indexOf(h);if(idx>=0)list.splice(idx,1);}};}};
 function materialize(){try{values=materializeJsonc(specs,file);}catch{values=normalizeValues(specs,{});}for(const h of listeners)h(copyValues(values));}
 return {config,server,aliases,hooks,materialize,deferNotifications:on=>{deferred=on;},flush:()=>{while(queued.length)queued.shift()();},getFile:()=>file,setFile:text=>{file=text;},writeFailure:on=>{writeFails=on;},
  edit(path,value){const parsed=parseJsonc(file);const parts=path.split('.');let target=parsed;for(const k of parts.slice(0,-1))target=target[k];target[parts.at(-1)]=value;file=serializeValues(parsed);materialize();},
 };
}
