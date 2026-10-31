import {publish,use} from '@s2script/sdk/plugin';
import type {ShopMethods,ShopItemView} from '../api';
import {createFeatureAdapter,type FeatureAdapter} from '../../../packages/contracts/ordered.ts';
import {bindCore,unbindCore} from './runtime';
import {initializeSettings,disposeSettings,getRoundSettings,refreshSettings} from './settings';
import {registerItems} from './catalog';
import {installEconomy,tickEconomy} from './economy';
import * as shop from './shop';
import {loadPhrases} from '../../../packages/contracts/phrases.ts';
let adapter:FeatureAdapter|null=null;
function itemView(item:shop.ShopItem):ShopItemView{return {id:item.id,nameKey:item.nameKey,descriptionKey:item.descKey,price:item.price,role:item.role,limit:item.limit};}
export function OnPluginStart():void{
  loadPhrases();
 const core=use('@edgegamers/ttt-core');bindCore(core);initializeSettings();
 const current=createFeatureAdapter('economy',{emit:event=>core.dispatchDomain(event),has:kind=>core.hasDomain(kind),log:m=>console.log(m)});
 adapter=current;shop.initShop(current.bus);registerItems();shop.refreshItems();installEconomy(current.bus);
 const methods:ShopMethods={getHandlers:()=>current.getHandlers(),handleDomain:c=>current.handleDomain(c),getView:shop.getView,
 getItem:id=>{const item=shop.itemById(id);return item?itemView(item):null;},balanceOf:shop.balanceOf,addBalance:shop.addBalance,
 tryPurchase:(slot,id,tellWhy)=>{const item=shop.itemById(id);return item?shop.tryPurchase(slot,item,tellWhy):shop.PurchaseResult.NotFound;},
 resetShop:shop.resetShop,tickEconomy,refreshSettings,getRoundSettings,refreshCatalog:shop.refreshItems};
 publish('@edgegamers/ttt-shop',methods);
}
export function OnPluginEnd():void{adapter?.bus.clear();adapter=null;shop.resetShop();disposeSettings();unbindCore();}
