export type TttPurchaseResult =
  | "success"
  | "insufficient_funds"
  | "not_found"
  | "not_purchasable"
  | "wrong_role"
  | "canceled"
  | "limit_reached"
  | "delivery_failed";

export interface TttShopItem {
  id: string;
  name: string;
  description: string;
  price: number;
  enabled: boolean;
  allowedRoles?: readonly string[];
  allowedTeams?: readonly string[];
  limit?: number;
  canPurchase?(slot: number): TttPurchaseResult | "success";
  onPurchase(slot: number): void | boolean;
}

export type TttBalanceChangeSource = "add" | "set" | "purchase" | "refund" | "reset" | "clear";

export interface TttBalanceChangingEvent {
  slot: number;
  previousBalance: number;
  /** Listeners may replace this value when mutable is true. */
  newBalance: number;
  reason: string;
  source: TttBalanceChangeSource;
  /** Refund, reset, and clear writes are authoritative to preserve transactional/lifecycle guarantees. */
  mutable: boolean;
}

export interface TttBalanceChangedEvent {
  slot: number;
  previousBalance: number;
  newBalance: number;
  delta: number;
  reason: string;
  source: TttBalanceChangeSource;
}

export interface TttPurchaseAttemptEvent {
  slot: number;
  itemId: string;
  price: number;
  balance: number;
  /** Cancellation leaves the balance, delivery, and purchase count untouched. */
  canceled: boolean;
}

export interface TttPurchaseCommittedEvent {
  slot: number;
  itemId: string;
  price: number;
  balance: number;
  purchaseCount: number;
}

export interface TttShopEvents {
  /** Runs before a balance write; lower listener priorities run first and mutable changes may be replaced. */
  balanceChanging: TttBalanceChangingEvent;
  /** Runs after a balance write has committed. */
  balanceChanged: TttBalanceChangedEvent;
  /** Runs after all purchase gates pass and before charging or delivery. */
  purchaseAttempt: TttPurchaseAttemptEvent;
  /** Runs only after charging, successful delivery, and purchase-count commit. */
  purchaseCommitted: TttPurchaseCommittedEvent;
}

export interface TttShopListenerOptions {
  /** Lower numbers run first; equal priorities retain registration order. */
  priority?: number;
  /** Skip this listener when an earlier listener canceled a cancelable event. */
  ignoreCanceled?: boolean;
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
  on<K extends keyof TttShopEvents>(
    event: K,
    handler: (event: TttShopEvents[K]) => void,
    options?: TttShopListenerOptions,
  ): void;
}
