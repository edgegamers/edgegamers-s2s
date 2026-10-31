/** Read-only compatibility for existing callers. Wallet/count/catalog state belongs to Shop. */
import type {TypedInterfaceHandle} from '@s2script/sdk/interfaces';
import type {Contract,ShopView,ShopItemView,ShopItemId} from '../../../shop/api.d.ts';
import {SHOP_ITEM_IDS,isShopItemId} from '../../../../packages/contracts/shop-catalog.ts';
import {game,inProgress} from '../game/game';
let provider:TypedInterfaceHandle<Contract>|null=null;
let binding=0;
export interface ShopItem {id:ShopItemId;nameKey:string;descKey:string;price:number;role:0|1|2|3|4;limit:number;}
function item(view:ShopItemView):ShopItem {return {id:view.id,nameKey:view.nameKey,descKey:view.descriptionKey,price:view.price,role:view.role,limit:view.limit};}
export function bindShopProvider(current:TypedInterfaceHandle<Contract>):{dispose():void} {
  const mine=++binding;provider=current;return {dispose(){if(provider===current&&binding===mine){binding++;provider=null;}}};
}
export function getShopView(slot:number):ShopView {return provider?.getView(slot)??{balance:0,rows:[]};}
export function shopProviderBinding():number{return binding;}
export function allItems():readonly ShopItem[] {
  const current=provider;if(!current)return [];
  const rows:ShopItem[]=[];
  for(const id of SHOP_ITEM_IDS){const view=current.getItem(id);if(view)rows.push(item(view));}
  return provider===current?rows:[];
}
export function itemById(id:string):ShopItem|undefined {
  if(!provider || !isShopItemId(id))return;
  const view=provider.getItem(id);return view?item(view):undefined;
}
export function sortedFor(slot:number,out:ShopItem[]):ShopItem[] {out.length=0;for(const row of getShopView(slot).rows)out.push(item(row));return out;}
export function balanceOf(slot:number):number {return provider?.balanceOf(slot)??0;}
export function addBalance(slot:number,amount:number,reason:string,print=true):void {provider?.addBalance(slot,amount,reason,print);}
export function canPurchase(slot:number,entry:ShopItem):0|1|2|3|4|5|6|7 {
  if(!provider || !isShopItemId(entry.id))return 2;
  if(!inProgress())return 3;
  return getShopView(slot).rows.find(row=>row.id===entry.id)?.gate??4;
}
export function tryPurchase(slot:number,entry:ShopItem,tellWhy=true):0|1|2|3|4|5|6|7 {
  return provider && isShopItemId(entry.id)?provider.tryPurchase(slot,entry.id,tellWhy):2;
}
export function purchaseCount(slot:number,entry:ShopItem):number {return getShopView(slot).rows.find(row=>row.id===entry.id)?.bought??0;}
export function refreshItems():void {provider?.refreshCatalog();}
export function resetShop():void {provider?.resetShop();}
export function tickEconomy(dt:number):void {provider?.tickEconomy(dt,game.state);}
