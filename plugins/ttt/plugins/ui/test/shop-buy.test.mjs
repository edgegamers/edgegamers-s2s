import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './hudkit-fixture.mjs';

const buys=f=>f.calls.filter(c=>c[0]==='buy');

test('double-clicking a shop row buys that row once',()=>{
 const f=fixture();f.api.openShop(f.actor(1));
 f.server.gameTime=1;f.click(1,'s2_m0_r1');assert.equal(buys(f).length,0,'first click only selects');
 f.server.gameTime=1.2;f.click(1,'s2_m0_r1');assert.deepEqual(buys(f),[['buy',1,'b']]);
 f.server.gameTime=1.35;f.click(1,'s2_m0_r1');assert.equal(buys(f).length,1,'a third click starts a new double-click');
});

test('a duplicated delivery, a slow second click or a different row does not buy',()=>{
 const f=fixture();f.api.openShop(f.actor(1));
 f.server.gameTime=1;f.click(1,'s2_m0_r1');f.click(1,'s2_m0_r1');
 f.server.gameTime=1.02;f.click(1,'s2_m0_r1');
 assert.equal(buys(f).length,0,'same-tick and next-tick duplicates are one click');
 f.server.gameTime=3;f.click(1,'s2_m0_r1');f.server.gameTime=3.5;f.click(1,'s2_m0_r1');
 assert.equal(buys(f).length,0,'too slow');
 f.server.gameTime=5;f.click(1,'s2_m0_r0');f.server.gameTime=5.2;f.click(1,'s2_m0_r1');
 assert.equal(buys(f).length,0,'different rows');
});

test('Buy defers the shop repaint to the next frame',()=>{
 const f=fixture();f.api.openShop(f.actor(1));f.click(1,'s2_m0_r1');f.clear();
 let views=0;const read=f.core.getUiShop;f.core.getUiShop=a=>{views++;return read(a);};
 f.balance=4;f.button(1,'UI_SHOP_TITLE','UI_BUY');
 assert.deepEqual(buys(f),[['buy',1,'b']]);
 assert.equal(views,0,'no shop model or repaint in the purchase frame');
 assert.equal(f.writes.some(w=>w.id==='s2_m0_sub'),false);
 f.frame();
 assert.equal(views,1);
 assert.ok(f.writes.some(w=>w.op==='set'&&w.id==='s2_m0_sub'&&w.value==='UI_CREDITS:4'));
});
