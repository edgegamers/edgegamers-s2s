import {Server} from '@s2script/sdk/server';
import {game,roundEpoch,restoreRoundIdentity} from '../game/game';
import * as reg from './registry';
import {GameState,MAX_SLOTS} from './enums';

interface ReloadState {
 version:1;mapName:string;gameState:GameState;roundEpoch:number;
 connectionGenerations:number[];roundsThisMap:number;
}

/** Captured by OnPluginState before unload changes round/registry state. Plain copied data only. */
export function snapshotReloadState():ReloadState {
 return {version:1,mapName:Server.mapName,gameState:game.state,roundEpoch:roundEpoch(),
  connectionGenerations:reg.connectionGenerationsSnapshot(),roundsThisMap:game.roundsThisMap};
}
function integer(value:unknown,max:number):value is number {
 return typeof value==='number'&&Number.isSafeInteger(value)&&value>=0&&value<=max;
}
/** Called once from OnPluginStart, before fresh engine seeding. Reject malformed state atomically. */
export function restoreReloadState(previous:unknown):boolean {
 try {
  if(previous===null||typeof previous!=='object'||Array.isArray(previous))return false;
  const source=previous as Partial<ReloadState>;
  const {version,mapName,gameState,roundEpoch:priorEpoch,roundsThisMap,connectionGenerations}=source;
  if(version!==1||typeof mapName!=='string'||mapName.length>256||mapName.includes('\0')||
   !integer(gameState,GameState.Finished)||!integer(priorEpoch,Number.MAX_SAFE_INTEGER-1)||
   !integer(roundsThisMap,Number.MAX_SAFE_INTEGER-1)||!Array.isArray(connectionGenerations)||
   connectionGenerations.length!==MAX_SLOTS)return false;
  // Uint32 registry storage needs one increment of headroom for fresh seedFromEngine/addPlayer.
  const floors=Array.from({length:MAX_SLOTS},(_,slot)=>connectionGenerations[slot]);
  if(!floors.every(value=>integer(value,0xfffffffe)))return false;
  const completed=mapName===Server.mapName?roundsThisMap+(gameState===GameState.InProgress?1:0):0;
  reg.restoreConnectionGenerationFloors(floors);
  restoreRoundIdentity(priorEpoch,completed);
  return true;
 } catch { return false; }
}
