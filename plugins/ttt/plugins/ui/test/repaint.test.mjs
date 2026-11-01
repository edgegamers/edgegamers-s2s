import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './hudkit-fixture.mjs';

test('shop row selection paints its selected detail once through stock hudkit',()=>{
 const f=fixture();assert.equal(f.api.openShop(f.actor(1)),true);assert.equal(f.titles('UI_SHOP_TITLE',1).length,1);
 f.clear();f.click(1,'s2_m0_r1');
 assert.equal(f.titles('UI_SHOP_TITLE',1).length,1,'a row click must not duplicate hudkit\'s own paint');
 assert.ok(f.writes.some(w=>w.op==='set'&&w.value==='Beta'));
 f.frame();assert.equal(f.titles('UI_SHOP_TITLE',1).length,1,'the synchronous click paint satisfies invalidation');
});
test('log row selection paints its selected private detail once',()=>{
 const f=fixture();assert.equal(f.api.openLogBrowser(f.actor(1)),true);f.clear();f.click(1,'s2_m0_r1');
 assert.equal(f.titles('UI_LOG_TITLE',1).length,1);
 assert.ok(f.writes.some(w=>w.op==='set'&&w.value==='viewer1/page0/second'));
});
test('report row selection resets confirmation and repaints once',()=>{
 const f=fixture();f.api.openRdm(f.actor(1));f.button(1,'UI_REPORTS_TITLE','UI_BAN');f.clear();f.click(1,'s2_m0_r0');
 assert.equal(f.titles('UI_REPORTS_TITLE',1).length,1);
 assert.ok(f.writes.some(w=>w.op==='set'&&w.value==='UI_BAN'));
 assert.equal(f.calls.length,0);
});
test('repeated background report refreshes coalesce per viewer and paint the latest queue next frame',()=>{
 const f=fixture();f.api.openRdm(f.actor(1));f.api.openRdm(f.actor(2));f.clear();
 f.reports[0].accusedName='Updated accused';for(let i=0;i<3;i++)f.api.refreshRdm();
 assert.equal(f.titles('UI_REPORTS_TITLE').length,0,'background updates must leave the calling frame unpainted');
 f.frame();assert.equal(f.titles('UI_REPORTS_TITLE',1).length,1);assert.equal(f.titles('UI_REPORTS_TITLE',2).length,1);
 assert.equal(f.writes.filter(w=>w.op==='set'&&w.value==='UI_VERSUS:Reporter|Updated accused').length,2);
});
test('queued reports cannot repaint after close or unload',()=>{
 for(const end of [false,true]){const f=fixture();f.api.openRdm(f.actor(1));f.api.refreshRdm();if(end)f.end();else f.api.closeRdm(f.actor(1));f.clear();f.frame();assert.equal(f.titles('UI_REPORTS_TITLE').length,0);}
});
test('queued reports cannot repaint a successor connection or a later round',()=>{
 for(const field of ['steamId','generation','roundEpoch']){const f=fixture();f.api.openRdm(f.actor(1));f.api.refreshRdm();f.actors.set(1,{...f.actor(1),[field]:field==='steamId'?'successor':2});f.clear();f.frame();assert.equal(f.writes.filter(w=>w.op==='set').length,0);}
});
test('a synchronous reopen consumes queued intent without painting again next frame',()=>{
 const f=fixture();f.api.openRdm(f.actor(1));f.api.refreshRdm();f.api.closeRdm(f.actor(1));f.api.openRdm(f.actor(1));
 assert.equal(f.api.isRdmOpen(f.actor(1)),true);f.clear();f.frame();assert.equal(f.titles('UI_REPORTS_TITLE').length,0);
});
test('queued report paint rechecks admin access and rejects identity changes during Core reads',()=>{
 for(const reentry of [false,true]){const f=fixture();f.api.openRdm(f.actor(1));f.api.refreshRdm();if(reentry){const read=f.core.getUiReports;f.core.getUiReports=a=>{f.actors.set(a.slot,{...a,generation:2});return read(a);};}else f.admin=false;f.clear();f.frame();assert.equal(f.writes.filter(w=>w.op==='set').length,0);assert.equal(f.api.isRdmOpen(f.actor(1)),false);}
});
test('ban confirmation stays synchronous while a purchase repaints the shop next frame',()=>{
 const f=fixture();f.api.openShop(f.actor(1));f.clear();f.button(1,'UI_SHOP_TITLE','UI_BUY');assert.equal(f.calls[0][0],'buy');assert.equal(f.titles('UI_SHOP_TITLE',1).length,0);
 f.frame();assert.equal(f.titles('UI_SHOP_TITLE',1).length,1);
 f.api.openRdm(f.actor(2));f.clear();f.button(2,'UI_REPORTS_TITLE','UI_BAN');assert.ok(f.writes.some(w=>w.op==='set'&&w.value==='UI_CONFIRM_BAN'));assert.equal(f.titles('UI_REPORTS_TITLE',2).length,1);
});

test('stock hudkit paints the victim prompt and routes its footer to the yes/no answer',()=>{
 const f=fixture();assert.equal(f.api.openReportPrompt(f.actor(1),'Killer'),true);
 assert.ok(f.titles("UI_RDM_QUESTION",1).length>=1);assert.equal(f.titles("UI_RDM_QUESTION",2).length,0);
 assert.ok(f.writes.some(w=>w.op==='set'&&w.slot===1&&/_r0_a$/.test(w.id)&&w.value==='Killer'));
 f.button(1,"UI_RDM_QUESTION",'UI_REPORT');assert.deepEqual(f.calls,[['answer',1,true]]);
 // This native double has no surface-ownership host, so the callout must report failure rather
 // than claim success: false is what sends Reports to its chat instruction.
 assert.equal(f.api.reportNotice(f.actor(1),{kind:'awaiting',title:'Reporting Killer',message:'Type what happened in chat',tone:'warn'}),false);
});
test('stock hudkit picker reports the selected player and keeps admin RDM footers separate',()=>{
 const f=fixture();f.api.openRdm(f.actor(2));assert.equal(f.api.openReportPicker(f.actor(1)),true);
 f.button(1,'UI_REPORT_PLAYER','UI_REPORT');assert.deepEqual(f.calls,[['begin',1,2]]);
 f.button(2,'UI_REPORTS_TITLE','UI_ACQUIT');assert.equal(f.calls[1][0],'rule');
});
