import assert from 'node:assert/strict';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';
import {createContext, runInContext} from 'node:vm';
import {build} from 'esbuild';

const bundle = await build({
  stdin: {contents: `export {hudLine as coreHudLine} from '../../../plugins/core/src/cs2/hud.ts'; export {hudLine as itemHudLine} from '../../../plugins/items/src/hud.ts';`, resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: 'ts'},
  bundle: true, format: 'cjs', platform: 'node', write: false,
  plugins: [{name: 'native-boundary', setup(b) {
    b.onResolve({filter: /^@s2script\//}, a => ({path: a.path, namespace: 'native'}));
    b.onResolve({filter: /^\.\/runtime$/}, () => ({path: 'runtime', namespace: 'native'}));
    b.onLoad({filter: /.*/, namespace: 'native'}, () => ({contents: 'export const Player={}, Events={}, setCenterHud=()=>{};', loader: 'js'}));
  }}],
});
const module = {exports: {} as Record<string, (text:string, color:string)=>string>};
runInContext(bundle.outputFiles[0]!.text, createContext({module, exports: module.exports}));

test('Core and Items HUD HTML discard chat control bytes and retain their font styling', () => {
  for (const hudLine of Object.values(module.exports)) {
    assert.equal(hudLine('\x08Killer identified: \x0fAlice\x08', '#ffcc00'), "<font class='fontSize-sm' color='#ffcc00'>Killer identified: Alice</font>");
  }
});
