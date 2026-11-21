/** Copied UI observations. Core owns identity, models and all gameplay/admin decisions. */
export interface UiActor { slot: number; steamId: string; generation: number; roundEpoch: number; }
export type UiTone = 'good' | 'warn' | 'bad';
export interface UiLogRow { a: string; b?: string; c?: string; disabled?: boolean; tone?: UiTone; }
export interface UiLogPage { rows: UiLogRow[]; round: number; count: number; }
/** Which shop tab an item sits under: its role's own, or shared by every role that can buy. */
export type UiShopGroup = 'shared' | 'innocent' | 'traitor' | 'detective';
export interface UiShopItem { itemId: string; name: string; description: string; price: number; limit: number; refusal: string | null; group?: UiShopGroup; }
export interface UiShopStamp { mapEpoch: number; roundEpoch: number; state: number; role: number; alive: boolean; participating: boolean; shopBinding: number; }
export interface UiShopView { balance: number; rows: UiShopItem[]; stamp: UiShopStamp; }
export interface UiReport { binding: number; id: number; reporterName: string; accusedName: string; round: number; filed: number; reason: string; priorGuilty: number; suggestedSlays: number; }
export interface UiReportsView { rows: UiReport[]; baseSlays: number; maxQueued: number; }
export type UiReportAction = 'acquit' | 'convict' | 'ban';
export interface UiPurchaseReply { status: 'success' | 'refused' | 'unknown'; title: string; message: string; tone: UiTone; }
export interface UiRulingReply { status: 'success' | 'refused' | 'unknown'; title: string; message: string; tone: UiTone; }
export interface UiReportTarget { target: UiActor; name: string; }
export interface UiReportNotice { kind: 'awaiting' | 'result'; title: string; message: string; tone: UiTone; }
/** One viewer's in-round HUD. Core decides what this viewer may know; UI only paints it. */
export type UiRoundPhase = 'waiting' | 'countdown' | 'live' | 'finished';
export type UiRoundRole = 'none' | 'innocent' | 'traitor' | 'detective' | 'spectator';
export interface UiRoundHud { phase: UiRoundPhase; clock: number; round: number; alive: number; participants: number; bodies: number; role: UiRoundRole; living: boolean; health: number; maxHealth: number; karma: number; maxKarma: number; }
export interface UiRoundHudRow { actor: UiActor; hud: UiRoundHud; }
/** One viewer's spectate hub or intro. Core decides who gets one and what they may see; UI only paints it. */
export interface UiHubPlayer { slot: number; name: string; health: number; detective: boolean; }
export interface UiHub { intro: boolean; canJoin: boolean; phase: UiRoundPhase; round: number; players: UiHubPlayer[]; }
export interface UiHubRow { actor: UiActor; hub: UiHub; }
export type UiRoundWinner = 'traitor' | 'innocent' | 'none';
export interface UiSummaryPlayer { name: string; role: UiRoundRole; alive: boolean; }
/** The round-end sheet. Roles are public once a round ends, so every viewer gets the same one. */
export interface UiRoundSummary { winner: UiRoundWinner; reason: string | null; round: number; players: UiSummaryPlayer[]; }
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
  paintRoundHud(rows: UiRoundHudRow[]): void;
  roleToast(actor: UiActor, role: UiRoundRole): void;
  hideRoundHud(): void;
  paintHubs(rows: UiHubRow[]): void;
  roundSummary(actors: UiActor[], summary: UiRoundSummary): void;
}
export interface Contract { methods: UiMethods; forwards: {}; }
