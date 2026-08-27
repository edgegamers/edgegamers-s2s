export type TttPurchaseResult =
  | "success"
  | "insufficient_funds"
  | "not_found"
  | "not_purchasable"
  | "wrong_role"
  | "canceled"
  | "limit_reached"
  | "delivery_failed";

export type TttGrantResult =
  | "success"
  | "not_found"
  | "delivery_failed"
  | "delivery_unavailable";

export interface TttShopItem {
  id: string;
  name: string;
  description: string;
  price: number;
  enabled: boolean;
  allowedRoles?: readonly string[];
  allowedTeams?: readonly string[];
  limit?: number;
}

export type TttBalanceChangeSource = "add" | "set" | "purchase" | "refund" | "reset" | "clear";

export interface TttBalanceChangedEvent {
  slot: number;
  previousBalance: number;
  newBalance: number;
  delta: number;
  reason: string;
  source: TttBalanceChangeSource;
}

export interface TttPurchaseCommittedEvent {
  slot: number;
  itemId: string;
  price: number;
  balance: number;
  purchaseCount: number;
}

/** Committed observational events emitted through the interface handle's reserved `.on(...)`. */
export interface TttShopForwards {
  balanceChanged: TttBalanceChangedEvent;
  purchaseCommitted: TttPurchaseCommittedEvent;
}

export interface TttShopApi {
  registerItem(item: TttShopItem): void;
  itemById(id: string): TttShopItem | null;
  allItems(): readonly TttShopItem[];
  balanceOf(slot: number): number;
  addBalance(slot: number, amount: number, reason?: string, notify?: boolean): void;
  setBalance(slot: number, amount: number, reason?: string, notify?: boolean): void;
  clearSlot(slot: number, reason?: string): void;
  resetRound(): void;
  tryPurchase(slot: number, itemId: string, notify?: boolean): TttPurchaseResult;
  canPurchase(slot: number, itemId: string): TttPurchaseResult;
  tryGrantItem(slot: number, itemId: string): TttGrantResult;
  grantItem(slot: number, itemId: string): boolean;
  setPurchaseBlock(name: string, reason?: string): void;
  clearPurchaseBlock(name: string): void;
  setBalanceGainMultiplier(name: string, multiplier: number): void;
  clearBalanceGainMultiplier(name: string): void;
}
