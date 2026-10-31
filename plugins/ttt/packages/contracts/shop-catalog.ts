import type {ShopItemId} from './shop-wire.d.ts';
/** The existing port's registration order; this is pure identity, not a live catalogue. */
export const SHOP_ITEM_IDS:readonly ShopItemId[]=Object.freeze(["armor", "healthshot", "m4a1", "taser", "deagle", "stickers", "dna", "healthstation", "compass_body", "c4", "gloves", "camo", "bodypaint", "onehitknife", "silentawp", "poisonsmoke", "poisonshots", "clustergrenade", "damagestation", "compass_player", "tripwire"]);
export function isShopItemId(id:string):id is ShopItemId{return SHOP_ITEM_IDS.some(value=>value===id);}
