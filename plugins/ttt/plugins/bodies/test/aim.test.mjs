import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';

// The rule that picks "the body you are looking at" when the aim trace does not land on a ragdoll.
// It replaced "nearest to your feet within 120u", which ignored where you were looking.
const out=await build({entryPoints:[fileURLToPath(new URL('../src/aim.ts',import.meta.url))],bundle:true,format:'esm',platform:'node',write:false});
const {pickAlongRay}=await import('data:text/javascript;base64,'+Buffer.from(out.outputFiles[0].text).toString('base64'));

const eye={x:0,y:0,z:64};
const unit=(x,y,z)=>{const l=Math.hypot(x,y,z);return {x:x/l,y:y/l,z:z/l};};
// Looking 45° down along +x: the line of sight meets the floor at x = 64.
const down=unit(1,0,-1);

test('of two bodies side by side, the one in the line of sight wins, not the nearer one', () => {
  const nearer={x:40,y:-40,z:0}, aimed={x:64,y:0,z:0};
  assert.equal(pickAlongRay(eye,down,130,32,[nearer,aimed]),1);
});

test('a body behind or beside the player is not selected, however close', () => {
  assert.equal(pickAlongRay(eye,down,130,32,[{x:-20,y:0,z:0}]),-1,'behind');
  assert.equal(pickAlongRay(eye,down,130,32,[{x:30,y:60,z:0}]),-1,'off to the side');
});

test('a body beyond reach along the line of sight is not selected', () => {
  const far=unit(1,0,-0.2);
  assert.equal(pickAlongRay(eye,far,130,32,[{x:300,y:0,z:4}]),-1);
});

test('between two bodies equally close to the line, the nearer one wins', () => {
  const flat=unit(1,0,0);
  assert.equal(pickAlongRay({x:0,y:0,z:0},flat,130,32,[{x:100,y:10,z:0},{x:50,y:10,z:0}]),1);
});

test('nothing qualifies, nothing is picked', () => {
  assert.equal(pickAlongRay(eye,down,130,32,[]),-1);
});
