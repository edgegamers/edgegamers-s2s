/** The optional owner contains all private relay and voice rules. */
import type {TypedInterfaceHandle} from '@s2script/sdk/interfaces';
import type {Contract} from '../../../communication/api.d.ts';
import {inProgress} from '../game/game';
import * as reg from '../core/registry';
import {Commands} from '@s2script/sdk/commands';
let provider:TypedInterfaceHandle<Contract>|null=null;
export function bindCommunicationProvider(current:TypedInterfaceHandle<Contract>):{dispose():void} {
  const previous=provider;
  provider=current;
  try {current.applyServerSettings();}
  catch(error){if(provider===current)provider=previous;throw error;}
  return {dispose(){if(provider===current) provider=null;}};
}
export function handleChat(slot:number,text:string,teamOnly=false):0|2 {
  // Core's broadcast fence survives an optional owner's absence or an interop failure.
  const dead=inProgress()&&!reg.isAlive(slot)&&!text.startsWith('@');
  const privateLine=dead || inProgress()&&reg.roleOf(slot)===2&&!teamOnly&&text.startsWith('@');
  let result:0|2;
  try {result=provider?.handleChat(slot,text,teamOnly?1:0) ?? (privateLine?2:0);}
  catch(error){console.log(`[ttt] WARN: communication relay unavailable: ${String(error)}`);result=privateLine?2:0;}
  if(dead&&result===2)runBareCommand(slot,text);
  return result;
}
/**
 * A suppressed line never reaches plugins that act on bare chat words, so a dead player's `rtv` or
 * `nominate` did nothing. The line stays in dead chat; when it is one word naming a registered
 * command (`name` or `sm_name`), run it for the player as its `!` trigger would. Gating still applies.
 */
function runBareCommand(slot:number,text:string):void {
  const word=text.trim().toLowerCase();
  if(word===''||/\s/.test(word))return;
  try {
    if(!Commands.list().some(c=>c.name===word||c.name===`sm_${word}`))return;
    Commands.handleChatTrigger(slot,`${Commands.triggers.public}${word}`);
  } catch(error){console.log(`[ttt] WARN: dead-chat command ${word} failed: ${String(error)}`);}
}
// Finished/map/unload reset the owned policy explicitly; idle frames need no native roster scan.
export function tickCommunication():void { if(inProgress())provider?.tick(); }
export function resetCommunication():void { provider?.reset(); }
export function forgetCommunication(slot:number):void { provider?.forget(slot); }
export function applyCommunicationSettings():void { provider?.applyServerSettings(); }
