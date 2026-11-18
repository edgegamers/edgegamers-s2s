import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import vm from 'node:vm';
import {gameHudDouble} from './gamehud-double.mjs';

const archive=new URL('../dist/_edgegamers_ttt-ui.s2sp',import.meta.url).pathname;
const plugin=execFileSync('unzip',['-p',archive,'plugin.js'],{encoding:'utf8'});
const phrases={'ttt.panel.credits':'{1} credits','ttt.panel.shop_confirm':'Click again to buy','ttt.hud.line_mates':' · Partners: {1}','ttt.hud.line_counts':' · {1} alive','ttt.hud.sub_live':'R','ttt.role.traitor':'{red}Traitor','ttt.hud.end_traitors':'{red}Traitors win'};

const actor=slot=>({slot,steamId:'u'+slot,generation:1,roundEpoch:1});
function load(){
 const gh=gameHudDouble(phrases);let published;
 const f={log:gh.log,panels:gh.panels,gh,time:10,actors:new Map([[1,actor(1)],[2,actor(2)]]),admins:new Set([1]),balance:5,bought:[],answers:[],begun:[],rulings:[],
  reports:[{binding:1,id:7,reporterName:'Vic',accusedName:'Ace',round:3,filed:0,reason:'shot me',priorGuilty:0,suggestedSlays:2}]};
 const live=a=>{const cur=f.actors.get(a.slot);return !!cur&&cur.steamId===a.steamId&&cur.generation===a.generation&&cur.roundEpoch===a.roundEpoch;};
 f.core={
  matchesUiActor:a=>live(a),
  getUiShop:a=>live(a)?{balance:f.balance,stamp:{},rows:[{itemId:'knife',name:'Knife',description:'Stab',price:2,limit:1,refusal:null},{itemId:'c4',name:'C4',description:'Boom',price:3,limit:1,refusal:'Detectives only'}]}:null,
  buyUiItem:(a,id)=>{f.bought.push([a.slot,id]);return {status:'success',title:'Bought',message:id,tone:'good'};},
  getUiReports:a=>live(a)&&f.admins.has(a.slot)?{rows:f.reports.slice(),baseSlays:1,maxQueued:4}:null,
  ruleUiReport:(a,id,binding,action,slays)=>{f.rulings.push([id,binding,action,slays]);f.reports=f.reports.filter(r=>r.id!==id);return {status:'success',title:'Ruled',message:action,tone:'good'};},
  getUiLogPage:(a,at)=>live(a)&&f.admins.has(a.slot)?{rows:[{a:`line ${at}`}],round:9-at,count:3}:null,
  getUiAdmins:()=>[...f.admins].map(s=>f.actors.get(s)),
  answerUiReportPrompt:(a,yes)=>{f.answers.push([a.slot,yes]);return true;},
  getUiReportTargets:a=>live(a)?[{target:actor(2),name:'Bo'}]:null,
  beginUiReport:(a,target)=>{f.begun.push([a.slot,target.slot]);return true;},
 };
 const mods={...gh.mods,'@s2script/sdk/plugin':{use:()=>f.core,publish:(_,m)=>{published=m;}},'@s2script/cs2':{...gh.cs2},'@s2script/sdk/server':{Server:{get gameTime(){return f.time;},command:()=>{}}}};
 const context=vm.createContext({module:{exports:{}},console:{log:()=>{}},Date,require:n=>{assert.ok(n in mods,n);return mods[n];}});
 vm.runInContext(plugin,context);context.module.exports.OnPluginStart();
 f.api=published;f.end=()=>context.module.exports.OnPluginEnd();
 f.panel=(kind,slot)=>f.panels.get(`${kind}:${slot}`);
 return f;
}

test('the shop opens on the drawer and a purchase takes two clicks on the same row', () => {
 const f=load();
 assert.equal(f.api.openShop(actor(1)),true);
 const d=f.panel('drawer',1);
 assert.equal(d.spec.right,'5 credits');
 assert.equal(JSON.stringify(d.spec.rows.map(r=>[r.itemId,r.disabled])),'[["knife",false],["c4",true]]');
 d.spec.onSelect(d.spec.rows[0],d);
 assert.deepEqual(f.bought,[],'one click only selects');
 assert.equal(d.last.rows[0].sub,'Click again to buy');
 f.time+=1;
 d.spec.onSelect(d.spec.rows[0],d);
 assert.deepEqual(f.bought,[[1,'knife']]);
 assert.ok(f.log.some(e=>e[0]==='toast'&&e[2].title==='Bought'&&e[2].tone==='green'));
 f.time+=0.1;
 d.spec.onSelect(d.spec.rows[0],d);
 assert.equal(f.bought.length,1,'the next click starts over');
});

test('a recycled slot cannot buy from the old drawer', () => {
 const f=load();
 f.api.openShop(actor(1));
 const d=f.panel('drawer',1);
 d.spec.onSelect(d.spec.rows[0],d);
 f.actors.set(1,{...actor(1),generation:2});
 d.spec.onSelect(d.spec.rows[0],d);
 assert.deepEqual(f.bought,[]);
 assert.equal(d.open,false,'the stale drawer closes');
});

test('the RDM sheet rules a report, and a ban needs two clicks', () => {
 const f=load();
 f.api.openRdm(actor(1));
 const s=f.panel('sheet',1);
 assert.deepEqual(s.spec.sections.map(x=>x.id),['r7']);
 const act=action=>s.spec.onSelect({section:'r7',kind:'action',index:0,item:{},action},s);
 act('more');
 act('ban');
 assert.deepEqual(f.rulings,[],'the first Ban only arms it');
 act('ban');
 assert.deepEqual(f.rulings,[[7,1,'ban',0]]);
});

test('convict sends the slays the admin set, and a revoked admin cannot rule', () => {
 const f=load();
 f.api.openRdm(actor(1));
 const s=f.panel('sheet',1);
 const act=action=>s.spec.onSelect({section:'r7',kind:'action',index:0,item:{},action},s);
 act('more');
 act('convict');
 assert.deepEqual(f.rulings,[[7,1,'convict',3]]);
 f.reports.push({binding:2,id:8,reporterName:'A',accusedName:'B',round:3,filed:0,reason:'',priorGuilty:0,suggestedSlays:1});
 f.api.openRdm(actor(1));
 f.admins.delete(1);
 s.spec.onSelect({section:'r8',kind:'action',index:0,item:{},action:'acquit'},s);
 assert.equal(f.rulings.length,1);
});

test('the log browser shows each round as a section, private to the admin', () => {
 const f=load();
 assert.equal(f.api.openLogBrowser(actor(2)),false,'not an admin');
 assert.equal(f.api.openLogBrowser(actor(1)),true);
 const s=f.panel('sheet',1);
 assert.equal(s.spec.sections.map(x=>x.body.items[0]).join(),'line 0,line 1,line 2');
});

test('the victim prompt answers Report, Not RDM, and treats closing as no', () => {
 const f=load();
 f.api.openReportPrompt(actor(2),'Ace');
 f.panel('prompt',2).spec.onAnswer({index:0,id:'yes',reason:'answer'});
 f.api.openReportPrompt(actor(2),'Ace');
 f.panel('prompt',2).spec.onAnswer({index:null,id:undefined,reason:'closed'});
 f.api.openReportPrompt(actor(2),'Ace');
 f.panel('prompt',2).spec.onAnswer({index:null,id:undefined,reason:'timeout'});
 assert.deepEqual(f.answers,[[2,true],[2,false]]);
});

test('the report picker lists players and files against the clicked one', () => {
 const f=load();
 f.api.openReportPicker(actor(2));
 const d=f.panel('drawer',2);
 assert.equal(d.spec.rows[0].title,'Bo');
 d.spec.onSelect(d.spec.rows[0],d);
 assert.deepEqual(f.begun,[[2,2]]);
 assert.equal(d.open,false);
});

test('a refused panel returns false so Core falls back to chat', () => {
 const f=load();
 f.gh.refusePanels(true);
 assert.equal(f.api.openShop(actor(1)),false);
 assert.equal(f.api.openReportPrompt(actor(1),'x'),false);
});

test('Traitor partners go on the status card, and the round end shows the summary', () => {
 const f=load();
 f.api.showTraitor(actor(1),['Bo']);
 f.api.paintRoundHud([{actor:actor(1),hud:{phase:'live',clock:60,round:2,alive:5,participants:6,bodies:0,role:'traitor',living:true,health:100,maxHealth:100,karma:100,maxKarma:100}}]);
 const status=f.log.find(e=>e[0]==='status'&&e[1]==='set');
 assert.equal(status[3].hint,'R · 5 alive · Partners: Bo');
 f.api.roundSummary([actor(1)],{winner:'traitor',reason:null,round:2,players:[{name:'Bo',role:'innocent',alive:false},{name:'Ace',role:'traitor',alive:true}]});
 const sum=f.log.find(e=>e[0]==='summary');
 assert.equal(sum[2].title,'{red}Traitors win');
 assert.equal(sum[2].table.rows[0][0],'Ace','Traitors are listed first');
});

test('unload closes every open panel', () => {
 const f=load();
 f.api.openShop(actor(1));
 f.api.openReportPrompt(actor(2),'x');
 f.end();
 assert.equal(f.panel('drawer',1).open,false);
 assert.equal(f.panel('prompt',2).open,false);
});

test('a long shop pages into tabs of 8, buyable items first', () => {
 const f=load();
 const rows=Array.from({length:10},(_,i)=>({itemId:'i'+i,name:'Item '+i,description:'',price:1,limit:0,refusal:i===0?'no':null}));
 f.core.getUiShop=a=>({balance:5,stamp:{},rows});
 f.api.openShop(actor(1));
 const d=f.panel('drawer',1);
 assert.equal(d.spec.tabs.length,2);
 assert.equal(d.spec.tabs[0].rows.length,8);
 assert.equal(d.spec.tabs[1].rows.at(-1).itemId,'i0','a refused item goes last');
});
