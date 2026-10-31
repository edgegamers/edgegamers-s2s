/** Finite item decisions reuse Core's existing health/death/identity operations. */
import type {CoreItemsMethods,ItemSettingKey} from '../../../../packages/contracts/item-types.ts';
import {captureUiActor,matchesUiActor} from './ui-actor';
import {readShopSetting} from '../shop/settings';
import {pawnOf} from '../cs2/pawn';
import {killWithGadget,resolveSlot} from '../cs2/combat';
import {suppressKarmaOnce} from '../karma/karma';
import {allBodies} from './body-provider';
import {roleModel,restrictToTraitors} from './world-provider';
import {scheduleItemPreFrame,setItemCenterHud,markItemBodyPainted,tintItemBody} from './items-provider';
import {ITEM_SETTING_KEYS} from './item-setting-keys';
const settingKeys=new Set<string>(ITEM_SETTING_KEYS);
export const itemCoreMethods:CoreItemsMethods={
 getItemSetting(key){if(!settingKeys.has(key))throw Error('Unknown item setting');return readShopSetting(key)??0;},
 scheduleItemPreFrame,setItemCenterHud,markItemBodyPainted,tintItemBody,
 setItemHealth(actor,value){
  if(!matchesUiActor(actor)||!Number.isFinite(value))return;
  const pawn=pawnOf(actor.slot);if(!pawn||!pawn.isValid||!matchesUiActor(actor))return;
  if(value<=0){pawn.slay();return;}
  pawn.health=value;
  if(matchesUiActor(actor)&&value>(pawn.maxHealth??100))pawn.maxHealth=value;
 },
 killItemWithGadget(actor,killer,cause,suppressBody){if(matchesUiActor(actor)&&['[Hurt Station]','[Tripwire]','[Poison Shots]','[Poison Smoke]'].includes(cause))killWithGadget(actor.slot,killer,cause,suppressBody);},
 suppressItemKarmaOnce(actor){if(matchesUiActor(actor))suppressKarmaOnce(actor.slot);},
 resolveItemActor(ref){
  const slot=resolveSlot(ref.index),actor=captureUiActor(slot);if(!actor)return null;
  const pawn=pawnOf(slot)?.ref;if(!pawn||pawn.id!==ref.id||pawn.index!==ref.index)return null;
  return matchesUiActor(actor)?actor:null;
 },
 getItemBodies:()=>allBodies().map(body=>({...body})),
 getItemRoleModel:roleModel,restrictItemToTraitors:restrictToTraitors,
};
