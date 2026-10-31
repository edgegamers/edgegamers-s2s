import { plainPhraseFor as tr } from "../../../../packages/contracts/phrases.ts";
/** Compatibility calls preserve their old signatures; Shop owns all mutable shop state. */
export {bindShopProvider,getShopView,allItems,itemById,sortedFor,balanceOf,addBalance,canPurchase,tryPurchase,purchaseCount,refreshItems,resetShop} from '../core/shop-provider';
export type {ShopItem} from '../core/shop-provider';
/** Why a purchase was refused. */
export const enum PurchaseResult {
  Success = 0,
  InsufficientFunds = 1,
  NotFound = 2,
  NotPurchasable = 3,
  WrongRole = 4,
  Canceled = 5,
  AlreadyOwned = 6,
  UnknownError = 7,
}

/** A human-readable reason for a refusal. */
export function resultMessage(r: PurchaseResult, slot: number = -1): string {
  switch (r) {
    // Success is not a refusal and has no reason to give. Named explicitly so `default` keeps
    // meaning "a value nobody accounted for" — without this case it reads as an error, and a
    // caller that formats every result through here tells a player their purchase failed.
    case PurchaseResult.Success:
      return "";
    case PurchaseResult.InsufficientFunds:
      return tr(slot, "PURCHASE_REFUSAL_1");
    case PurchaseResult.NotFound:
      return tr(slot, "PURCHASE_REFUSAL_2");
    case PurchaseResult.NotPurchasable:
      return tr(slot, "PURCHASE_REFUSAL_3");
    case PurchaseResult.WrongRole:
      return tr(slot, "PURCHASE_REFUSAL_4");
    case PurchaseResult.Canceled:
      return tr(slot, "PURCHASE_REFUSAL_5");
    case PurchaseResult.AlreadyOwned:
      return tr(slot, "PURCHASE_REFUSAL_6");
    default:
      return tr(slot, "PURCHASE_REFUSAL_7");
  }
}
