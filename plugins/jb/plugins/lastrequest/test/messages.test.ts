import {test} from 'node:test';
import assert from 'node:assert/strict';
import {messages} from '../../../packages/shared/test/message-fixture.mjs';

test('LR outcome selection uses the result code when a participant has left', async () => {
  const msg=await messages('lastrequest',{JB_LASTREQUEST_DECIDED_3:'{1}: prisoner left'});
  const line=msg.decided('prisoner_win','Alice','Bob',false,true);
  assert.match(line,/Bob/);
  assert.match(line,/prisoner left/);
});

test('LR picker titles localize their nested game name without chat presentation',async()=>{
 const msg=await messages('lastrequest',{JB_LASTREQUEST_TYPE_MENU:'Choisir',JB_LASTREQUEST_PLAYER_MENU:'{1} : joueur','Gun Toss':'Lancer'});
 assert.equal(msg.typeMenuTitle,'Choisir');assert.equal(msg.playerMenuTitle('gun_toss'),'Lancer : joueur');
});
