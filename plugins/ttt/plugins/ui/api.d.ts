/** Copied UI observations. Core owns identity, models and all gameplay/admin decisions. */
export interface UiActor { slot: number; steamId: string; generation: number; roundEpoch: number; }
export type UiTone = 'good' | 'warn' | 'bad';
export interface UiLogRow { a: string; b?: string; c?: string; disabled?: boolean; tone?: UiTone; }
export interface UiLogPage { rows: UiLogRow[]; round: number; count: number; }
export interface UiShopItem { itemId: string; name: string; description: string; price: number; limit: number; refusal: string | null; }
export interface UiShopStamp { mapEpoch: number; roundEpoch: number; state: number; role: number; alive: boolean; participating: boolean; shopBinding: number; }
export interface UiShopView { balance: number; rows: UiShopItem[]; stamp: UiShopStamp; }
export interface UiReport { binding: number; id: number; reporterName: string; accusedName: string; round: number; filed: number; reason: string; priorGuilty: number; suggestedSlays: number; }
export interface UiReportsView { rows: UiReport[]; baseSlays: number; maxQueued: number; }
export type UiReportAction = 'acquit' | 'convict' | 'ban';
export interface UiPurchaseReply { status: 'success' | 'refused' | 'unknown'; title: string; message: string; tone: UiTone; }
export interface UiRulingReply { status: 'success' | 'refused' | 'unknown'; title: string; message: string; tone: UiTone; }
export interface UiReportTarget { target: UiActor; name: string; }
export interface UiReportNotice { kind: 'awaiting' | 'result'; title: string; message: string; tone: UiTone; }
export interface UiModelMethods {
  matchesUiActor(actor: UiActor, stamp?: UiShopStamp): boolean;
  getUiShop(actor: UiActor): UiShopView | null;
  buyUiItem(actor: UiActor, itemId: string): UiPurchaseReply;
  getUiReports(actor: UiActor): UiReportsView | null;
  ruleUiReport(actor: UiActor, reportId: number, binding: number, action: UiReportAction, slays: number): UiRulingReply;
  getUiLogPage(actor: UiActor, at: number): UiLogPage | null;
  getUiAdmins(): UiActor[];
  answerUiReportPrompt(actor: UiActor, yes: boolean): boolean;
  getUiReportTargets(actor: UiActor): UiReportTarget[] | null;
  beginUiReport(actor: UiActor, target: UiActor): boolean;
}
export interface UiMethods {
  ensure(): string | null;
  showTraitor(actor: UiActor, mates: string[]): void;
  hideTraitor(actor: UiActor): void;
  isShopOpen(actor: UiActor): boolean;
  openShop(actor: UiActor): boolean;
  closeShop(actor: UiActor): void;
  openLogs(actor: UiActor, lines: UiLogRow[]): boolean;
  isLogsOpen(actor: UiActor): boolean;
  openLogBrowser(actor: UiActor): boolean;
  closeLogs(actor: UiActor): void;
  isRdmOpen(actor: UiActor): boolean;
  openRdm(actor: UiActor): void;
  closeRdm(actor: UiActor): void;
  refreshRdm(): void;
  notifyAdmins(title: string, message: string): void;
  openReportPrompt(actor: UiActor, accusedName: string): boolean;
  openReportPicker(actor: UiActor): boolean;
  reportNotice(actor: UiActor, notice: UiReportNotice): boolean;
  hideAll(actor: UiActor): void;
  resetAll(): void;
  forget(actor: UiActor): void;
}
export interface Contract { methods: UiMethods; forwards: {}; }
