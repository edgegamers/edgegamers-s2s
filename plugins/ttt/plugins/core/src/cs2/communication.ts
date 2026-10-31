/** The optional owner contains all private relay and voice rules. */
import type {TypedInterfaceHandle} from '@s2script/sdk/interfaces';
import type {Contract} from '../../../communication/api.d.ts';
import {inProgress} from '../game/game';
import * as reg from '../core/registry';
let provider:TypedInterfaceHandle<Contract>|null=null;
export function bindCommunicationProvider(current:TypedInterfaceHandle<Contract>):{dispose():void} {
  const previous=provider;
  provider=current;
  try {current.applyServerSettings();}
  catch(error){if(provider===current)provider=previous;throw error;}
  return {dispose(){if(provider===current) provider=null;}};
}
export function handleChat(slot:number,text:string):0|2 {
  // Core's broadcast fence survives an optional owner's absence or an interop failure.
  const privateLine=inProgress() && (!reg.isAlive(slot)&&!text.startsWith('@') || reg.roleOf(slot)===2&&text.startsWith('@'));
  try {return provider?.handleChat(slot,text) ?? (privateLine?2:0);}
  catch(error){console.log(`[ttt] WARN: communication relay unavailable: ${String(error)}`);return privateLine?2:0;}
}
// Finished/map/unload reset the owned policy explicitly; idle frames need no native roster scan.
export function tickCommunication():void { if(inProgress())provider?.tick(); }
export function resetCommunication():void { provider?.reset(); }
export function forgetCommunication(slot:number):void { provider?.forget(slot); }
export function applyCommunicationSettings():void { provider?.applyServerSettings(); }
