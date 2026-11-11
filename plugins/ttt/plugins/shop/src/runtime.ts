import {Player} from '@s2script/cs2';
import {Chat} from '@s2script/sdk/chat';
import type {CoreMethods} from '../../core/api';
import type {TypedPublishHandle} from '@s2script/sdk';
import type {Contract,ShopItemId,PurchaseResult,TttRoleName} from '../api';
import {getRoundSettings} from './settings';
import {phraseFor} from '../../../packages/contracts/phrases.ts';
import {plainText} from '../../../packages/contracts/presentation.ts';
export {chatPhraseFor as chatMsgFor} from '../../../packages/contracts/phrases.ts';
export const enum RoleId {None=0,Innocent=1,Traitor=2,Detective=3,Spectator=4}
export const enum GameState {Waiting=0,Countdown=1,InProgress=2,Finished=3}
export const MAX_SLOTS=64;
export const MAX_KARMA=100;
export const Priority={HIGH:40,LOW:80} as const;
let service:CoreMethods|null=null;
export function bindCore(core:CoreMethods):void{service=core;}
export function unbindCore():void{service=null;}
function core():CoreMethods{if(!service)throw Error('Shop requires current Core');return service;}
// Stats forwards: emission only, so gameplay is identical with or without a listener.
let forwards:TypedPublishHandle<Contract>|null=null;
export function bindForwards(handle:TypedPublishHandle<Contract>):void{forwards=handle;}
export function unbindForwards():void{forwards=null;}
const ROLE_NAMES:readonly TttRoleName[]=['none','innocent','traitor','detective','spectator'];
/** After a purchase was charged and delivered. */
export function forwardPurchase(slot:number,itemId:ShopItemId,price:number):void{
 const owner=service;
 if(forwards===null||owner===null)return;
 forwards.emit('OnPurchase',{round:owner.getGame().epoch,player:{slot,steamId:owner.steamIdOf(slot),name:owner.nameOf(slot)},
  role:ROLE_NAMES[owner.roleOf(slot)]??'none',itemId,price});
}
/** After a balance change committed. */
export function forwardBalanceChanged(slot:number,oldBalance:number,balance:number,reason:string):void{
 const owner=service;
 if(forwards===null||owner===null||oldBalance===balance)return;
 forwards.emit('OnBalanceChanged',{round:owner.getGame().epoch,player:{slot,steamId:owner.steamIdOf(slot),name:owner.nameOf(slot)},
  oldBalance,balance,reason:plainText(reason)});
}
export interface ShopViewState {owner:CoreMethods;state:number;epoch:number;role:number;}
export function captureShopViewState(slot:number):ShopViewState|null{
 const owner=core(),game=owner.getGame(),role=owner.roleOf(slot);
 return service===owner?{owner,state:game.state,epoch:game.epoch,role}:null;
}
export function shopViewOwnerCurrent(view:ShopViewState):boolean{return service===view.owner;}
export function matchesShopViewState(slot:number,view:ShopViewState):boolean{
 if(service!==view.owner)return false;
 // These Core handlers read copied game fields and registry arrays without SDK callbacks.
 const role=view.owner.roleOf(slot),game=view.owner.getGame();
 return service===view.owner&&role===view.role&&game.state===view.state&&game.epoch===view.epoch;
}
export const reg={activeSlots:()=>core().activeSlots(),roleOf:(s:number)=>core().roleOf(s),isAlive:(s:number)=>core().isAlive(s),isConnected:(s:number)=>core().isConnected(s),nameOf:(s:number)=>core().nameOf(s)};
export const game={get state(){return core().getGame().state;}};
export const cfg={get roleCredits(){const s=getRoundSettings().economy;return [0,s.startInnocent,s.startTraitor,s.startDetective,0];}};
export function inProgress():boolean{return game.state===GameState.InProgress;}
export function karmaOf(slot:number):number{return core().getKarmaValue(slot);}
export function minimumKarma():number{return core().getKarmaMinimum();}
export function canGrant(slot:number,id:ShopItemId):PurchaseResult{return core().canGrantShopItem(slot,id);}
export function grant(slot:number,id:ShopItemId):boolean{return core().grantShopItem(slot,id);}
export function msg(key:string,...args:(number|string)[]):string{return phraseFor(-1,key,...args);}
export function msgFor(slot:number,key:string,...args:(number|string)[]):string{return phraseFor(slot,key,...args);}
export function tell(slot:number,text:string):void{Chat.toSlot(slot,text);}
export function pawnOf(slot:number){return Player.fromSlot(slot)?.pawn??null;}
