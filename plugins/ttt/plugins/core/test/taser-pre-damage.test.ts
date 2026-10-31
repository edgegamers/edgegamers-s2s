import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createContext,runInContext} from 'node:vm';
import ts from 'typescript';
import {build} from 'esbuild';
import {fixture as itemFixture} from '../../items/test/fixture.mjs';

function functions(relative:string,names:string[]):string {
 const path=new URL(relative,import.meta.url),text=readFileSync(path,'utf8');
 const tree=ts.createSourceFile(path.pathname,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
 return names.map(name=>{
  const node=tree.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);
  assert.ok(node,'production function '+name);return node.getText(tree);
 }).join('\n');
}
const damageSource=functions('../src/cs2/combat.ts',['slotOfPawn','resolveSlot','onDamage','activeClassOf'])+
 functions('../src/cs2/inventory.ts',['weaponClass','weaponDef']);
const damageCode=ts.transpileModule('let classKey:null|string=null;'+damageSource,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText.replace(/\bexport\s+/g,'');
const ordered=await build({entryPoints:[fileURLToPath(new URL('../src/core/ordered.ts',import.meta.url))],bundle:true,platform:'node',format:'cjs',write:false});
const orderedCtx=createContext({module:{exports:{}},console});runInContext(ordered.outputFiles[0]!.text,orderedCtx);
const {createOrderedCoordinator}=orderedCtx.module.exports as any;
const archive=fileURLToPath(new URL('../../items/dist/_edgegamers_ttt-items.s2sp',import.meta.url));
const itemCode=execFileSync('python3',['-c','import zipfile,sys;print(zipfile.ZipFile(sys.argv[1]).read("plugin.js").decode())',archive],{encoding:'utf8'});

function fixture({attachItems=true,definition=31,className,health=100,state=2}:any={}) {
 const items=itemFixture(itemCode),trace:any[]=[],logs:any[]=[];
 items.game.state=state;
 items.players.get(1).pawn.health=health;
 items.players.get(0).pawn.activeWeapon={ref:items.ref(950,1950),attributeManager:{item:{itemDefinitionIndex:definition}},...(className?{className}:{})};
 const coordinator=createOrderedCoordinator({log:(value:string)=>trace.push(value)});
 if(attachItems)coordinator.attach('items',items.methods);
 const sharedDamage={slot:-1,attacker:-1,damage:0,weapon:'',canceled:false};
 const context:any=createContext({exports:{},console:{log:(s:string)=>trace.push(s)},TASER_DEF:31,
  DamageTypes_t:{DMG_SHOCK:256,DMG_BLAST:64,DMG_BLAST_SURFACE:4096,DMG_BURN:8,DMG_FALL:32,DMG_POISON:32768,DMG_DROWN:16384,DMG_CRUSH:1,DMG_VEHICLE:16},
  pawnToSlot:new Map(),MAX_SLOTS:64,preHookHandledAt:new Float64Array(64).fill(-1),
  damageDiag:{hits:0,noVictim:0,unresolvedVictim:0,canceled:0,applied:0},sharedDamage,
  reg:{activeSlots:()=>items.roster.map(p=>p.actor.slot)},pawnOf:(slot:number)=>items.players.get(slot)?.pawn??null,
  Server:items.server,HookResult:{Handled:2},inProgress:()=>items.game.state===2,
  logDamage:(...args:any[])=>logs.push(args),
 });
 runInContext(damageCode,context);
 function hit(damage=500,overrides:any={}) {
  const pawn=items.players.get(1).pawn;
  const info={victim:pawn.ref,attacker:items.players.get(0).pawn.ref,inflictor:items.players.get(0).pawn.ref,damageType:256,damage,...overrides};
  const result=context.onDamage(coordinator.bus,info);
  // The engine applies only the PRE result, never a post-hurt health repair.
  pawn.health-=info.damage;
  return {result,info,health:pawn.health,dead:pawn.health<=0};
 }
 return {items,coordinator,context,trace,logs,hit};
}

test('typed SDK taser without designer/class name scans and never applies lethal damage',()=>{
 const f=fixture(),r=f.hit();
 assert.equal(r.info.damage,0);assert.equal(r.result,2);assert.equal(r.health,100);assert.equal(r.dead,false);
 assert.ok(f.items.ops.some(o=>o[0]==='chat'&&o[2].startsWith('TASER_SCANNED')));
 assert.equal(f.items.ops.filter(o=>o[0]==='health').length,0,'no resurrection/health-write workaround');
 assert.equal(f.logs.length,0,'no damaging hit logged');
});
test('map or picked-up taser needs no shop entitlement and preserves one-health victim',()=>{
 const f=fixture({health:1}),r=f.hit(1000);assert.equal(r.health,1);assert.equal(r.dead,false);assert.equal(r.info.damage,0);
 assert.ok(f.items.ops.some(o=>o[0]==='chat'&&o[2].startsWith('TASER_SCANNED')));
});
test('Core nonlethal rule survives missing Items provider and out-of-round free roam',()=>{
 for(const state of [0,1,2,3]){
  const f=fixture({attachItems:false,state}),r=f.hit();assert.equal(r.dead,false,`state ${state}`);assert.equal(r.info.damage,0);assert.equal(r.health,100);
 }
});
test('actual copied Items reply still cancels and scan failure cannot cause a kill',()=>{
 const f=fixture();f.items.fail.chat=true;const r=f.hit();assert.equal(r.info.damage,0);assert.equal(r.dead,false);
 assert.ok(f.items.ops.some(o=>o[0]==='chat'&&o[2].startsWith('TASER_SCANNED')),'scan chat attempted before its injected failure');
});
test('ordinary non-taser weapon damage retains existing behavior',()=>{
 const f=fixture({definition:60,className:'weapon_m4a1_silencer'}),r=f.hit(25);
 assert.equal(r.info.damage,25);assert.equal(r.health,75);assert.equal(r.result,undefined);assert.equal(f.logs.length,1);
 assert.equal(f.items.ops.some(o=>o[0]==='chat'&&o[2].startsWith('TASER_SCANNED')),false);
});

test('later damage modifier cannot turn an identification hit back into lethal damage',()=>{
 const f=fixture();f.coordinator.forModule('icons').on('damage',(ev:any)=>{ev.canceled=false;ev.damage=1000;},{priority:1000});
 const r=f.hit();assert.equal(r.info.damage,0);assert.equal(r.dead,false);assert.equal(r.health,100);
});
test('nullable and unrelated typed weapon preserve normal damage without scanning',()=>{
 for(const weapon of [null,{attributeManager:{item:{itemDefinitionIndex:60}}}]){
  const f=fixture();f.items.players.get(0).pawn.activeWeapon=weapon;const r=f.hit(25);
  assert.equal(r.info.damage,25);assert.equal(r.health,75);assert.equal(r.result,undefined);
  assert.equal(f.items.ops.some(o=>o[0]==='chat'&&o[2].startsWith('TASER_SCANNED')),false);
 }
});
test('blast, fire, fall and poison remain damaging while the credited attacker holds a taser',()=>{
 for(const damageType of [64,4096,8,32,32768,16384,1,16]){
  const f=fixture(),r=f.hit(25,{damageType});assert.equal(r.info.damage,25);assert.equal(r.health,75);assert.equal(r.result,undefined);
  assert.equal(f.items.ops.some(o=>o[0]==='chat'&&o[2].startsWith('TASER_SCANNED')),false);
 }
});
test('unrelated inflictor and same-index successor cannot masquerade as a taser shot',()=>{
 for(const inflictor of [{index:987,id:654},{index:fixture().items.players.get(0).pawn.ref.index,id:99999}]){
  const f=fixture(),r=f.hit(25,{inflictor});assert.equal(r.info.damage,25);assert.equal(r.health,75);
  assert.equal(f.items.ops.some(o=>o[0]==='chat'&&o[2].startsWith('TASER_SCANNED')),false);
 }
});
test('shock plus shot flags and nullable inflictor keep taser identification nonlethal',()=>{
 for(const overrides of [{damageType:256|2},{damageType:256|524288},{inflictor:null}]){
  const f=fixture(),r=f.hit(500,overrides);assert.equal(r.info.damage,0);assert.equal(r.health,100);
  assert.ok(f.items.ops.some(o=>o[0]==='chat'&&o[2].startsWith('TASER_SCANNED')));
 }
});
test('generic or earlier bullet damage does not become a tase after switching to the taser',()=>{
 for(const damageType of [0,2]){
  const f=fixture(),r=f.hit(25,{damageType});assert.equal(r.info.damage,25);assert.equal(r.health,75);assert.equal(r.result,undefined);
  assert.equal(f.items.ops.some(o=>o[0]==='chat'&&o[2].startsWith('TASER_SCANNED')),false);
 }
});
