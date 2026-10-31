import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {fixture} from './fixture.mjs';
const archive=process.env.WORLD_TEST_ARCHIVE??fileURLToPath(new URL('../dist/_edgegamers_ttt-world.s2sp',import.meta.url));
const code=execFileSync('unzip',['-p',archive,'plugin.js'],{encoding:'utf8'}),make=()=>fixture(code);
function warm(f){for(const p of [...f.roster])f.deliver('roleAssigned',{slot:p.actor.slot,role:p.role});f.drainPreFrame();f.ops.length=0;}
for(const change of ['reset','map','round','state'])test(`Finished whole-loop lease stops all later old-event tags after ${change}`,()=>{
  const f=make();warm(f);let changed=false,afterChange=0;const format=f.core.formatPhrase;
  f.core.formatPhrase=(...args)=>{const value=format(...args);if(!changed){changed=true;if(change==='reset')f.methods.resetIcons();else if(change==='map')f.server.mapName='de_inferno';else if(change==='state')f.game.state=1;else{f.game.epoch++;for(const p of f.roster)p.actor.roundEpoch=f.game.epoch;}afterChange=f.ops.length;}return value;};
  f.deliver('gameState',{state:3,canceled:false});assert.equal(changed,true,change);
  assert.deepEqual(f.ops.slice(afterChange).filter(op=>op[0]==='name'&&op[3].startsWith('[')),[],change);
});
