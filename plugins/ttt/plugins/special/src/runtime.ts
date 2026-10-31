import {settingsNumber} from './settings';
import { Chat } from '@s2script/sdk/chat';
import type { CoreMethods } from '../../core/api';
import {phraseFor} from '../../../packages/contracts/phrases.ts';
export const enum RoleId { None=0, Innocent=1, Traitor=2, Detective=3, Spectator=4 }
export const enum GameState { Waiting=0, Countdown=1, InProgress=2, Finished=3 }
export const Priority = { HIGHEST:10, HIGH:40, LOW:80 } as const;
let core: CoreMethods | null = null;
export function bindCore(service:CoreMethods):void { core=service; }
export function unbindCore():void { core=null; }
function current():CoreMethods { if(core===null) throw new Error('Special requires the current Core provider'); return core; }
export const reg = {
  activeSlots:():number[]=>current().activeSlots(),
  roleOf:(slot:number):RoleId=>current().roleOf(slot),
  isAlive:(slot:number):boolean=>current().isAlive(slot),
};
export const game = {
  get participants():number { return current().getGame().participants; },
  get roundsThisMap():number { return current().getGame().roundsThisMap; },
};
export function n(name:string):number { return settingsNumber(name); }
export function msg(key:string,...args:(number|string)[]):string { return phraseFor(-1,key,...args); }
export function msgFor(slot:number,key:string,...args:(number|string)[]):string { return phraseFor(slot,key,...args); }
export function tell(slot:number,message:string):void { Chat.toSlot(slot,message); }
export function tellAll(message:string|((slot:number)=>string)):void {
  if(typeof message==='string'){Chat.toAll(message);return;}
  for(const slot of [...current().activeSlots()])Chat.toSlot(slot,message(slot));
}
export function setRoundDeadline(seconds:number):void { current().setRoundDeadline(seconds); }
export function balanceOf(slot:number):number { return current().getBalance(slot); }
export function addBalance(slot:number,amount:number,reason:string,print=true):void { current().addBalance(slot,amount,reason,print); }
export function setSuppressPistols(on:boolean):void { current().setSuppressPistols(on); }
