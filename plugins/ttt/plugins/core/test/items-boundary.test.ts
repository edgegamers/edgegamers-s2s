import assert from 'node:assert/strict';
import {test} from 'node:test';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import {createContext,runInContext} from 'node:vm';
const mocks:Record<string,string>={
 './ui-actor':'export const captureUiActor=s=>s===fixture.actor.slot?{...fixture.actor}:null,matchesUiActor=a=>a.slot===fixture.actor.slot&&a.steamId===fixture.actor.steamId&&a.generation===fixture.actor.generation&&a.roundEpoch===fixture.actor.roundEpoch;',
 '../core/cvars':'export const n=()=>2,list=()=>[],s=()=>"weapon_revolver";',
 '../core/msgs':'export const msgFor=()=>"armed";',
 '../cs2/handlers':'export const giveArmorWithHelmet=()=>fixture.calls.push("armor");',
 '../cs2/icons':'export const armStickers=()=>fixture.calls.push("stickers");',
 '../cs2/inventory':'export const GearSlot={Pistol:1,Rifle:2},clearSlot=()=>{},give=(s,w)=>{fixture.calls.push(w);fixture.onGive?.();},giveReplacing=(s,w)=>{fixture.calls.push(...w);fixture.onGive?.();},replaceInSlot=()=>{fixture.calls.push("replace");fixture.onGive?.();};',
 '../cs2/pawn':'export const tell=()=>fixture.calls.push("armed message");',
 '../cs2/color':'export const setPawnColor=()=>fixture.calls.push("pawn tint");',
 './body-provider':'export const isCurrentBody=()=>{fixture.onBodyRead?.();return true;},tintBody=()=>fixture.calls.push("corpse tint");',
};
const code=(await build({stdin:{contents:"export * from './core/items-provider';export * from './shop/items';export {drainPreFrame,bindRoundEpoch,bindPreFrameIdentity,nextPreFrame,preFrameDepth} from './core/preframe';export {setCenterHud,compareAndClearCenterHud} from './cs2/hud';",resolveDir:fileURLToPath(new URL('../src/',import.meta.url)),loader:'ts'},bundle:true,format:'cjs',platform:'node',write:false,external:['@s2script/*'],plugins:[{name:'native-boundaries',setup(b){b.onResolve({filter:/.*/},a=>a.path in mocks?{path:a.path,namespace:'native'}:undefined);b.onLoad({filter:/.*/,namespace:'native'},a=>({loader:'js',contents:mocks[a.path]}));}}]})).outputFiles[0]!.text;
function fixture(){
 const state={actor:{slot:2,steamId:'buyer',generation:1,roundEpoch:1},calls:[] as string[],onGive:null as null|(()=>void),onBodyRead:null as null|(()=>void)};
 const module={exports:{} as any};runInContext(code,createContext({fixture:state,module,console:{log(){}},require:()=>({})}));const api=module.exports;
 api.bindRoundEpoch(()=>state.actor.roundEpoch);api.bindPreFrameIdentity(()=>({steamId:state.actor.steamId,gen:state.actor.generation}));
 const provider:any={c4Count:()=>0,armCluster:()=>state.calls.push('cluster'),grantC4:()=>state.calls.push('C4 charge'),applyC4Fuse:()=>state.calls.push('fuse'),runPreFrame:(t:number)=>state.calls.push(`job ${t}`)};
 return {state,api,provider};
}
test('18 effect-dependent purchase gates refuse before debit while three native-only items stay available',()=>{
 const f=fixture();for(const id of ['taser','deagle','stickers','dna','healthstation','compass_body','c4','gloves','camo','bodypaint','onehitknife','silentawp','poisonsmoke','poisonshots','clustergrenade','damagestation','compass_player','tripwire'])assert.equal(f.api.canGrantShopItem(2,id),3,id);
 for(const id of ['armor','healthshot','m4a1'])assert.equal(f.api.canGrantShopItem(2,id),0,id);
 assert.equal(f.api.grantShopItem(2,'clustergrenade'),false);assert.deepEqual(f.state.calls,[]);
});
test('existing Cluster Core grant keeps actual inventory-before-charge order',()=>{
 const f=fixture();f.api.bindItemsProvider(f.provider);assert.equal(f.api.grantShopItem(2,'clustergrenade'),true);assert.deepEqual(f.state.calls,['weapon_hegrenade','cluster']);
});
test('replacement during native grant throws rather than refunding or charging another owner',()=>{
 const f=fixture(),replacement={...f.provider,armCluster:()=>f.state.calls.push('replacement charge')};f.api.bindItemsProvider(f.provider);f.state.onGive=()=>f.api.bindItemsProvider(replacement);
 assert.throws(()=>f.api.grantShopItem(2,'clustergrenade'),/retired/);assert.deepEqual(f.state.calls,['weapon_hegrenade']);
});
test('same-handle rebinding also retires captured grants and an old disposer cannot clear the replacement',()=>{
 const f=fixture(),old=f.api.bindItemsProvider(f.provider);f.api.bindItemsProvider(f.provider);old.dispose();assert.equal(f.api.itemsAvailable(),true);
 f.state.onGive=()=>f.api.bindItemsProvider(f.provider);assert.throws(()=>f.api.grantShopItem(2,'clustergrenade'),/retired/);assert.deepEqual(f.state.calls,['weapon_hegrenade']);
});
test('actor retirement during inventory grant prevents effect transfer to the successor connection',()=>{
 const f=fixture();f.api.bindItemsProvider(f.provider);f.state.onGive=()=>f.state.actor.generation++;
 assert.throws(()=>f.api.grantShopItem(2,'clustergrenade'),/retired/);assert.deepEqual(f.state.calls,['weapon_hegrenade']);
});
test('Core C4 inventory, charge and fuse calls keep one owner and original sequence',()=>{
 const f=fixture();f.api.bindItemsProvider(f.provider);assert.equal(f.api.grantShopItem(2,'c4'),true);assert.deepEqual(f.state.calls,['weapon_c4','C4 charge','fuse']);
});
test('Items shares the same PRE walk, accepts genuine actor stamps and drops retired owner jobs',()=>{
 const f=fixture(),old=f.api.bindItemsProvider(f.provider);f.api.nextPreFrame(()=>f.state.calls.push('local first'));
 assert.equal(f.api.scheduleItemPreFrame(1,f.state.actor),true);f.api.nextPreFrame(()=>f.state.calls.push('local last'));f.api.drainPreFrame();assert.deepEqual(f.state.calls,['local first','job 1','local last']);
 f.api.scheduleItemPreFrame(2,f.state.actor);old.dispose();f.api.bindItemsProvider(f.provider);f.api.drainPreFrame();assert.equal(f.state.calls.includes('job 2'),false);
});
test('PRE connection/round guards and 256 waiting cap survive the owner boundary',()=>{
 const f=fixture();f.api.bindItemsProvider(f.provider);f.api.scheduleItemPreFrame(1,f.state.actor);f.state.actor.generation++;f.api.drainPreFrame();assert.deepEqual(f.state.calls,[]);
 f.api.scheduleItemPreFrame(2,f.state.actor);f.state.actor.roundEpoch++;f.api.drainPreFrame();assert.deepEqual(f.state.calls,[]);
 for(let i=0;i<256;i++)assert.equal(f.api.scheduleItemPreFrame(i+3,null),true);assert.equal(f.api.scheduleItemPreFrame(260,null),false);assert.equal(f.api.preFrameDepth(),256);
});
test('detach clears only the matching last Item HUD text and leaves a later writer intact',()=>{
 const f=fixture();const old=f.api.bindItemsProvider(f.provider);f.api.setItemCenterHud(f.state.actor,'compass');f.api.setCenterHud(2,'look-at');old.dispose();assert.equal(f.api.compareAndClearCenterHud(2,'look-at'),true);
 const next=f.api.bindItemsProvider(f.provider);f.api.setItemCenterHud(f.state.actor,'dna');next.dispose();assert.equal(f.api.compareAndClearCenterHud(2,''),true);
});
test('paint tickets are invocation-only, commit mark before tint and retire in finally',()=>{
 const f=fixture(),body={owner:3,painted:false};let ticket=0;
 f.provider.spendBodyPaint=(_a:any,target:any)=>{ticket=target.ticket;assert.equal(f.api.markItemBodyPainted(ticket),true);assert.equal(body.painted,true);f.api.tintItemBody(ticket,{r:1,g:2,b:3});return true;};
 f.api.bindItemsProvider(f.provider);assert.equal(f.api.spendPinnedBodyPaint(2,body),true);assert.deepEqual(f.state.calls,['corpse tint','pawn tint']);assert.throws(()=>f.api.markItemBodyPainted(ticket),/retired/);
});
test('paint retirement/throw after mark keeps canonical mutation and prevents stale tints',()=>{
 const f=fixture(),body={owner:3,painted:false};f.provider.spendBodyPaint=(_a:any,target:any)=>{f.api.markItemBodyPainted(target.ticket);f.api.bindItemsProvider(f.provider);f.api.tintItemBody(target.ticket,{r:1,g:2,b:3});return true;};f.api.bindItemsProvider(f.provider);
 assert.throws(()=>f.api.spendPinnedBodyPaint(2,body),/retired/);assert.equal(body.painted,true);assert.deepEqual(f.state.calls,[]);
});

test('Body provider reentry before paint invocation cannot spend a retired Item charge',()=>{
 const f=fixture();f.provider.spendBodyPaint=()=>{f.state.calls.push('retired spend');return true;};f.api.bindItemsProvider(f.provider);let reads=0;
 f.state.onBodyRead=()=>{if(++reads===2)f.api.bindItemsProvider(f.provider);};assert.equal(f.api.spendPinnedBodyPaint(2,{owner:3,painted:false}),false);assert.deepEqual(f.state.calls,[]);
});
