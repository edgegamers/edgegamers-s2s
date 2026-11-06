import assert from 'node:assert/strict';
import {test} from 'node:test';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import {createContext,runInContext} from 'node:vm';
const built=await build({entryPoints:[fileURLToPath(new URL('../src/core/shop-provider.ts',import.meta.url))],bundle:true,format:'cjs',platform:'node',write:false,
 plugins:[{name:'round-observation',setup(b){b.onResolve({filter:/\/game$/},()=>({path:'game',namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},()=>({loader:'js',contents:'export const game={get state(){return fixture.live?2:0;}},inProgress=()=>fixture.live;'}));}}]});
function fixture(){const state={live:true},module={exports:{} as any};runInContext(built.outputFiles[0]!.text,createContext({fixture:state,module,exports:module.exports}));return {state,api:module.exports};}
test('no Shop owner supplies no wallet or successful physical purchase',()=>{const f=fixture();assert.equal(f.api.balanceOf(1),0);assert.equal(f.api.allItems().length,0);assert.equal(f.api.tryPurchase(1,{id:'armor'}),2);});
test('copied catalog reads preserve the21 stable order and a retired owner cannot produce a mixed catalog',()=>{
 const f=fixture(),ids:string[]=[];const provider={getItem:(id:string)=>{ids.push(id);return {id,nameKey:id,descriptionKey:'description',price:9,role:0,limit:1}}};const old=f.api.bindShopProvider(provider);
 assert.equal(f.api.allItems().length,21);assert.equal(ids[0],'armor');assert.equal(ids.at(-1),'tripwire');const item=f.api.itemById('armor');assert.equal(item.descKey,'description');assert.equal(f.api.itemById('invented'),undefined);
 f.api.bindShopProvider({...provider,getItem:()=>null});old.dispose();assert.equal(f.api.allItems().length,0);
});
test('purchase forwards the stableID and current owner decision, retaining false delivery and unknown thrown effects',()=>{
 const f=fixture(),calls:unknown[][]=[];f.api.bindShopProvider({tryPurchase:(...a:unknown[])=>{calls.push(a);return 3;}});assert.equal(f.api.tryPurchase(1,{id:'tripwire',price:1},false),3);assert.deepEqual(calls,[[1,'tripwire',false]]);
 f.api.bindShopProvider({tryPurchase(){throw Error('delivery outcome unknown')}});assert.throws(()=>f.api.tryPurchase(1,{id:'armor'}),/unknown/);
});
test('copied view supplies fresh owner gates and keeps outside-round precedence',()=>{
 const f=fixture();let gate=6;f.api.bindShopProvider({getView:()=>({balance:30,rows:[{id:'armor',nameKey:'armor',descriptionKey:'desc',price:10,role:0,limit:1,bought:1,gate}]})});
 assert.equal(f.api.canPurchase(1,{id:'armor'}),6);gate=0;assert.equal(f.api.canPurchase(1,{id:'armor'}),0);assert.equal(f.api.canPurchase(1,{id:'gloves'}),4);f.state.live=false;assert.equal(f.api.canPurchase(1,{id:'gloves'}),3);
});
