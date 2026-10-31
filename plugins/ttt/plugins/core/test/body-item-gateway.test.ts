import assert from 'node:assert/strict';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {createContext,runInContext} from 'node:vm';
import {execFileSync} from 'node:child_process';
import {fixture as itemFixture} from '../../items/test/fixture.mjs';
const itemCode=execFileSync('python3',['-c','import zipfile,sys;print(zipfile.ZipFile(sys.argv[1]).read("plugin.js").decode())',process.env.ITEMS_TEST_ARCHIVE??fileURLToPath(new URL('../../items/dist/_edgegamers_ttt-items.s2sp',import.meta.url))],{encoding:'utf8'});
const mocks:Record<string,string>={
 './feature-observations':'export const featureObservations={getWorldPlayers:slot=>{fixture.observationSlot=slot;return []}};',
 './world-provider':'export const appliedModelOf=()=>null;',
 './cvars':'export const cfg={bodiesEnabled:true,bodySettle:true,bodyHidePawn:true,propPickup:true},n=()=>2;',
 '../core/cvars':'export const n=()=>2,b=()=>true,s=()=>"LimeGreen";',
 '../shop/weaponfx':'export const readDna=()=>fixture.calls.push("dna");',
 './weaponfx':'export const poisonShotsLeft=()=>0;',
 '../core/msgs':'export const msg=k=>k,msgFor=(s,k)=>k;',
 '../core/registry':'export const roleOf=()=>2,isAlive=()=>true,isConnected=()=>true,nameOf=()=>"P1",activeSlots=()=>[1];',
 '../cs2/pawn':'export const pawnOf=()=>null,setHealth=()=>{},tell=(s,text)=>fixture.calls.push(text);',
 '../cs2/color':'export const ROLE_COLORS={},setEntityColor=()=>true,setPawnColor=()=>{fixture.calls.push("pawnTint");return true;},setPawnAlpha=()=>true;',
 '../cs2/hud':'export const hudLine=()=>{},HUD_FONT_BIG=2,HUD_FONT_SMALL=1,setCenterHud=()=>{},compareAndClearCenterHud=()=>true;',
 '../cs2/combat':'export const resolveSlot=()=>1,killWithGadget=()=>{},markGadgetKill=()=>{};',
 '../cs2/icons':'export const restrictToTraitors=()=>true;',
 '../cs2/inventory':'export const give=()=>null,removeByDef=()=>{},resolveWeapon=()=>null,TASER_DEF=31,weaponClass=()=>"",KNIVES=[],PISTOLS=[],RIFLES=[];',
 './shop':'export const addBalance=()=>{};',
 '../karma/karma':'export const suppressKarmaOnce=()=>{};',
 '../game/game':'export const game={state:2},inProgress=()=>true;',
 '../game/roles':'export const roleName=()=>"Traitor";',
};
const code=(await build({stdin:{contents:`export {createBodyCoreMethods} from './core/body-owner';export * from './core/body-provider';export {bindItemsProvider,markItemBodyPainted,tintItemBody} from './core/items-provider';export {grantBodyPaint,hasBodyPaint,grantGloves,hasGloves} from './shop/effects';`,resolveDir:fileURLToPath(new URL('../src/',import.meta.url)),loader:'ts'},bundle:true,write:false,format:'cjs',platform:'node',external:['@s2script/*'],plugins:[{name:'native-observations',setup(b){b.onResolve({filter:/.*/},a=>a.path in mocks?{path:a.path,namespace:'mock'}:/ui-actor$/.test(a.path)?{path:'actors',namespace:'mock'}:undefined);b.onLoad({filter:/.*/,namespace:'mock'},a=>({loader:'js',contents:a.path==='actors'?'export const captureUiActor=s=>fixture.actor,matchesUiActor=a=>a.generation===fixture.actor.generation&&a.roundEpoch===fixture.actor.roundEpoch;':mocks[a.path]}));}}]})).outputFiles[0]!.text;
function fixture(){
 const items=itemFixture(itemCode);const state={actor:items.actor(1),calls:[] as string[],throwPaint:false,observationSlot:undefined as number|undefined};
 const ref={index:71,id:51},body={ref,index:71,owner:2,ownerName:'Victim',ownerRole:1,killer:1,killerName:'P1',weapon:'awp',identified:false,timeOfDeath:10,dnaSuppressed:false,painted:false,x:0,y:0,z:0};
 const unused=new Proxy(function(){},{get:()=>unused,apply(){throw Error('unexpected native operation');}});
 const module={exports:{} as any};runInContext(code,createContext({fixture:state,module,console:{log(){}},require:()=>unused}));const api=module.exports;
 api.bindBodiesProvider({bodyByEntity:()=>({...body}),markPainted(){state.calls.push('mark');if(state.throwPaint)throw Error('owner disappeared');body.painted=true;return true;},tintBody(){state.calls.push('corpseTint');}});
 api.bindItemsProvider(items.methods);items.core.markItemBodyPainted=api.markItemBodyPainted;items.core.tintItemBody=api.tintItemBody;
 const events:any[]=[];const methods=api.createBodyCoreMethods({emit:(kind:string,payload:any)=>{events.push([kind,payload.body.identified]);return payload;}});
 return {state,api,ref,body,methods,events,items};
}
test('actual Paint grant/gateway spends charge, commits canonical flag, tints corpse then current pawn and announces exhaustion',()=>{
 const f=fixture();f.api.grantBodyPaint(1,1);assert.equal(f.methods.spendBodyPaint(f.state.actor,f.ref),true);assert.equal(f.api.hasBodyPaint(1),false);assert.equal(f.body.painted,true);assert.deepEqual(f.state.calls,['mark','corpseTint','pawnTint']);assert.ok(f.items.ops.some(op=>op[0]==='chat'&&op[2].startsWith('SHOP_ITEM_BODY_PAINT_OUT')));
});
test('throw after paint charge debit preserves original partial charge state and stops before tint',()=>{
 const f=fixture();f.api.grantBodyPaint(1,1);f.state.throwPaint=true;assert.throws(()=>f.methods.spendBodyPaint(f.state.actor,f.ref),/owner disappeared/);assert.equal(f.api.hasBodyPaint(1),false);assert.equal(f.body.painted,false);assert.deepEqual(f.state.calls,['mark']);
});
test('Body gateways reject stale actors; DNA and identify retain old precommit identified:false observation',()=>{
 const f=fixture();f.api.grantBodyPaint(1,1);const old={...f.state.actor,generation:0};assert.equal(f.methods.spendBodyPaint(old,f.ref),false);f.methods.readBodyDna(old,f.ref);assert.equal(f.api.hasBodyPaint(1),true);assert.deepEqual(f.state.calls,[]);f.methods.readBodyDna(f.state.actor,f.ref);assert.deepEqual(f.state.calls,['dna']);assert.equal(f.methods.emitBodyIdentify(f.state.actor,f.ref).canceled,false);assert.deepEqual(f.events,[['bodyIdentify',false]]);assert.equal(f.body.identified,false);
});
test('Body observation delegates optional selection before rebuilding native World rows',()=>{
 const f=fixture();f.methods.getBodyPlayers(1);assert.equal(f.state.observationSlot,1);
 f.methods.getBodyPlayers();assert.equal(f.state.observationSlot,undefined);
});
