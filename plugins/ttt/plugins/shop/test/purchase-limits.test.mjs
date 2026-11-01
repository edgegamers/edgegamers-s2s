import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import {fixture} from './fixture.mjs';

// Expose an existing source-module read only in this test entry, to supply controlled item data.
const code=(await build({stdin:{contents:"export * from './src/plugin.ts';export {allItems} from './src/shop.ts';",resolveDir:fileURLToPath(new URL('..',import.meta.url)),loader:'ts'},bundle:true,write:false,format:'cjs',platform:'node',external:['@s2script/*']})).outputFiles[0].text;

test('finite purchase limits refuse a further grant/debit and reset for the next round',()=>{
 const f=fixture(code),item=f.context.module.exports.allItems().find(item=>item.id==='healthshot');
 item.limit=2;item.price=7;f.fund(0,100);
 assert.equal(f.methods.tryPurchase(0,'healthshot',false),0);
 assert.equal(f.methods.tryPurchase(0,'healthshot',false),0);
 assert.equal(f.methods.tryPurchase(0,'healthshot',false),6);
 assert.equal(f.methods.balanceOf(0),86);
 assert.equal(f.trace.filter(row=>row[0]==='grant').length,2);
 f.methods.resetShop();f.fund(0,100);
 assert.equal(f.methods.tryPurchase(0,'healthshot',false),0);
 assert.equal(f.methods.balanceOf(0),93);
});
