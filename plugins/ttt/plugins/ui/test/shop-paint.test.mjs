import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './hudkit-fixture.mjs';

// Public UI methods and actual pinned hudkit callbacks, not a hand-painted modal double.
test('shop uses at most one fresh model per stock paint plus its initial open validation',()=>{
 const f=fixture();let views=0;const read=f.core.getUiShop;
 f.core.getUiShop=a=>{views++;return read(a);};
 assert.equal(f.api.openShop(f.actor(1)),true);
 assert.equal(views,2,'initial validation plus one collected paint');
 assert.equal(f.titles('TTT Shop',1).length,1);
 f.clear();views=0;f.balance=6;f.items[1].description='Fresh detail';
 f.click(1,'s2_m0_r1');
 assert.equal(views,1,'selection must collect one full shop model');
 assert.equal(f.titles('TTT Shop',1).length,1);
 assert.ok(f.writes.some(w=>w.op==='set'&&w.id==='s2_m0_sub'&&w.value==='6 credits'));
 assert.ok(f.writes.some(w=>w.op==='set'&&w.id==='s2_m0_d3'&&w.value==='Fresh detail'));
 f.clear();views=0;f.frame();assert.equal(views,0);assert.equal(f.writes.length,0);
});

test('one paint uses a copied collection while its next paint and purchase read fresh state',()=>{
 const f=fixture();assert.equal(f.api.openShop(f.actor(1)),true);f.clear();
 let afterRead=false,checks=0;const read=f.core.getUiShop,match=f.core.matchesUiActor;
 f.core.getUiShop=a=>{const view=read(a);afterRead=true;return view;};
 f.core.matchesUiActor=a=>{if(afterRead&&++checks===2){f.balance=99;f.items[1].name='Later';}return match(a);};
 f.click(1,'s2_m0_r1');
 assert.ok(f.writes.some(w=>w.op==='set'&&w.id==='s2_m0_sub'&&w.value==='10 credits'));
 assert.ok(f.writes.some(w=>w.op==='set'&&w.id==='s2_m0_d0'&&w.value==='Beta'));
 f.clear();f.click(1,'s2_m0_r1');
 assert.ok(f.writes.some(w=>w.op==='set'&&w.id==='s2_m0_sub'&&w.value==='99 credits'));
 assert.ok(f.writes.some(w=>w.op==='set'&&w.id==='s2_m0_d0'&&w.value==='Later'));
 f.button(1,'TTT Shop','Buy');assert.deepEqual(f.calls[0],['buy',1,'b']);
});

test('nested same-slot stock paint supersedes the outer copied projection',()=>{
 const f=fixture();f.api.openShop(f.actor(1));f.clear();
 let armed=false,checks=0,nested=false;const read=f.core.getUiShop,match=f.core.matchesUiActor;
 f.core.getUiShop=a=>{const view=read(a);if(!nested)armed=true;return view;};
 f.core.matchesUiActor=a=>{
  if(armed&&++checks===2){armed=false;nested=true;f.items[1].name='Nested';f.balance=31;f.api.openShop(f.actor(1));}
  return match(a);
 };
 f.click(1,'s2_m0_r1');
 assert.equal(f.titles('TTT Shop',1).length,1);
 assert.ok(f.writes.some(w=>w.op==='set'&&w.id==='s2_m0_sub'&&w.value==='31 credits'));
 assert.equal(f.writes.some(w=>w.op==='set'&&w.id==='s2_m0_sub'&&w.value==='10 credits'),false);
 f.clear();f.click(1,'s2_m0_r1');assert.ok(f.writes.some(w=>w.op==='set'&&w.id==='s2_m0_d0'&&w.value==='Nested'));
});

test('paint collection retires on successor, later round, reset, or owner end before native submission',()=>{
 for(const effect of ['steamId','generation','roundEpoch','reset','end']){
  const f=fixture();f.api.openShop(f.actor(1));f.clear();
  let armed=false,checks=0;const read=f.core.getUiShop,match=f.core.matchesUiActor;
  f.core.getUiShop=a=>{const view=read(a);armed=true;return view;};
  f.core.matchesUiActor=a=>{
   if(armed&&++checks===2){armed=false;
    if(effect==='reset')f.api.resetAll();else if(effect==='end')f.end();
    else f.actors.set(a.slot,{...a,[effect]:effect==='steamId'?'successor':a[effect]+1});
   }
   return match(a);
  };
  f.click(1,'s2_m0_r1');
  assert.equal(f.writes.filter(w=>w.op==='set').length,0,effect);
 }
});

test('a missing required shop stamp cannot fall back to the general actor-only validation path',()=>{
 const f=fixture(),read=f.core.getUiShop;
 f.core.getUiShop=a=>{const view=read(a);delete view.stamp;return view;};
 assert.equal(f.api.openShop(f.actor(1)),false);assert.equal(f.writes.filter(w=>w.op==='set').length,0);
});
