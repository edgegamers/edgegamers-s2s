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
export function resultMessage(r: PurchaseResult): string {
  switch (r) {
    // Success is not a refusal and has no reason to give. Named explicitly so `default` keeps
    // meaning "a value nobody accounted for" — without this case it reads as an error, and a
    // caller that formats every result through here tells a player their purchase failed.
    case PurchaseResult.Success:
      return "";
    case PurchaseResult.InsufficientFunds:
      return "You do not have enough funds to complete this purchase";
    case PurchaseResult.NotFound:
      return "The item was not found in the shop";
    case PurchaseResult.NotPurchasable:
      return "You cannot purchase this item at the moment";
    case PurchaseResult.WrongRole:
      return "You do not have the required role to purchase this item";
    case PurchaseResult.Canceled:
      return "The purchase was canceled";
    case PurchaseResult.AlreadyOwned:
      return "You have purchased the maximum amount of this item";
    default:
      return "An unexpected error occurred";
  }
}
