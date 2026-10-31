import type {
  UiActor, UiLogPage, UiModelMethods, UiPurchaseReply, UiReportsView,
  UiReportAction, UiReportTarget, UiRulingReply, UiShopView, UiShopStamp,
} from '../../../../packages/contracts/ui-types.ts';

/** Core checks identity and authority at invocation, never from a cached HUD row. */
export interface UiModelOwner {
  matchesActor(actor: UiActor): boolean;
  isAdmin(slot: number): boolean;
  canBuy(slot: number): boolean;
  shopStamp(slot: number): UiShopStamp;
  matchesShopStamp(actor: UiActor, stamp: UiShopStamp): boolean;
  shop(slot: number): Omit<UiShopView,'stamp'>;
  buy(slot: number, itemId: string): UiPurchaseReply;
  reports(): UiReportsView;
  rule(actor: UiActor, reportId: number, binding: number, action: UiReportAction, slays: number): UiRulingReply;
  logPage(at: number): UiLogPage;
  actors(): UiActor[];
  /** Player-side reports: any connected player may answer their own prompt or file one. */
  reportsAvailable(): boolean;
  answerPrompt(slot: number, yes: boolean): boolean;
  reportTargets(slot: number): UiReportTarget[];
  beginReport(slot: number, targetSlot: number): boolean;
}

const refusedPurchase = (): UiPurchaseReply => ({
  status: 'refused', title: 'Cannot buy', message: 'This purchase is no longer available', tone: 'warn',
});
const refusedRuling = (): UiRulingReply => ({
  status: 'refused', title: 'Cannot rule', message: 'This report or your access is no longer available', tone: 'warn',
});

export function createUiModels(owner: UiModelOwner): UiModelMethods {
  const authorized = (actor: UiActor): boolean => owner.matchesActor(actor) && owner.isAdmin(actor.slot) && owner.matchesActor(actor);
  return {
    matchesUiActor: (actor,stamp) => owner.matchesActor(actor)&&(stamp===undefined||owner.matchesShopStamp(actor,stamp)),
    getUiShop: (actor) => {
      if(!owner.matchesActor(actor))return null;
      const stamp=owner.shopStamp(actor.slot);
      if(!owner.matchesShopStamp(actor,stamp))return null;
      const view=owner.shop(actor.slot);
      return owner.matchesActor(actor)&&owner.matchesShopStamp(actor,stamp)?{...view,stamp}:null;
    },
    buyUiItem: (actor, itemId) => {
      if (!owner.matchesActor(actor) || !owner.canBuy(actor.slot) || !owner.matchesActor(actor) || typeof itemId !== 'string') return refusedPurchase();
      return owner.buy(actor.slot, itemId);
    },
    getUiReports: (actor) => {
      if(!authorized(actor))return null;
      const view=owner.reports();return authorized(actor)?view:null;
    },
    ruleUiReport: (actor, reportId, binding, action, slays) => {
      if (!authorized(actor) || !Number.isSafeInteger(reportId) || reportId <= 0 || !Number.isSafeInteger(binding) || binding <= 0 ||
          !['acquit', 'convict', 'ban'].includes(action) || !Number.isSafeInteger(slays) || slays < 0) return refusedRuling();
      return owner.rule(actor, reportId, binding, action, slays);
    },
    getUiLogPage: (actor, at) => {
      if (!authorized(actor) || !Number.isSafeInteger(at) || at < 0) return null;
      return owner.logPage(at);
    },
    getUiAdmins: () => owner.actors().filter(authorized),
    answerUiReportPrompt: (actor, yes) => owner.matchesActor(actor) && typeof yes === 'boolean' && owner.answerPrompt(actor.slot, yes),
    getUiReportTargets: (actor) => {
      if (!owner.matchesActor(actor) || !owner.reportsAvailable()) return null;
      const rows = owner.reportTargets(actor.slot);
      return owner.matchesActor(actor) ? rows : null;
    },
    beginUiReport: (actor, target) => {
      // The target row was copied at paint time; it must still be the same connection and round.
      if (!owner.matchesActor(actor) || !target || typeof target !== 'object' || !owner.matchesActor(target) || target.slot === actor.slot) return false;
      return owner.beginReport(actor.slot, target.slot);
    },
  };
}
