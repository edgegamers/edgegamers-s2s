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

export interface TttShopApi {
  registerItem(item: TttShopItem): void;
  itemById(id: string): TttShopItem | null;
  allItems(): readonly TttShopItem[];
  balanceOf(slot: number): number;
  addBalance(slot: number, amount: number, reason?: string, notify?: boolean): void;
  setBalance(slot: number, amount: number, reason?: string, notify?: boolean): void;
  resetRound(): void;
  tryPurchase(slot: number, itemId: string, notify?: boolean): TttPurchaseResult;
  canPurchase(slot: number, itemId: string): TttPurchaseResult;
}
