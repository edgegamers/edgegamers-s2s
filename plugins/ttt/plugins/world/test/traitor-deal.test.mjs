import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {fixture} from './fixture.mjs';
const archive=process.env.WORLD_TEST_ARCHIVE??fileURLToPath(new URL('../dist/_edgegamers_ttt-world.s2sp',import.meta.url));
const plugin=execFileSync('python3',['-c','import zipfile,sys;print(zipfile.ZipFile(sys.argv[1]).read("plugin.js").decode())',archive],{encoding:'utf8'});

function sixTraitors(state){
 const f=fixture(plugin);
 for(let slot=3;slot<6;slot++)f.connect(slot,2);
 for(const row of f.roster)row.role=2;
 f.game.state=state;
 return f;
}
const rules=f=>f.ops.filter(op=>op[0]==='visible');
/** The last rule each Traitor marker received, by entity index. */
const finalRules=f=>{const last=new Map();for(const op of rules(f))last.set(op[1],[...op[2]].sort());return last;};

test('a countdown deal restricts each Traitor once and widens every marker when the round goes live',()=>{
 const f=sixTraitors(1);
 for(let slot=0;slot<6;slot++)f.deliver('roleAssigned',{slot,role:2});
 const markers=f.entities.length;
 assert.equal(markers,12,'relay and glow for six Traitors');
 // Each new Traitor restricts only its own two markers: 12 rules, not 2 x (1+2+...+6) = 42.
 assert.equal(rules(f).length,12);
 f.deliver('gameState',{state:2,canceled:false});
 const all=[0,1,2,3,4,5];
 const last=finalRules(f);
 assert.equal(last.size,12);
 for(const viewers of last.values())assert.deepEqual(viewers,all,'every marker ends with the whole Traitor list');
});

test('a Traitor dealt outside the countdown still widens every marker at once',()=>{
 const f=sixTraitors(2);
 for(let slot=0;slot<3;slot++)f.deliver('roleAssigned',{slot,role:2});
 const last=finalRules(f);
 for(const viewers of last.values())assert.deepEqual(viewers,[0,1,2]);
});

test('a countdown that resets before going live drops the pending widen',()=>{
 const f=sixTraitors(1);
 f.deliver('roleAssigned',{slot:0,role:2});
 f.deliver('gameState',{state:1,canceled:false});
 const before=rules(f).length;
 f.deliver('gameState',{state:2,canceled:false});
 assert.equal(rules(f).length,before,'the cleared round re-pushes nothing');
});
