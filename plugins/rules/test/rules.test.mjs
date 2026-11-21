import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import vm from 'node:vm';

const archive=new URL('../dist/_edgegamers_rules.s2sp',import.meta.url).pathname;
const plugin=execFileSync('unzip',['-p',archive,'plugin.js'],{encoding:'utf8'});

function load({file=null,admins=[],players={}}={}){
 const commands=new Map(),sheets=[],logs=[];let text=file;
 const sdk={
  command:(n,h)=>commands.set(n,h),HookResult:{Handled:3},ADMFLAG:{GENERIC:2},
  Admin:{forSlot:s=>admins.includes(s)?{hasFlags:()=>true}:null},
  config:{readFile:n=>{assert.equal(n,'rules.json');return text;},writeFile:(n,c)=>{assert.equal(n,'rules.json');text=c;}},
 };
 const cs2={GameHud:{sheet:(slot,spec)=>{sheets.push([slot,spec]);return {};}},Player:{target:(p)=>(players[p]??[]).map(slot=>({slot}))}};
 const mods={'@s2script/sdk':sdk,'@s2script/cs2':cs2};
 const context=vm.createContext({module:{exports:{}},console:{log:l=>logs.push(l)},require:n=>{assert.ok(n in mods,n);return mods[n];}});
 vm.runInContext(plugin,context);context.module.exports.OnPluginStart();
 const run=(slot,...args)=>{const replies=[];commands.get('sm_rules')({callerSlot:slot,arg:i=>args[i]??'',reply:r=>replies.push(r)});return replies;};
 return {sheets,logs,run,text:()=>text,setText:t=>{text=t;}};
}

test('the TTT rules are written on first start and open on the sheet', () => {
 const t=load();
 const saved=JSON.parse(t.text());
 assert.ok(saved.sections.some(s=>s.id==='general'&&s.rules.length===11));
 t.run(3);
 const [slot,spec]=t.sheets.at(-1);
 assert.equal(slot,3);
 assert.equal(spec.sections[0].id,'howto');
 assert.equal(spec.section,'howto');
 assert.equal(spec.sections.find(s=>s.id==='general').body.kind,'list');
 assert.equal(spec.sections.find(s=>s.id==='howto').body.kind,'text');
 assert.ok(spec.sections.length<=16,'every section fits the side tabs');
});

test('!rules general 6 opens that rule highlighted', () => {
 const t=load();
 t.run(1,'General','6');
 const spec=t.sheets.at(-1)[1];
 assert.equal(spec.section,'general');
 assert.equal(spec.highlight,'6');
});

test('only admins can open the rules for another player', () => {
 const t=load({admins:[1],players:{bob:[5]}});
 const denied=t.run(2,'bob','general','1');
 assert.equal(t.sheets.length,0);
 assert.match(denied[0],/No section "bob"/);
 t.run(1,'bob','general','1');
 assert.equal(t.sheets.at(-1)[0],5);
 assert.equal(t.sheets.at(-1)[1].highlight,'1');
});

test('an edited file applies on the next open, and a broken one falls back with one log line', () => {
 const t=load({file:JSON.stringify({title:'Mine',sections:[{id:'one',label:'One',rules:['Be nice']}]})});
 t.run(1);
 assert.equal(t.sheets.at(-1)[1].title,'Mine');
 t.setText('{"sections": 4}');
 t.run(1);t.run(1);
 assert.equal(t.sheets.at(-1)[1].sections[0].id,'howto');
 assert.equal(t.logs.filter(l=>l.includes('not usable')).length,1);
});
