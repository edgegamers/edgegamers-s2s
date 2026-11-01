import {test} from 'node:test';
import assert from 'node:assert/strict';
import {messages} from '../../../packages/shared/test/message-fixture.mjs';

test('localized perk labels do not participate in equipped-state comparisons', async () => {
  const msg=await messages('gangperks',{'JB_GANGPERKS_MENU_ITEM':'translated-state',JB_GANGPERKS_MENU_ITEM_2:'{1} equipped fixture'});
  const line=msg.menuItem({label:'Red',cost:7},'equipped');
  assert.match(line,/equipped/i);
  assert.doesNotMatch(line,/7/);
});
