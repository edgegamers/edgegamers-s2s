import type {ShopItemId,RoleId} from '../api';
import {register} from './shop';
import {canGrant,grant} from './runtime';
import {n} from './settings';
export const CATALOG:readonly {id:ShopItemId;nameKey:string;descriptionKey:string;role:RoleId;priceAlias:string;limit:number}[] = [
  {
    "id": "armor",
    "nameKey": "SHOP_ITEM_ARMOR",
    "descriptionKey": "SHOP_ITEM_ARMOR_DESC",
    "role": 0,
    "priceAlias": "sm_ttt_shop_armor_price",
    "limit": 0
  },
  {
    "id": "healthshot",
    "nameKey": "SHOP_ITEM_HEALTHSHOT",
    "descriptionKey": "SHOP_ITEM_HEALTHSHOT_DESC",
    "role": 0,
    "priceAlias": "sm_ttt_shop_healthshot_price",
    "limit": 2
  },
  {
    "id": "m4a1",
    "nameKey": "SHOP_ITEM_M4A1",
    "descriptionKey": "SHOP_ITEM_M4A1_DESC",
    "role": 0,
    "priceAlias": "sm_ttt_shop_m4a1_price",
    "limit": 0
  },
  {
    "id": "taser",
    "nameKey": "SHOP_ITEM_TASER",
    "descriptionKey": "SHOP_ITEM_TASER_DESC",
    "role": 0,
    "priceAlias": "sm_ttt_shop_taser_price",
    "limit": 0
  },
  {
    "id": "deagle",
    "nameKey": "SHOP_ITEM_DEAGLE",
    "descriptionKey": "SHOP_ITEM_DEAGLE_DESC",
    "role": 3,
    "priceAlias": "sm_ttt_shop_onedeagle_price",
    "limit": 1
  },
  {
    "id": "stickers",
    "nameKey": "SHOP_ITEM_STICKERS",
    "descriptionKey": "SHOP_ITEM_STICKERS_DESC",
    "role": 3,
    "priceAlias": "sm_ttt_shop_stickers_price",
    "limit": 1
  },
  {
    "id": "dna",
    "nameKey": "SHOP_ITEM_DNA",
    "descriptionKey": "SHOP_ITEM_DNA_DESC",
    "role": 3,
    "priceAlias": "sm_ttt_shop_dna_price",
    "limit": 1
  },
  {
    "id": "healthstation",
    "nameKey": "SHOP_ITEM_STATION_HEALTH",
    "descriptionKey": "SHOP_ITEM_STATION_HEALTH_DESC",
    "role": 3,
    "priceAlias": "sm_ttt_shop_healthstation_price",
    "limit": 0
  },
  {
    "id": "compass_body",
    "nameKey": "SHOP_ITEM_COMPASS_BODY",
    "descriptionKey": "SHOP_ITEM_COMPASS_BODY_DESC",
    "role": 3,
    "priceAlias": "sm_ttt_shop_compass_price",
    "limit": 1
  },
  {
    "id": "c4",
    "nameKey": "SHOP_ITEM_C4",
    "descriptionKey": "SHOP_ITEM_C4_DESC",
    "role": 2,
    "priceAlias": "sm_ttt_shop_c4_price",
    "limit": 0
  },
  {
    "id": "gloves",
    "nameKey": "SHOP_ITEM_GLOVES",
    "descriptionKey": "SHOP_ITEM_GLOVES_DESC",
    "role": 2,
    "priceAlias": "sm_ttt_shop_gloves_price",
    "limit": 1
  },
  {
    "id": "camo",
    "nameKey": "SHOP_ITEM_CAMO",
    "descriptionKey": "SHOP_ITEM_CAMO_DESC",
    "role": 2,
    "priceAlias": "sm_ttt_shop_camo_price",
    "limit": 1
  },
  {
    "id": "bodypaint",
    "nameKey": "SHOP_ITEM_BODY_PAINT",
    "descriptionKey": "SHOP_ITEM_BODY_PAINT_DESC",
    "role": 2,
    "priceAlias": "sm_ttt_shop_bodypaint_price",
    "limit": 1
  },
  {
    "id": "onehitknife",
    "nameKey": "SHOP_ITEM_ONE_HIT_KNIFE",
    "descriptionKey": "SHOP_ITEM_ONE_HIT_KNIFE_DESC",
    "role": 2,
    "priceAlias": "sm_ttt_shop_onehitknife_price",
    "limit": 1
  },
  {
    "id": "silentawp",
    "nameKey": "SHOP_ITEM_SILENT_AWP",
    "descriptionKey": "SHOP_ITEM_SILENT_AWP_DESC",
    "role": 2,
    "priceAlias": "sm_ttt_shop_silentawp_price",
    "limit": 1
  },
  {
    "id": "poisonsmoke",
    "nameKey": "SHOP_ITEM_POISON_SMOKE",
    "descriptionKey": "SHOP_ITEM_POISON_SMOKE_DESC",
    "role": 2,
    "priceAlias": "sm_ttt_shop_poisonsmoke_price",
    "limit": 1
  },
  {
    "id": "poisonshots",
    "nameKey": "SHOP_ITEM_POISON_SHOTS",
    "descriptionKey": "SHOP_ITEM_POISON_SHOTS_DESC",
    "role": 2,
    "priceAlias": "sm_ttt_shop_poisonshots_price",
    "limit": 1
  },
  {
    "id": "clustergrenade",
    "nameKey": "SHOP_ITEM_CLUSTER_GRENADE",
    "descriptionKey": "SHOP_ITEM_CLUSTER_GRENADE_DESC",
    "role": 2,
    "priceAlias": "sm_ttt_shop_clustergrenade_price",
    "limit": 1
  },
  {
    "id": "damagestation",
    "nameKey": "SHOP_ITEM_STATION_HURT",
    "descriptionKey": "SHOP_ITEM_STATION_HURT_DESC",
    "role": 2,
    "priceAlias": "sm_ttt_shop_damagestation_price",
    "limit": 3
  },
  {
    "id": "compass_player",
    "nameKey": "SHOP_ITEM_COMPASS_PLAYER",
    "descriptionKey": "SHOP_ITEM_COMPASS_PLAYER_DESC",
    "role": 2,
    "priceAlias": "sm_ttt_shop_compass_price",
    "limit": 1
  },
  {
    "id": "tripwire",
    "nameKey": "SHOP_ITEM_TRIPWIRE",
    "descriptionKey": "SHOP_ITEM_TRIPWIRE_DESC",
    "role": 2,
    "priceAlias": "sm_ttt_shop_tripwire_price",
    "limit": 0
  }
];
export function registerItems():void {
 for(const row of CATALOG){
  const item={id:row.id,nameKey:row.nameKey,descKey:row.descriptionKey,role:row.role,limit:row.limit,price:0,
   refresh(){item.price=n(row.priceAlias);},
   canPurchase:(slot:number)=>canGrant(slot,row.id),
   onPurchase:(slot:number)=>grant(slot,row.id),
  };
  register(item);
 }
}
