import type {CommunicationCoreMethods} from '../../../../packages/contracts/communication-types.ts';
import type {WorldCoreMethods, WorldPlayer} from '../../../../packages/contracts/world-types.ts';
import * as reg from './registry';
import {captureUiActor, matchesUiActor} from './ui-actor';
import {getWorldSettings} from './world-settings';
import {msgFor} from './msgs';
import {game, roundEpoch} from '../game/game';
import {pawnOf} from '../cs2/pawn';
import {MAX_SLOTS} from './enums';

/** These are copied observations; Core remains the only registry and round owner. */
export const featureObservations: Omit<WorldCoreMethods, 'scheduleWorldPreFrame'|'getWorldActionContext'|'matchesWorldActionContext'> & CommunicationCoreMethods = {
  matchesActor: matchesUiActor,
  getWorldSettings,
  getWorldPlayers(slot?:number) {
    // Select in the registry before any native identity/pawn capture. Omission keeps the roster API.
    const slots=slot===undefined?[...reg.activeSlots()]:
      Number.isInteger(slot)&&slot>=0&&slot<MAX_SLOTS&&reg.isConnected(slot)?[slot]:[];
    const epoch=roundEpoch(), rows:WorldPlayer[]=[];
    for(const slot of slots) {
      const actor=captureUiActor(slot);
      if(!actor || actor.roundEpoch!==epoch) continue;
      const pawn=pawnOf(slot)?.ref ?? null;
      const row={actor, name:reg.nameOf(slot), role:reg.roleOf(slot), alive:reg.isAlive(slot), participating:reg.isParticipating(slot), pawn};
      if(matchesUiActor(actor)) rows.push(row);
    }
    return roundEpoch()===epoch ? rows : [];
  },
  // A no-work hint only: callers must still capture native actors before voice/chat effects.
  hasCommunicationDeadPlayers: () => reg.activeSlots().some(slot => !reg.isAlive(slot)),
  getCommunicationKey() {
    let key=`${roundEpoch()}:${game.state}:`;
    for(const slot of reg.activeSlots()) if(!reg.isAlive(slot)) key+=`${slot}/${reg.generationOf(slot)}/${reg.steamIdOf(slot)},`;
    return key;
  },
  getCommunicationSnapshot() {
    const epoch=roundEpoch(), state=game.state, players=[];
    for(const slot of [...reg.activeSlots()]) {
      const actor=captureUiActor(slot);
      if(!actor || actor.roundEpoch!==epoch) continue;
      const row={slot, steamId:actor.steamId, generation:actor.generation, name:reg.nameOf(slot), role:reg.roleOf(slot), alive:reg.isAlive(slot), participating:reg.isParticipating(slot)};
      if(matchesUiActor(actor)) players.push(row);
    }
    return roundEpoch()===epoch ? {state,epoch,players} : {state:game.state,epoch:roundEpoch(),players:[]};
  },
  formatCommunication: (slot,key,args) => msgFor(slot,key,...args),
};
