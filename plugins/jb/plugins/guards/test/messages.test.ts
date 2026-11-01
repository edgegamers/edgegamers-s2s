import {test} from 'node:test';
import assert from 'node:assert/strict';
import {messages} from '../../../packages/shared/test/message-fixture.mjs';
test('history ages and status fragments use recipient translations with English fallback',async()=>{
 const msg=await messages('guards',{JB_GUARDS_AGE_MINUTES:'il y a {1} minutes',JB_GUARDS_HISTORY_REVOKED:' (Révoqué)',JB_GUARDS_HISTORY_EXPIRED:'Expired fixture'});
 assert.equal(msg.historyWhen(60,180),'il y a 2 minutes');
 assert.equal(msg.historyStatus(true,false,false,0),' (Révoqué)');
 assert.match(msg.historyStatus(false,false,false,0),/Expired/);
});
test('database failures select their own translated message',async()=>{
 const msg=await messages('guards',{JB_GUARDS_ERROR:'Database fixture {1}'});
 assert.equal(msg.error('database'),'Database fixture database');
});
