import type {WorldActionContext,WorldActionStamp} from '../../../../packages/contracts/world-types.ts';
import * as reg from './registry';
import {captureUiActor,matchesUiActor} from './ui-actor';
import {game,roundEpoch} from '../game/game';
import {currentMapEpoch} from './preframe';
import {pawnOf} from '../cs2/pawn';
import {MAX_SLOTS} from './enums';
import {isCoreActionAdmissionOpen,openCoreActionAdmission,closeCoreActionAdmission} from './action-admission';

// A hard SDK interface remains callable while its producer is Unloading. Core closes this
// gate before any teardown callback; startup reopens only after retained owner retirement.
export const openWorldActionAdmission=openCoreActionAdmission;
export const closeWorldActionAdmission=closeCoreActionAdmission;
const integer=(value:unknown):value is number=>Number.isSafeInteger(value)&&Number(value)>=0;

/** Primitive registry comparison only. World must still validate its exact SDK handles. */
export function matchesWorldActionContext(stamp:WorldActionStamp):boolean {
 if(!isCoreActionAdmissionOpen()||stamp===null||typeof stamp!=='object')return false;
 const actor=stamp.actor;
 if(actor===null||typeof actor!=='object'||!integer(actor.slot)||actor.slot>=MAX_SLOTS||
  typeof actor.steamId!=='string'||!integer(actor.generation)||!integer(actor.roundEpoch)||
  !integer(stamp.mapEpoch)||!integer(stamp.state)||stamp.state>3||typeof stamp.name!=='string'||
  !integer(stamp.role)||stamp.role>4||typeof stamp.alive!=='boolean'||typeof stamp.participating!=='boolean')return false;
 return reg.isConnected(actor.slot)&&actor.steamId===reg.steamIdOf(actor.slot)&&actor.generation===reg.generationOf(actor.slot)&&
  actor.roundEpoch===roundEpoch()&&stamp.mapEpoch===currentMapEpoch()&&stamp.state===game.state&&
  stamp.name===reg.nameOf(actor.slot)&&stamp.role===reg.roleOf(actor.slot)&&stamp.alive===reg.isAlive(actor.slot)&&
  stamp.participating===reg.isParticipating(actor.slot);
}

/** One bounded native observation at scope entry; no retained Core/native object crosses. */
export function getWorldActionContext(slot:number):WorldActionContext|null {
 if(!isCoreActionAdmissionOpen()||!integer(slot)||slot>=MAX_SLOTS||!reg.isConnected(slot))return null;
 const stamp:WorldActionStamp={actor:{slot,steamId:reg.steamIdOf(slot),generation:reg.generationOf(slot),roundEpoch:roundEpoch()},
  mapEpoch:currentMapEpoch(),state:game.state,name:reg.nameOf(slot),role:reg.roleOf(slot),alive:reg.isAlive(slot),participating:reg.isParticipating(slot)};
 const actor=captureUiActor(slot);
 if(actor===null||actor.steamId!==stamp.actor.steamId||actor.generation!==stamp.actor.generation||actor.roundEpoch!==stamp.actor.roundEpoch)return null;
 const pawn=pawnOf(slot)?.ref??null;
 // A same-Steam SDK reconnect can occur inside the pawn getter before Core receives its
 // lifecycle event. Seal against Core's retained connection token after that native read.
 return matchesUiActor(stamp.actor)&&matchesWorldActionContext(stamp)?{...stamp,pawn}:null;
}
export const worldActionMethods={getWorldActionContext,matchesWorldActionContext};
