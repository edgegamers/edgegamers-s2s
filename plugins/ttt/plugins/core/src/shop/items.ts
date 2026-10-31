/** Temporary finite grant bridge. Catalog, prices, wallet and counts belong to Shop. */
import type {ShopItemId,PurchaseResult} from '../../api';
import {n,list,s as str} from '../core/cvars';
import {msgFor} from '../core/msgs';
import {giveArmorWithHelmet} from '../cs2/handlers';
import {armStickers} from '../cs2/icons';
import {clearSlot,GearSlot,give,giveReplacing,replaceInSlot} from '../cs2/inventory';
import {tell} from '../cs2/pawn';
import * as fx from './effects';
import * as wfx from './weaponfx';
import {itemsAvailable,withItemGrant} from '../core/items-provider';

export function canGrantShopItem(_slot:number,id:ShopItemId):PurchaseResult {
 if(id!=='armor'&&id!=='healthshot'&&id!=='m4a1'&&!itemsAvailable())return 3;
 if(id==='c4')return fx.c4Count() >= n("sm_ttt_shop_c4_max_at_once") && n("sm_ttt_shop_c4_max_at_once") > 0
          ? 3
          : 0;
 return 0;
}

export function grantShopItem(slot:number,id:ShopItemId):boolean {
 return withItemGrant(slot,id,()=>{
 switch(id){
  case 'armor': {
      // `ArmorItem.OnPurchase` is `SetArmor(config.Armor, config.Helmet)` and `ArmorConfig.Helmet`
      // ships `true`, so the item has always included the helmet — a bare armor value leaves the
      // buyer taking full headshot damage, which is most of what they paid for.
      giveArmorWithHelmet(slot, n("sm_ttt_shop_armor_amount"));

      return true;
  }
  case 'healthshot': {
      give(slot, "weapon_healthshot");

      return true;
  }
  case 'm4a1': {
      // `sm_ttt_shop_m4a1_clear_slots` is an OPERATOR extra — slots to empty beyond the ones this
      // bundle needs. The bundle's own slots are freed by `giveReplacing` regardless, so an empty or
      // mis-set cvar can no longer cause the purchase to be dropped on the floor.
      for (const raw of list("sm_ttt_shop_m4a1_clear_slots")) {
        const idx = parseInt(raw, 10);
        if (Number.isFinite(idx)) clearSlot(slot, idx as GearSlot);
      }
      giveReplacing(slot, list("sm_ttt_shop_m4a1_weapons"));

      return true;
  }
  case 'taser': {
      // `grantTaser` is the whole of `TaserItem.OnPurchase`: remove-then-give of the CONFIGURED
      // weapon, so re-buying refreshes a spent taser. A hard-coded `give("weapon_taser")` here both
      // duplicated that grant and ignored `sm_ttt_shop_taser_weapon`.
      fx.grantTaser(slot);

      return true;
  }
  case 'deagle': {
      // Deferred by a frame — see `replaceInSlot`. A same-frame give landed while the pistol slot was
      // still occupied and the engine dropped the revolver at the Detective's feet.
      replaceInSlot(slot, GearSlot.Pistol, str("sm_ttt_shop_onedeagle_weapon"), 1, 0);
      fx.grantOneShotRevolver(slot);

      return true;
  }
  case 'stickers': {
      fx.grantStickers(slot);
      // The item's actual payoff is the PERSISTENT reveal: the C# `StickerListener` calls
      // `IIconManager.RevealToAll`, which makes the tased player's role icon transmit to every
      // client for the rest of the round. `fx.grantStickers` only arms the chat notification;
      // this arms the icon reveal in `icons.ts`, which owns the marker itself.
      armStickers(slot);

      return true;
  }
  case 'dna': {
      fx.grantDnaScanner(slot);

      return true;
  }
  case 'healthstation': {
      return fx.placeStation(slot, n("sm_ttt_shop_healthstation_increments"));

  }
  case 'compass_body': {
      fx.grantCompass(slot, fx.CompassMode.Bodies);

      return true;
  }
  case 'c4': {
      giveReplacing(slot, ["weapon_c4"]);
      fx.grantC4();
      wfx.applyC4Fuse();

      return true;
  }
  case 'gloves': {
      fx.grantGloves(slot, n("sm_ttt_shop_gloves_max_uses"));

      return true;
  }
  case 'camo': {
      fx.grantCamo(slot);

      return true;
  }
  case 'bodypaint': {
      fx.grantBodyPaint(slot, n("sm_ttt_shop_bodypaint_max_uses"));

      return true;
  }
  case 'onehitknife': {
      fx.grantOneHitKnife(slot);

      return true;
  }
  case 'silentawp': {
      // Free the primary slot first, or the engine has nowhere to put the AWP and drops it at the
      // buyer's feet — which also means they never hold it, so its silenced-shot grant does nothing.
      // The give is deferred a frame because the slot is not actually free until then; see
      // `replaceInSlot`.
      replaceInSlot(
        slot,
        GearSlot.Rifle,
        "weapon_awp",
        n("sm_ttt_shop_silentawp_current_ammo"),
        n("sm_ttt_shop_silentawp_reserve_ammo"),
      );
      wfx.grantSilentShots(
        slot,
        n("sm_ttt_shop_silentawp_current_ammo") + n("sm_ttt_shop_silentawp_reserve_ammo"),
      );

      return true;
  }
  case 'poisonsmoke': {
      give(slot, "weapon_smokegrenade");
      wfx.armPoisonSmoke(slot);

      return true;
  }
  case 'poisonshots': {
      // The counter lives in `weaponfx.ts`, not `effects.ts`: a charge is spent on FIRE (and the
      // same counter silences the pistol through the shared fire-sound hook), while `effects.ts`
      // only READS it to decide whether a landed pistol hit poisons.
      wfx.grantPoisonShots(slot, n("sm_ttt_shop_poisonshots_total"));

      return true;
  }
  case 'clustergrenade': {
      give(slot, "weapon_hegrenade");
      wfx.armCluster(slot);

      return true;
  }
  case 'damagestation': {
      return fx.placeStation(slot, n("sm_ttt_shop_damagestation_increments"));

  }
  case 'compass_player': {
      fx.grantCompass(slot, fx.CompassMode.Players);

      return true;
  }
  case 'tripwire': {
      // Buying arms a charge; the next USE press places it. Purchase can no longer fail, so the
      // refund-on-miss dance is gone with it — you are no longer forced to be standing in the right
      // doorway with the shop open to spend your credits.
      tell(slot, msgFor(slot, "SHOP_ITEM_TRIPWIRE_ARMED", fx.grantTripwire(slot)));

      return true;
  }
 }
 return false;
 });
}
