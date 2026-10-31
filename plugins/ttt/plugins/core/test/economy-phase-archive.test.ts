import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
const sourcePath=fileURLToPath(new URL('./startup-retirement-archive.test.ts',import.meta.url));
let source=readFileSync(sourcePath,'utf8').split("test('actual Core first PRE")[0]+'\nexport {startup};\n';
source=source.replace("const shopPlugin = artifact('shop');","const shopPlugin = process.env.SHOP_TEST_ARCHIVE ? execFileSync('unzip',['-p',resolve(process.env.SHOP_TEST_ARCHIVE),'plugin.js'],{encoding:'utf8'}) : artifact('shop');");
const bundle=await build({stdin:{contents:source,resolveDir:fileURLToPath(new URL('.',import.meta.url)),loader:'ts'},bundle:true,format:'esm',platform:'node',write:false});
const {startup}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
function ready(){const f=startup({actualShop:true});f.frame('PRE');f.frame('PRE');return f;}

test('actual Core copies the current primitive phase in the existing Shop tick crossing without SDK reads',()=>{
 const f=ready(),calls=[];f.shop.methods.tickEconomy=(...args)=>calls.push(args);
 const lookups=f.nativeLookups;
 for(const state of [0,1,2,3])f.read('game.state='+state+';tickEconomy(1/64);');
 assert.deepEqual(calls,[[1/64,0],[1/64,1],[1/64,2],[1/64,3]]);
 assert.equal(f.nativeLookups,lookups);
});

test('actual Core economy facade reads phase after an earlier SDK owner callback changes the round state',()=>{
 const f=ready(),calls=[];f.shop.methods.tickEconomy=(...args)=>calls.push(args);
 f.read('game.state=2');f.items.methods.tickWeaponFx=()=>{f.read('game.state=3');};f.frame('PRE');
 assert.deepEqual(calls,[[1/64,3]],'the earlier InProgress frame gate cannot supply an obsolete hint');
});

test('actual Core and Shop idle economy ticks remove only the outgoing phase query with no native work',()=>{
 const f=ready();f.read('game.state=2');let outgoing=0;
 const read=f.published.getGame;f.published.getGame=(...args)=>{outgoing++;return read(...args);};
 const lookups=f.nativeLookups,trace=f.shop.trace.length,chat=f.shop.chat.length;
 f.shop.sdkPlayer.fromSlot=()=>{throw Error('idle economy attempted native sampling');};
 for(let n=0;n<64;n++)f.read('tickEconomy(1/64)');
 assert.equal(outgoing,0);assert.equal(f.nativeLookups,lookups);assert.equal(f.shop.trace.length,trace);assert.equal(f.shop.chat.length,chat);
});
