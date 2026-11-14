import assert from 'node:assert/strict';
import {test} from 'node:test';
import * as sanction from '../src/cs2/sanction.ts';

// The exemption a countdown slay needs: lift the protection, exempt the victim from the damage
// canceler while the kill runs, and only report a death as served.
function bind(alive:Map<number,boolean>,log:string[]){
 sanction.bindSanctionProtection({
  lift:s=>log.push(`lift ${s}`),
  restore:s=>log.push(`restore ${s}`),
  isAlive:s=>alive.get(s)??false,
 });
}

test('the victim is exempt only while the kill runs, and a death counts as served', () => {
 const alive=new Map([[3,true]]),log:string[]=[];bind(alive,log);
 let exemptDuringKill=false;
 const served=sanction.killDespiteProtection(3,()=>{exemptDuringKill=sanction.isSanctionVictim(3)&&!sanction.isSanctionVictim(4);alive.set(3,false);});
 assert.equal(served,true);
 assert.equal(exemptDuringKill,true);
 assert.equal(sanction.isSanctionVictim(3),false,'the exemption ends with the kill');
 assert.deepEqual(log,['lift 3'],'a dead player is not put back under protection');
});

test('a kill that does not land is not served and the protection comes back', () => {
 const alive=new Map([[3,true]]),log:string[]=[];bind(alive,log);
 assert.equal(sanction.killDespiteProtection(3,()=>{}),false);
 assert.deepEqual(log,['lift 3','restore 3']);
});

test('a throwing kill still restores the protection and the exemption', () => {
 const alive=new Map([[3,true]]),log:string[]=[];bind(alive,log);
 assert.throws(()=>sanction.killDespiteProtection(3,()=>{throw Error('boom');}));
 assert.equal(sanction.isSanctionVictim(3),false);
 assert.deepEqual(log,['lift 3','restore 3']);
});
