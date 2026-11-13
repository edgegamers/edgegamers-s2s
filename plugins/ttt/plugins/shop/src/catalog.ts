import type {ShopItemId,RoleId} from '../api';
import {register} from './shop';
import {canGrant,grant} from './runtime';
import {n} from './settings';
export const CATALOG:readonly {id:ShopItemId;nameKey:string;descriptionKey:string;role:RoleId;priceAlias:string;limit:number}[] = [
  {
    "id": "armor",
    "nameKey": "ttt.armor.name",
    "descriptionKey": "ttt.armor.description",
    "role": 0,
    "priceAlias": "sm_ttt_shop_armor_price",
    "limit": 0
  },
  {
    "id": "healthshot",
    "nameKey": "ttt.healthshot.name",
    "descriptionKey": "ttt.healthshot.description",
    "role": 0,
    "priceAlias": "sm_ttt_shop_healthshot_price",
    "limit": 2
  },
  {
    "id": "m4a1",
    "nameKey": "ttt.rifle.name",
    "descriptionKey": "ttt.rifle.description",
    "role": 0,
    "priceAlias": "sm_ttt_shop_m4a1_price",
    "limit": 0
  },
  {
    "id": "taser",
    "nameKey": "ttt.taser.name",
    "descriptionKey": "ttt.taser.description",
    "role": 0,
    "priceAlias": "sm_ttt_shop_taser_price",
    "limit": 0
  },
  {
    "id": "deagle",
    "nameKey": "ttt.revolver.name",
    "descriptionKey": "ttt.revolver.description",
    "role": 3,
    "priceAlias": "sm_ttt_shop_onedeagle_price",
    "limit": 1
  },
  {
    "id": "stickers",
    "nameKey": "ttt.stickers.name",
    "descriptionKey": "ttt.stickers.description",
    "role": 3,
    "priceAlias": "sm_ttt_shop_stickers_price",
    "limit": 1
  },
  {
    "id": "dna",
    "nameKey": "ttt.dna.name",
    "descriptionKey": "ttt.dna.description",
    "role": 3,
    "priceAlias": "sm_ttt_shop_dna_price",
    "limit": 1
  },
  {
    "id": "healthstation",
    "nameKey": "ttt.health_station.name",
    "descriptionKey": "ttt.health_station.description",
    "role": 3,
    "priceAlias": "sm_ttt_shop_healthstation_price",
    "limit": 0
  },
  {
    "id": "compass_body",
    "nameKey": "ttt.body_compass.name",
    "descriptionKey": "ttt.body_compass.description",
    "role": 3,
    "priceAlias": "sm_ttt_shop_compass_price",
    "limit": 1
  },
  {
    "id": "c4",
    "nameKey": "ttt.c4.name",
    "descriptionKey": "ttt.c4.description",
    "role": 2,
    "priceAlias": "sm_ttt_shop_c4_price",
    "limit": 0
  },
  {
    "id": "gloves",
    "nameKey": "ttt.gloves.name",
    "descriptionKey": "ttt.gloves.description",
    "role": 2,
    "priceAlias": "sm_ttt_shop_gloves_price",
    "limit": 1
  },
  {
    "id": "camo",
    "nameKey": "ttt.camouflage.name",
    "descriptionKey": "ttt.camouflage.description",
    "role": 2,
    "priceAlias": "sm_ttt_shop_camo_price",
    "limit": 1
  },
  {
    "id": "bodypaint",
    "nameKey": "ttt.body_paint.name",
    "descriptionKey": "ttt.body_paint.description",
    "role": 2,
    "priceAlias": "sm_ttt_shop_bodypaint_price",
    "limit": 1
  },
  {
    "id": "onehitknife",
    "nameKey": "ttt.one_hit_knife.name",
    "descriptionKey": "ttt.one_hit_knife.description",
    "role": 2,
    "priceAlias": "sm_ttt_shop_onehitknife_price",
    "limit": 1
  },
  {
    "id": "silentawp",
    "nameKey": "ttt.silent_awp.name",
    "descriptionKey": "ttt.silent_awp.description",
    "role": 2,
    "priceAlias": "sm_ttt_shop_silentawp_price",
    "limit": 1
  },
  {
    "id": "poisonsmoke",
    "nameKey": "ttt.poison_smoke.name",
    "descriptionKey": "ttt.poison_smoke.description",
    "role": 2,
    "priceAlias": "sm_ttt_shop_poisonsmoke_price",
    "limit": 1
  },
  {
    "id": "poisonshots",
    "nameKey": "ttt.poison_shots.name",
    "descriptionKey": "ttt.poison_shots.description",
    "role": 2,
    "priceAlias": "sm_ttt_shop_poisonshots_price",
    "limit": 1
  },
  {
    "id": "clustergrenade",
    "nameKey": "ttt.cluster_grenade.name",
    "descriptionKey": "ttt.cluster_grenade.description",
    "role": 2,
    "priceAlias": "sm_ttt_shop_clustergrenade_price",
    "limit": 1
  },
  {
    "id": "damagestation",
    "nameKey": "ttt.hurt_station.name",
    "descriptionKey": "ttt.hurt_station.description",
    "role": 2,
    "priceAlias": "sm_ttt_shop_damagestation_price",
    "limit": 3
  },
  {
    "id": "compass_player",
    "nameKey": "ttt.player_compass.name",
    "descriptionKey": "ttt.player_compass.description",
    "role": 2,
    "priceAlias": "sm_ttt_shop_compass_price",
    "limit": 1
  },
  {
    "id": "tripwire",
    "nameKey": "ttt.tripwire.name",
    "descriptionKey": "ttt.tripwire.description",
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
