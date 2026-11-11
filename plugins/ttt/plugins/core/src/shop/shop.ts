import { msgFor } from "../core/msgs";
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
export function resultMessage(r: PurchaseResult, slot = -1): string {
  switch (r) {
    // Success is not a refusal and has no reason to give. Named explicitly so `default` keeps
    // meaning "a value nobody accounted for" — without this case it reads as an error, and a
    // caller that formats every result through here tells a player their purchase failed.
    case PurchaseResult.Success:
      return "";
    case PurchaseResult.InsufficientFunds:
      return msgFor(slot, "ttt.shop.insufficient_funds");
    case PurchaseResult.NotFound:
      return msgFor(slot, "ttt.shop.purchase_not_found");
    case PurchaseResult.NotPurchasable:
      return msgFor(slot, "ttt.shop.purchase_unavailable");
    case PurchaseResult.WrongRole:
      return msgFor(slot, "ttt.shop.wrong_role");
    case PurchaseResult.Canceled:
      return msgFor(slot, "ttt.shop.purchase_canceled");
    case PurchaseResult.AlreadyOwned:
      return msgFor(slot, "ttt.shop.purchase_limit");
    default:
      return msgFor(slot, "ttt.shop.purchase_error");
  }
}
