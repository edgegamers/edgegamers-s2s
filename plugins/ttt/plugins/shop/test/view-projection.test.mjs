import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fixture} from './fixture.mjs';
const archive=process.env.SHOP_TEST_ARCHIVE??new URL('../dist/_edgegamers_ttt-shop.s2sp',import.meta.url).pathname;
const payload=execFileSync('unzip',['-p',archive,'plugin.js'],{encoding:'utf8'});

test('one copied shop listing evaluates each visible grant gate once and bounds Core query work',()=>{
 const f=fixture(payload);f.fund(1,100);const count={};const grants=[];
 for(const name of ['getGame','roleOf','canGrantShopItem','formatPhrase']){
  const fn=f.core[name];f.core[name]=(...args)=>{count[name]=(count[name]??0)+1;if(name==='canGrantShopItem')grants.push(args[1]);return fn(...args);};
 }
 const view=f.methods.getView(1);assert.equal(view.rows.length,16);
 assert.equal(grants.length,16,'one display gate per visible row');assert.equal(new Set(grants).size,16);
 assert.ok(Object.values(count).reduce((a,b)=>a+b,0)<=40,JSON.stringify(count));
});

test('copied display retains established affordable price and name order without cached caller mutations',()=>{
 const f=fixture(payload);f.fund(1,100);
 const order=['bodypaint','gloves','healthshot','poisonshots','poisonsmoke','tripwire','m4a1','compass_player','camo','damagestation','armor','onehitknife','silentawp','clustergrenade','taser','c4'];
 const view=f.methods.getView(1);assert.deepEqual([...view.rows].map(r=>r.id),order);
 view.rows[0].price=-1;view.rows[0].gate=99;view.balance=-1;
 const fresh=f.methods.getView(1);assert.equal(fresh.balance,100);assert.equal(fresh.rows[0].price,30);assert.equal(fresh.rows[0].gate,0);
});

test('role or round changes during grant and sort callbacks reject the entire copied projection',()=>{
 for(const seam of ['canGrantShopItem','formatPhrase'])for(const changed of ['role','state','epoch']){
  const f=fixture(payload);f.fund(1,100);let once=false;const fn=f.core[seam];
  f.core[seam]=(...args)=>{const value=fn(...args);if(!once){once=true;if(changed==='role')f.roles[1]=3;else f.game[changed]++;}return value;};
  assert.equal(f.methods.getView(1).rows.length,0,`${seam}/${changed}`);
 }
});

test('local reset balance counts catalog refresh and owner end invalidate in-flight view copies',()=>{
 for(const change of ['reset','balance','purchase','catalog','end']){
  const f=fixture(payload);f.fund(1,1000);let once=false;const fn=f.core.canGrantShopItem;
  f.core.canGrantShopItem=(...args)=>{const value=fn(...args);if(!once){once=true;
   if(change==='reset')f.methods.resetShop();
   else if(change==='balance')f.methods.addBalance(1,1,'reentrant',false);
   else if(change==='purchase')f.methods.tryPurchase(1,'healthshot',false);
   else if(change==='catalog'){f.configuration.server.setCvar('sm_ttt_shop_armor_price','99');f.methods.refreshSettings();f.methods.refreshCatalog();}
   else f.context.module.exports.OnPluginEnd();
  }return value;};
  assert.equal(f.methods.getView(1).rows.length,0,change);
 }
});

test('nested listings keep per-invocation gates names and role filter separate',()=>{
 const f=fixture(payload);f.fund(1,100);f.fund(2,100);let nested=false,detective;const fn=f.core.formatPhrase;
 f.core.formatPhrase=(...args)=>{if(!nested){nested=true;detective=f.methods.getView(2);}return fn(...args);};
 const traitor=f.methods.getView(1);
 assert.equal(traitor.rows.length,16);assert.equal(detective.rows.length,9);
 assert.equal(traitor.rows.some(r=>r.id==='dna'),false);assert.equal(detective.rows.some(r=>r.id==='tripwire'),false);
});

test('read errors remain visible rather than returning a successful empty projection',()=>{
 const f=fixture(payload);f.fund(1,100);f.core.canGrantShopItem=()=>{throw Error('native gate failed');};
 assert.throws(()=>f.methods.getView(1),/native gate failed/);
});
