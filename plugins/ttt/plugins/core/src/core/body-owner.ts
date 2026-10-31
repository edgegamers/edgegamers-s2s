/** Finite gateways to the existing Core item decisions and ordered observers. */
import type {CoreBodiesMethods} from '../../../../packages/contracts/body-types.ts';
import type {EventBus} from './bus';
import type {TttEvents} from './events';
import {featureObservations} from './feature-observations';
import {cfg,n} from './cvars';
import {matchesUiActor} from './ui-actor';
import {getBodyProjection,isCurrentBody,scheduleBodyPreFrame} from './body-provider';
import {appliedModelOf} from './world-provider';
import {readDna} from '../shop/weaponfx';
import {hasGloves,spendGlove,hasBodyPaint,spendBodyPaint,tryDefuseTripwire,tryPlaceHeldTripwire} from '../shop/effects';

export function createBodyCoreMethods(bus:EventBus<TttEvents>):CoreBodiesMethods{
 return {
  getBodyPlayers:slot=>featureObservations.getWorldPlayers(slot).map(row=>({...row,actor:{...row.actor}})),
  getBodySettings:()=>({bodiesEnabled:cfg.bodiesEnabled,bodySettle:cfg.bodySettle,bodyHidePawn:cfg.bodyHidePawn,propPickup:cfg.propPickup,carryBodyOffset:n('sm_ttt_carry_body_offset')}),
  getBodyModel(actor){if(!matchesUiActor(actor))return null;const model=appliedModelOf(actor.slot);return matchesUiActor(actor)?model:null;},
  scheduleBodyPreFrame,
  readBodyDna(actor,ref){if(!matchesUiActor(actor))return;const body=getBodyProjection(ref);if(body&&matchesUiActor(actor)&&isCurrentBody(body))readDna(actor.slot,body);},
  hasBodyGloves:actor=>matchesUiActor(actor)&&hasGloves(actor.slot),
  spendBodyGlove:actor=>matchesUiActor(actor)&&spendGlove(actor.slot,true),
  hasBodyPaint:actor=>matchesUiActor(actor)&&hasBodyPaint(actor.slot),
  spendBodyPaint(actor,ref){if(!matchesUiActor(actor))return false;const body=getBodyProjection(ref);return body!==null&&matchesUiActor(actor)&&isCurrentBody(body)&&spendBodyPaint(actor.slot,body);},
  tryDefuseTripwire:(actor,dt)=>matchesUiActor(actor)&&tryDefuseTripwire(actor.slot,dt),
  tryPlaceHeldTripwire:actor=>matchesUiActor(actor)&&tryPlaceHeldTripwire(actor.slot),
  emitBodyIdentify(actor,ref){if(!matchesUiActor(actor))return null;const body=getBodyProjection(ref);if(body===null||!matchesUiActor(actor)||!isCurrentBody(body))return null;const result=bus.emit('bodyIdentify',{body,identifier:actor.slot,canceled:false});return {canceled:result.canceled};},
 };
}
