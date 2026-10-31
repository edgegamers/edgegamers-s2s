import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {fixture} from './fixture.mjs';

const archive=process.env.ITEMS_TEST_ARCHIVE??fileURLToPath(new URL('../dist/_edgegamers_ttt-items.s2sp',import.meta.url));
const code=execFileSync('python3',['-c','import zipfile,sys;sys.stdout.write(zipfile.ZipFile(sys.argv[1]).read("plugin.js").decode())',archive],{encoding:'utf8'});
const make=options=>fixture(code,options);
// Paths independently checked against oldport bd2c382 and the engine's live asset lookup.
const station='models/props/cs_office/microwave.vmdl';
const tripwire='models/generic/conveyor_control_panel_01/conveyor_button_02.vmdl';

test('actual Items archive registration cannot populate an already-built map manifest',()=>{
 const f=make();
 assert.deepEqual(f.ops.filter(o=>o[0]==='precache'),[]);
 assert.equal(f.precacheSubscriptions,1);
 assert.deepEqual(f.manifestPaths,[]);
 f.methods.grantTripwire(f.actor(0));
 assert.equal(f.methods.tryPlaceHeldTripwire(f.actor(0)),true);
 const requests=f.ops.filter(o=>o[0]==='create'&&o[2]==='prop_dynamic').map(o=>o[3].model);
 assert.deepEqual(requests,[tripwire,tripwire,tripwire,tripwire]);
 assert.deepEqual(f.manifestPaths,[],'creating a prop is not a manifest-add operation');
 // This demonstrates a request before registration; only the live engine can prove rendering.
});

test('future map precache uses oldport paths synchronously without any Core call',()=>{
 const f=make();
 f.server.mapName='de_nuke';
 for(const key of Object.keys(f.core))if(typeof f.core[key]==='function')f.core[key]=()=>{throw Error('unexpected Core call: '+key);};
 assert.deepEqual(f.precache(),[station,tripwire]);
 assert.deepEqual(f.ops.filter(o=>o[0]==='precache').map(o=>o[1]),[station,tripwire]);
 assert.deepEqual(f.manifestPaths,[station,tripwire]);
 assert.equal(f.ops.filter(o=>o[0]==='log').length,0);
});

test('each future map receives a fresh manifest rather than a startup replay',()=>{
 const f=make();
 assert.deepEqual(f.precache(),[station,tripwire]);
 f.server.mapName='de_inferno';
 assert.deepEqual(f.precache(),[station,tripwire]);
 assert.deepEqual(f.manifestPaths,[station,tripwire]);
 assert.equal(f.ops.filter(o=>o[0]==='precache').length,4);
});

test('refused add is reported and cannot count as manifest acceptance',()=>{
 const f=make();
 assert.deepEqual(f.precache({refused:[tripwire]}),[station]);
 assert.deepEqual(f.ops.filter(o=>o[0]==='precache').map(o=>o[1]),[station,tripwire]);
 assert.deepEqual(f.ops.filter(o=>o[0]==='log'),[['log','[ttt] WARN: precache refused '+tripwire]]);
});

test('owner disposal removes the callback before a later manifest dispatch',()=>{
 const f=make();
 f.end();
 assert.equal(f.precacheSubscriptions,0);
 assert.deepEqual(f.precache(),[]);
 assert.deepEqual(f.ops.filter(o=>o[0]==='precache'),[]);
});
