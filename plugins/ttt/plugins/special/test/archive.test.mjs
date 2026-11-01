import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const archive=process.env.SPECIAL_TEST_ARCHIVE??fileURLToPath(new URL('../dist/_edgegamers_ttt-special.s2sp',import.meta.url));
const members=JSON.parse(execFileSync('python3',['-c','import zipfile,json,sys;z=zipfile.ZipFile(sys.argv[1]);print(json.dumps({n:z.read(n).decode() for n in z.namelist()}))',archive],{encoding:'utf8'}));
import {fixture,behaviorTests} from './fixture.mjs';
behaviorTests(test,assert,()=>fixture(members['plugin.js']),'archive');

test('actual Special archive owns copied round settings rather than Core config',()=>{
 const f=fixture(members['plugin.js']);assert.equal(typeof f.methods.getRoundSettings,'function');
 assert.equal(typeof f.methods.refreshSettings,'function');
});

import {SPECS} from '../src/settings-specs.ts';
test('archive settings promotion preserves pre-boundary values, then reloads canonical values',()=>{
 const f=fixture(members['plugin.js']);f.configuration.edit('speed.initialSeconds',60);assert.equal(f.methods.getRoundSettings().speed.initialSeconds,75);
 const next=f.methods.refreshSettings();assert.equal(next.speed.initialSeconds,60);next.speed.initialSeconds=999;assert.equal(f.methods.getRoundSettings().speed.initialSeconds,60);
 f.configuration.server.setCvar('sm_ttt_special_speed_initial','55');f.context.module.exports.OnPluginEnd();f.configuration.materialize();const g=fixture(members['plugin.js'],f.configuration);assert.equal(g.methods.getRoundSettings().speed.initialSeconds,55);
});
test('archive exact Special schema uses SDK defaults for invalid JSON and legacy clamp for aliases',()=>{
 const m=JSON.parse(members['manifest.json']);for(const spec of SPECS){const decl=spec.path.split('.').reduce((v,k)=>v[k],m.config);assert.equal(decl.type,spec.type);assert.equal(decl.default,spec.default);assert.equal(decl.min,spec.min);assert.equal(decl.max,spec.max);}
 const spec=SPECS.find(s=>s.path==='speed.initialSeconds'),invalid=spec.max+1;const f=fixture(members['plugin.js']);f.configuration.edit('speed.initialSeconds',invalid);assert.equal(f.methods.refreshSettings().speed.initialSeconds,spec.default);f.configuration.server.setCvar('sm_ttt_special_speed_initial',String(invalid));assert.equal(f.methods.refreshSettings().speed.initialSeconds,spec.max);
});
