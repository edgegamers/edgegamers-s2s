import assert from 'node:assert/strict';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';
import {createContext,runInContext} from 'node:vm';
import {build} from 'esbuild';

// The actual colour module against a pawn double. `isValid` is the SDK getter: live AND out of the
// staging list, which a pawn is not while `player_spawn` runs.
const cs2=fileURLToPath(new URL('../src/cs2/',import.meta.url));
const mocks:Record<string,string>={
 './pawn':'export const pawnOf=()=>fixture.pawn;',
 '../core/enums':'export const RoleId={None:0,Innocent:1,Traitor:2,Detective:3,Spectator:4};',
};
const code=(await build({stdin:{contents:"export * from './color';",loader:'ts',resolveDir:cs2},bundle:true,write:false,format:'cjs',platform:'node',plugins:[{name:'mocks',setup(b){b.onResolve({filter:/.*/},a=>a.path in mocks?{path:a.path,namespace:'mock'}:undefined);b.onLoad({filter:/.*/,namespace:'mock'},a=>({loader:'js',contents:mocks[a.path]!}));}}]})).outputFiles[0]!.text;

function load(pawn:any){
 const fixture={pawn};const module={exports:{} as any};
 runInContext(code,createContext({fixture,module,exports:module.exports}));
 return module.exports;
}
function pawnDouble(live:boolean,staged:boolean){
 const inputs:string[]=[];
 return {inputs,isValid:live&&!staged,ref:{isValid:()=>live,acceptInput:(name:string,value:string)=>{inputs.push(`${name}=${value}`);return true;}}};
}

test('a respawned pawn still in the staging list is made opaque again', () => {
 const pawn=pawnDouble(true,true);
 load(pawn).resetPawnColor(1);
 assert.deepEqual(pawn.inputs,['Color=255 255 255','Alpha=255']);
});

test('a pawn that no longer exists is left alone', () => {
 const pawn=pawnDouble(false,false);
 load(pawn).resetPawnColor(1);
 assert.deepEqual(pawn.inputs,[]);
});
