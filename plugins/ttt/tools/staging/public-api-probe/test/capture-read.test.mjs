import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSync} from 'esbuild';
const output=buildSync({entryPoints:[new URL('../src/capture-read.ts',import.meta.url).pathname],bundle:true,write:false,format:'esm',platform:'node'}).outputFiles[0].text;
const {readCaptures}=await import('data:text/javascript;base64,'+Buffer.from(output).toString('base64'));
function fixture({ shift=0, count=2, slot=0, capture=true, global=false, stateSlot=slot }={}) {
  const calls=[]; let live=true, client=true; const v=1000+shift,g=1100+shift,p=g+408,c=8,s=0,d=88;
  const fields={'m_vecPlayerLayoutStates':v,'m_globalLayoutState':g,'m_vecPanelIds':p,
    'm_bInputCaptureEnabled':c,'m_playerSlot':s,'m_vecDialogVariableStrings':d};
  const ref={index:80,isValid:()=>live,
    readInt32:o=>{calls.push(['i32',o]); assert.equal(o,v); return count;},
    readBool:o=>{calls.push(['bool',o]); assert.equal(o,g+c); return global;},
    readBoolVia:(path,o)=>{calls.push(['boolVia',path,o]);assert.deepEqual(path,[v+8]);assert.equal(o,slot*408+c);return capture;},
    readInt32Via:(path,o)=>{calls.push(['i32Via',path,o]);assert.deepEqual(path,[v+8]);assert.equal(o,slot*408+s);return stateSlot;}};
  const deps={entity:{findByClass:c=>{assert.equal(c,'custom_hud_layout');return[ref];}},
    schemaOffset:(c,f)=>fields[f],current:()=>client};
  return {deps,ref,calls,run:()=>readCaptures(deps,slot),retire:()=>client=false,kill:()=>live=false};
}
test('separates global false from allocated per-player true on every discovered entity',()=>{
  const f=fixture(),other={...f.ref,index:81};f.deps.entity.findByClass=()=>[f.ref,other];
  const r=f.run();assert.equal(r.ok,true);assert.equal(r.entityCount,2);
  assert.deepEqual(r.rows.map(x=>[x.globalCapture,x.playerCapture]),[[false,true],[false,true]]);
  assert.equal(r.leaseMetadata,'unobservable');
});
test('live schema shift changes offsets, keeps dynamic stride and slot arithmetic',()=>{
  const f=fixture({shift:32,slot:1});assert.equal(f.run().ok,true);
  assert.ok(f.calls.some(x=>x[0]==='boolVia'&&x[1][0]===1040&&x[2]===416));
});
test('unallocated slot is unknown rather than capture false; no pointer-chain reads',()=>{
  const f=fixture({count:0});const r=f.run();assert.equal(r.ok,true);
  assert.equal(r.rows[0].allocated,false);assert.equal(r.rows[0].playerCapture,null);
  assert.equal(f.calls.some(x=>x[0].endsWith('Via')),false);
});
test('invalid slot performs no entity or schema reads',()=>{
  const f=fixture();f.deps.schemaOffset=()=>{throw Error('called');};
  for(const s of [-1,64,NaN,0.5])assert.equal(readCaptures(f.deps,s).reason,'slot');
});
test('missing schema and invalid embedded span refuse',()=>{
  const f=fixture();f.deps.schemaOffset=()=>-1;assert.equal(f.run().reason,'schema');
  const g=fixture(),resolve=g.deps.schemaOffset;g.deps.schemaOffset=(c,f)=>f==='m_vecPanelIds'?1101:resolve(c,f);
  assert.equal(g.run().reason,'state-span');
});
test('bad vector count refuses before reading data or global capture',()=>{
  for(const count of [-1,65,null,1.5]){const f=fixture({count});assert.equal(f.run().reason,'state-count');assert.equal(f.calls.length,1);}
});
test('null per-player read refuses without claiming false',()=>{
  const f=fixture();f.ref.readBoolVia=()=>null;assert.equal(f.run().reason,'player-unreadable');
});
test('state slot mismatch remains explicit, not reassigned to target slot',()=>{
  const f=fixture({stateSlot:1});const r=f.run();assert.equal(r.ok,true);assert.equal(r.rows[0].slotMatches,false);
});
test('client retirement during read refuses and returns no partial rows',()=>{
  const f=fixture(),read=f.ref.readBoolVia;f.ref.readBoolVia=(...a)=>{f.retire();return read(...a);};
  assert.deepEqual(f.run(),{ok:false,reason:'client-changed'});
});
test('entity retirement or count change after capture refuses',()=>{
  const f=fixture(),read=f.ref.readBoolVia;f.ref.readBoolVia=(...a)=>{f.kill();return read(...a);};
  assert.equal(f.run().reason,'entity-changed');
  const g=fixture();let n=0;g.ref.readInt32=()=>++n===1?2:3;assert.equal(g.run().reason,'entity-changed');
});
test('entity bound refuses and zero layouts reports no captures observed',()=>{
  const f=fixture();f.deps.entity.findByClass=()=>Array(65).fill(f.ref);assert.equal(f.run().reason,'entity-count');
  f.deps.entity.findByClass=()=>[];assert.equal(f.run().entityCount,0);
});
