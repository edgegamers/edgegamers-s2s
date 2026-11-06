/** Existing-port hudkit surfaces; Core supplies copied models and owns actions. */
import type { Badge, Components, Modal, ModalSpec, Row, UiSurfaceHandle } from '@s2script/cs2/ui';
import { CustomHudLayout, hudkit } from '@s2script/cs2';
import { Server } from '@s2script/sdk/server';
import type { UiActor, UiLogRow, UiLogPage, UiShopView, UiReportsView, UiReport, UiReportAction, UiModelMethods, UiReportNotice, UiReportTarget } from '../api';
const RDM_PAGE = 6, LOG_PAGE = 8, BUY_DEBOUNCE = 0.3;
/**
 * A second pick of the same shop row inside this window buys it. The floor keeps one physical
 * click delivered twice in the same tick, or the next one, from counting as a double-click.
 */
const DOUBLE_CLICK_MIN = 0.05, DOUBLE_CLICK_MAX = 0.4;
/** Matches Reports' CONTEXT_SECONDS: the reason callout never outlives the chat capture. */
const REASON_SECONDS = 120;
/** What the player-side report sheet is showing: the victim's yes/no, or the `!report` picker. */
type ReportMode = { kind: 'prompt'; accusedName: string } | { kind: 'pick'; targets: UiReportTarget[] };
const equal = (a: UiActor | undefined, b: UiActor): boolean => !!a && a.slot === b.slot && a.steamId === b.steamId && a.generation === b.generation && a.roundEpoch === b.roundEpoch;
interface ShopPaint {actor:UiActor|null;view:UiShopView|null;}
function ago(filed: number, now: number): string { const s = Math.max(0, Math.floor(now-filed)); return s < 10 ? 'just now' : s < 60 ? `${s}s ago` : `${Math.floor(s/60)}m ago`; }
export class TttHud {
  private live = true;
  private readonly ui: Components;
  private readonly badge: Badge | null;
  private shop: Modal | null = null;
  private rdm: Modal | null = null;
  private logs: Modal | null = null;
  private report: Modal | null = null;
  private readonly shopSpec: ModalSpec;
  private readonly rdmSpec: ModalSpec;
  private readonly logsSpec: ModalSpec;
  private readonly reportSpec: ModalSpec;
  private readonly reportModes = new Map<number, ReportMode>();
  private readonly reasonCallouts = new Map<number, UiSurfaceHandle>();
  private readonly actors = new Map<number, UiActor>();
  private readonly shopViews = new Map<number, UiShopView>();
  // Stock hudkit collects rows, detail, then subtitle before driving native panels. This
  // token lives only through that collection; a nested paint supersedes the outer token.
  private readonly shopPaints = new Map<number, ShopPaint>();
  private readonly reportViews = new Map<number, UiReportsView>();
  private readonly logPages = new Map<number, UiLogPage>();
  private readonly logAt = new Map<number, number>();
  private readonly slayOverride = new Map<number, number>();
  private readonly banArmed = new Map<number, {id:number;binding:number}>();
  private readonly lastBuyAt = new Map<number, number>();
  private readonly lastPick = new Map<number, {index:number;itemId:string|undefined;at:number}>();
  private readonly log = (line: string): void => console.log(`[ttt/ui] ${line}`);
  constructor(private readonly core: UiModelMethods) {
    // The kit MUST come from this plugin's own ctx-bound layout, not from the module-level
    // `hudkit`. They are two different ui instances with separate button-handler tables and
    // separate click subscriptions: `hudkit` resolves through `hostKit()`, which builds its base
    // with a stand-in `reg` and is first resolved during prelude eval — outside the load window,
    // where the click hook cannot subscribe. Panels claimed through it PAINT but never receive a
    // click. Passing the descriptor explicitly bypasses the shared instance and binds this kit to
    // the ctx whose hook is live. Measured: the client sent `s2_m1_r1`, the raw ctx observer saw
    // it, and the modal's own onPick never fired.
    this.ui = CustomHudLayout.components({ ...hudkit.spec, observable: false });
    this.badge = this.ui.badge({ corner: "tr", accent: "bad" });

    // THREE SEPARATE SHEETS, deliberately — do NOT merge them again.
    //
    // A previous change folded all three into one claimed sheet with a per-slot mode, to live
    // inside the two-sheet pool. It is wrong, and the reason is in `components.js`: the footer
    // click handlers are ONE ARRAY PER MODAL, rebuilt on every paint —
    //
    //     var footerFns = [];   // resolved per paint, read by the click handlers below
    //
    // The row and button TEXT is per-player (it goes through the *ForPlayer* natives), but the
    // handlers are not. So a single sheet serving a player the shop and an admin the RDM queue
    // paints each of them the right labels and then dispatches whichever set was painted LAST to
    // both. Live result: a player's shop showing a Ban button.
    //
    // One sheet can serve any number of players the SAME spec — `open(slot)` is per-player — but
    // never different button sets. Surfaces with different footers need different modals.
    this.shopSpec = {
      title: "TTT Shop",
      subtitle: (slot) => this.shopSubtitle(slot),
      rows: (slot) => this.shopRows(slot),
      // Clicking a row SELECTS it. Buying is a second, deliberate action — the Buy button or a
      // double-click on the same row: a mis-click must not spend credits, and one physical click can
      // reach us more than once (see DOUBLE_CLICK_MIN).
      // hudkit paints after onPick; that paint also consumes this queued update.
      onPick: (slot, index) => { if (this.isDoubleClick(slot, index)) this.buySelected(slot); else this.shop?.invalidate(slot); },
      detail: (slot, row, cursor) => this.shopDetail(slot, cursor),
      width: "sm",
      buttons: [
        { text: "Buy", variant: "good", onClick: (slot) => this.buySelected(slot) },
        { text: "Close", variant: "ghost", onClick: (slot) => this.closeShop(slot) },
      ],
    };

    this.logsSpec = {
      title: "Round Log",
      subtitle: (slot) => {
        if (!this.logAuthorized(slot)) return '';
        const at = this.logAt.get(slot) ?? 0;
        const page = this.logPages.get(slot);
        const n = page?.rows.length ?? 0;
        return `round ${page?.round ?? 0} - ${n} entr${n === 1 ? "y" : "ies"}` +
          ((page?.count ?? 0) > 1 ? ` - ${at + 1}/${page?.count ?? 0}` : "");
      },
      pageSize: LOG_PAGE,
      width: "xl",
      rows: (slot) => this.logAuthorized(slot) ? this.logPages.get(slot)?.rows ?? [] : [],
      // Rows are plain text: picking one selects it so a long line can be read in the detail box.
      onPick: (slot) => { this.logs?.invalidate(slot); },
      detail: (slot, row) => (!this.logAuthorized(slot) || row === undefined ? [] : [row.a]),
      // Three, because the log always pages and paging claims the trailing two footer slots.
      buttons: [
        { text: "Close", variant: "ghost", onClick: (slot) => this.closeLogs(slot) },
        { text: "Older", variant: "ghost", onClick: (slot) => this.stepLog(slot, +1) },
        { text: "Newer", variant: "ghost", onClick: (slot) => this.stepLog(slot, -1) },
      ],
    };

    this.rdmSpec = {
      title: "RDM Reports",
      subtitle: (slot) => this.reportsSubtitle(slot),
      pageSize: RDM_PAGE,
      width: "lg",
      rows: (slot) => this.rdmRows(slot),
      // Moving the cursor drops BOTH pieces of per-report scratch: a slay count typed for one
      // report must not carry onto the next, and an armed ban must never survive the move.
      onPick: (slot) => {
        this.slayOverride.delete(slot);
        this.banArmed.delete(slot);
        this.rdm?.invalidate(slot);
      },
      detail: (slot, row, cursor) => this.rdmDetail(slot, cursor),
      // FIVE is the ceiling and paging claims two, so the ± steppers became one cycling button to
      // make room for Ban. Only the LABELS vary per slot here; the handler SET is identical for
      // every admin, which is what keeps this safe under the shared-footerFns rule above.
      buttons: (slot) => [
        { text: "Close", variant: "ghost" as const, onClick: (s: number) => this.closeRdm(s) },
        { text: `Slays: ${this.slaysFor(slot)}`, variant: "ghost" as const, onClick: (s: number) => this.cycleSlays(s) },
        { text: "Acquit", variant: "good" as const, onClick: (s: number) => this.verdict(s, 'acquit') },
        { text: "Convict", variant: "bad" as const, onClick: (s: number) => this.verdict(s, 'convict') },
        { text: this.banArmedFor(slot) ? "Confirm ban" : "Ban", variant: "bad" as const, onClick: (s: number) => this.banStep(s) },
      ],
    };

    // The PLAYER side of RDM: the victim's "were you RDM'd?" and the `!report` picker. A fourth sheet
    // because its footer is neither the shop's nor the admin queue's. Both modes share one handler
    // set — the press reads which mode this player is in — and only the second label differs.
    // Chat still carries the reason itself: the HUD has no text entry, so after Report the sheet
    // closes and a callout tells the player to type it.
    this.reportSpec = {
      title: (slot) => this.reportModes.get(slot)?.kind === 'pick' ? "Report a player" : "Were you RDM'd?",
      subtitle: (slot) => { const mode = this.reportModes.get(slot); return mode?.kind === 'pick' ? `${mode.targets.length} player${mode.targets.length === 1 ? '' : 's'}` : ''; },
      rows: (slot) => this.reportRows(slot),
      onPick: (slot) => { this.report?.invalidate(slot); },
      detail: (slot, row, cursor) => this.reportDetail(slot, cursor),
      width: "sm",
      buttons: (slot) => [
        { text: "Report", variant: "bad" as const, onClick: (s: number) => this.reportSelected(s) },
        { text: this.reportModes.get(slot)?.kind === 'pick' ? "Close" : "Not RDM", variant: "ghost" as const, onClick: (s: number) => this.dismissReport(s) },
      ],
    };

    const b = this.ui.budget();
    this.log(`components ready — interned ${b.panelIds} panel id(s), ${b.classNames} class(es), ` +
      `${b.variables} variable(s); cap ${b.cap} each`);
  }

  private actor(slot: number): UiActor | null {
    const a = this.actors.get(slot);
    if (!this.live || !a) return null;
    const valid = this.core.matchesUiActor(a);
    if (!valid && equal(this.actors.get(slot), a)) this.forgetLocal(slot);
    return valid && equal(this.actors.get(slot), a) ? a : null;
  }
  private capture(a: UiActor): boolean {
    if (!this.live || !this.core.matchesUiActor(a)) return false;
    const old = this.actors.get(a.slot);
    if (old && !equal(old, a)) this.forgetLocal(a.slot);
    this.actors.set(a.slot, { ...a });
    return this.actor(a.slot) !== null;
  }
  private owns(a: UiActor): boolean { return equal(this.actors.get(a.slot), a) && this.actor(a.slot) !== null; }
  ensure(): string | null { return this.live ? this.ui.ensure() : 'UI provider ended'; }
  showTraitor(a: UiActor, mates: string[]): void { if (this.capture(a)) this.badge?.show(a.slot, { title: 'TRAITOR', text: mates.length ? mates.join(', ') : 'you work alone' }); }
  hideTraitor(a: UiActor): void { if (this.owns(a)) this.badge?.hide(a.slot); }
  isShopOpen(a: UiActor): boolean { return this.owns(a) && (this.shop?.isOpen(a.slot) ?? false); }
  openShop(a: UiActor): boolean {
    if (!this.capture(a)) return false;
    const model = this.core.getUiShop(a);
    if (!model || !this.owns(a)) return false;
    this.shopViews.set(a.slot, model);
    const why = this.ui.ensure();
    if (why !== null) { this.log(`shop HUD unavailable: ${why}`); return false; }
    const shop = this.claimShop();
    if (!shop || !this.owns(a)) return false;
    this.ui.hideAll(a.slot);
    const opened=shop.tryOpen(a.slot);
    if(!opened.ok)return false;
    const b = this.ui.budget();
    this.log(`shop opened for slot ${a.slot}: ${model.rows.length} row(s) | interned ${b.panelIds} id(s) / ${b.variables} var(s) / ${b.classNames} class(es)`);
    return true;
  }
  closeShop(a: UiActor): void;
  closeShop(slot: number): void;
  closeShop(value: UiActor | number): void { const a = typeof value === 'number' ? this.actor(value) : value; if (a && this.owns(a)) this.shop?.close(a.slot); }
  private shopSubtitle(slot: number): string {
    const paint = this.shopPaints.get(slot);
    try {
      if(paint)return `${this.shopPaintView(slot,paint).balance} credits`;
      const a = this.actor(slot); if (!a) return '';
      const view = this.core.getUiShop(a);
      return view&&view.stamp&&this.core.matchesUiActor(a,view.stamp)&&this.live&&equal(this.actors.get(slot),a)?`${view.balance} credits`:'';
    } finally { if (paint && this.shopPaints.get(slot) === paint) this.shopPaints.delete(slot); }
  }
  private shopPaintView(slot:number,paint:ShopPaint):UiShopView {
    const a=paint.actor,view=paint.view;
    const local=():boolean=>this.live&&this.shopPaints.get(slot)===paint&&!!a&&equal(this.actors.get(slot),a);
    if(local()&&view&&view.stamp&&this.core.matchesUiActor(a!,view.stamp)&&local())return view;
    // A changed projection does not invalidate the actor's badge, reports, or a nested paint.
    if(this.shopPaints.get(slot)===paint){this.shopPaints.delete(slot);this.shopViews.delete(slot);}
    // hudkit catches collection failures BEFORE any native writes and makes the old action
    // table noninteractive. Returning [] here would let already-copied stale rows submit.
    throw Error('TTT shop projection retired during paint');
  }
  private reportsSubtitle(slot: number): string {
    const a = this.actor(slot); if (!a) return '';
    const view = this.core.getUiReports(a); return view && this.owns(a) ? `${view.rows.length} pending` : '';
  }
  private shopRows(slot: number): Row[] {
    const paint:ShopPaint = {actor:null,view:null};
    this.shopPaints.set(slot,paint);
    try {
      const a = this.actor(slot); if (!a || this.shopPaints.get(slot) !== paint) return [];
      const view = this.core.getUiShop(a);
      paint.actor=a; paint.view=view;
      const current=this.shopPaintView(slot,paint);
      this.shopViews.set(slot,current);
      return current.rows.length ? current.rows.map(item => ({ a: item.name, b: `${item.price}c`, c: item.refusal ?? (item.limit ? `limit ${item.limit}` : ''), disabled: item.refusal !== null })) : [{ a: 'No items available right now', b: '', c: '', disabled: true }];
    } catch (error) { if (this.shopPaints.get(slot) === paint) this.shopPaints.delete(slot); throw error; }
  }
  private shopDetail(slot: number, cursor: number): string[] {
    const paint = this.shopPaints.get(slot);
    try {
      let view:UiShopView|undefined;
      if(paint)view=this.shopPaintView(slot,paint);
      else {
        const a=this.actor(slot);if(!a)return [];
        view=this.shopViews.get(slot);
        if(view&&(!view.stamp||!this.core.matchesUiActor(a,view.stamp)))return [];
      }
      const item = view?.rows[cursor];
      return !item ? [] : [item.name, `${item.price} credits - you have ${view!.balance}`, item.refusal ?? 'Double-click or press Buy to purchase', item.description];
    } catch (error) { if (paint && this.shopPaints.get(slot) === paint) this.shopPaints.delete(slot); throw error; }
  }
  private buySelected(slot: number): void {
    const a = this.actor(slot); if (!a || !this.shop?.isOpen(slot)) return;
    const now = Server.gameTime, last = this.lastBuyAt.get(slot);
    if (last !== undefined && now-last < BUY_DEBOUNCE) return;
    const item = this.shopViews.get(slot)?.rows[this.shop.cursor(slot)]; if (!item) return;
    this.lastBuyAt.set(slot, now);
    const result = this.core.buyUiItem(a, item.itemId);
    if (!this.owns(a)) return;
    this.ui.toast(slot, { title: result.title, message: result.message, variant: result.tone, holdSeconds: 4 });
    // Next frame, not now: the purchase (grant, wallet, chat, purchase event) already loads this
    // frame, so a synchronous full repaint would stack on top of it. A double-click buy is
    // repainted by hudkit's own post-pick paint, which consumes this.
    this.shop.invalidate(slot);
  }
  private isDoubleClick(slot: number, index: number): boolean {
    const now = Server.gameTime, last = this.lastPick.get(slot);
    const itemId = this.shopViews.get(slot)?.rows[index]?.itemId;
    const same = !!last && itemId !== undefined && last.index === index && last.itemId === itemId;
    // A duplicated delivery of the first click keeps the first click's time.
    if (same && now-last!.at < DOUBLE_CLICK_MIN) return false;
    if (same && now-last!.at <= DOUBLE_CLICK_MAX) { this.lastPick.delete(slot); return true; }
    this.lastPick.set(slot, { index, itemId, at: now });
    return false;
  }
  openLogs(a: UiActor, lines: UiLogRow[]): boolean {
    if (!this.capture(a)) return false;
    const page = this.core.getUiLogPage(a, 0);
    if (!page || !this.owns(a)) { if (this.owns(a)) this.closeLogs(a); return false; }
    return this.openPage(a, { rows: lines.slice(), round: page.round, count: page.count });
  }
  private openPage(a: UiActor, page: UiLogPage): boolean {
    if (this.ui.ensure() !== null) return false;
    const modal = this.claimLogs(); if (!modal || !this.owns(a)) return false;
    this.logAt.set(a.slot, 0); this.logPages.set(a.slot, page);
    this.ui.hideAll(a.slot); modal.open(a.slot); modal.select(a.slot, 0); return true;
  }
  isLogsOpen(a: UiActor): boolean { return this.owns(a) && (this.logs?.isOpen(a.slot) ?? false); }
  private logAuthorized(slot: number): boolean {
    const a = this.actor(slot); if (!a) return false;
    const page = this.core.getUiLogPage(a, this.logAt.get(slot) ?? 0);
    if (!this.owns(a)) return false;
    if (!page) { this.logPages.delete(slot); this.closeLogs(a); return false; }
    return true;
  }
  private reportAuthorized(slot: number): boolean {
    const a = this.actor(slot); if (!a) return false;
    const view = this.core.getUiReports(a);
    if (!this.owns(a)) return false;
    if (!view) { this.reportViews.delete(slot); this.closeRdm(a); return false; }
    return true;
  }
  private stepLog(slot: number, delta: number): void {
    const a = this.actor(slot); if (!a || !this.logs?.isOpen(slot)) return;
    const max = Math.max(0, (this.logPages.get(slot)?.count ?? 0)-1);
    const at = Math.max(0, Math.min(max, (this.logAt.get(slot) ?? 0)+delta));
    const page = this.core.getUiLogPage(a, at); if (!page || !this.owns(a)) return;
    this.logAt.set(slot, at); this.logPages.set(slot, page); this.logs.select(slot, 0); this.logs.refresh(slot);
  }
  openLogBrowser(a: UiActor): boolean { if (!this.capture(a)) return false; const page = this.core.getUiLogPage(a, 0); return !!page && this.owns(a) && this.openPage(a, page); }
  closeLogs(a: UiActor): void;
  closeLogs(slot: number): void;
  closeLogs(value: UiActor | number): void { const a = typeof value === 'number' ? this.actor(value) : value; if (a && this.owns(a)) this.logs?.close(a.slot); }
  isRdmOpen(a: UiActor): boolean { return this.owns(a) && (this.rdm?.isOpen(a.slot) ?? false); }
  openRdm(a: UiActor): void {
    if (!this.capture(a)) return;
    const model = this.core.getUiReports(a); if (!model || !this.owns(a)) return;
    this.reportViews.set(a.slot, model);
    const why = this.ui.ensure(); if (why !== null) { this.log(`rdm HUD unavailable: ${why}`); return; }
    const rdm = this.claimRdm(); if (!rdm || !this.owns(a)) return;
    this.ui.hideAll(a.slot); this.slayOverride.delete(a.slot); this.banArmed.delete(a.slot); rdm.open(a.slot);
    const b = this.ui.budget(); this.log(`rdm opened for slot ${a.slot}: ${model.rows.length} pending | interned ${b.panelIds} id(s) / ${b.variables} var(s) / ${b.classNames} class(es)`);
  }
  closeRdm(a: UiActor): void;
  closeRdm(slot: number): void;
  closeRdm(value: UiActor | number): void { const a = typeof value === 'number' ? this.actor(value) : value; if (!a || !this.owns(a)) return; this.slayOverride.delete(a.slot); this.banArmed.delete(a.slot); this.rdm?.close(a.slot); }
  private rdmRows(slot: number): Row[] {
    const a = this.actor(slot); if (!a) return [];
    const view = this.core.getUiReports(a);
    if (!view || !this.owns(a)) { this.reportViews.delete(slot); return []; }
    this.reportViews.set(slot, view);
    return view.rows.map(r => ({ a: `${r.reporterName} vs ${r.accusedName}`, b: `round ${r.round}`, c: ago(r.filed, Date.now()/1000) }));
  }
  private rdmDetail(slot: number, cursor: number): string[] {
    if (!this.reportAuthorized(slot)) return [];
    const sel = this.reportViews.get(slot)?.rows[cursor]; if (!sel) return ['', '', '', 'select a report'];
    const n = this.slaysFor(slot), priors = sel.priorGuilty;
    return [`${sel.reporterName} reported ${sel.accusedName}`, `round ${sel.round} - ${ago(sel.filed, Date.now()/1000)}`, `Convict applies ${n} slay${n===1?'':'s'}`+(priors>0?` - ${priors} prior guilty verdict${priors===1?'':'s'} this map`:''), sel.reason];
  }
  private selected(slot: number): UiReport | undefined { return this.reportAuthorized(slot) && this.rdm?.isOpen(slot) ? this.reportViews.get(slot)?.rows[this.rdm.cursor(slot)] : undefined; }
  private slaysFor(slot: number): number { return this.slayOverride.get(slot) ?? this.selected(slot)?.suggestedSlays ?? this.reportViews.get(slot)?.baseSlays ?? 2; }
  private cycleSlays(slot: number): void { if (!this.actor(slot) || !this.rdm?.isOpen(slot)) return; const v = this.reportViews.get(slot); if (!v) return; const n = this.slaysFor(slot)+v.baseSlays; this.slayOverride.set(slot,n>v.maxQueued?v.baseSlays:n); this.rdm.refresh(slot); }
  private banArmedFor(slot: number): boolean { const armed = this.banArmed.get(slot); return armed !== undefined && armed.id === this.selected(slot)?.id && armed.binding === this.selected(slot)?.binding; }
  private banStep(slot: number): void {
    const a = this.actor(slot), sel = this.selected(slot); if (!a || !sel) return;
    if (!this.core.getUiReports(a) || !this.owns(a)) return;
    if (!this.banArmedFor(slot)) { this.banArmed.set(slot,{id:sel.id,binding:sel.binding}); this.ui.toast(slot,{title:'Confirm ban',message:`Press Ban again to ban ${sel.accusedName}`,variant:'warn',holdSeconds:6}); this.rdm?.refresh(slot); return; }
    this.verdict(slot,'ban');
  }
  private verdict(slot: number, action: UiReportAction): void {
    const a = this.actor(slot), sel = this.selected(slot); if (!a || !sel) return;
    if (!this.core.getUiReports(a) || !this.owns(a)) return;
    // Reserve presentation scratch before the authoritative atomic ruling callback.
    const slays = action === 'ban' ? 0 : this.slaysFor(slot);
    this.slayOverride.delete(slot); this.banArmed.delete(slot);
    const result = this.core.ruleUiReport(a, sel.id, sel.binding, action, slays);
    if (!this.owns(a)) return;
    this.ui.toast(slot,{title:result.title,message:result.message,variant:result.tone,holdSeconds:action==='ban'?5:4});
    this.rdm?.select(slot,0); this.refreshRdm();
  }
  refreshRdm(): void {
    for (const a of [...this.actors.values()]) { if (!this.owns(a) || !this.rdm?.isOpen(a.slot)) continue; if (!this.core.getUiReports(a)) { this.closeRdm(a); continue; } if (this.owns(a)) this.rdm.invalidate(a.slot); }
  }
  notifyAdmins(title: string, message: string): void { if (!this.live) return; for (const a of this.core.getUiAdmins()) { if (!this.core.matchesUiActor(a) || !this.core.getUiReports(a) || !this.core.matchesUiActor(a)) continue; this.ui.toast(a.slot,{title,message,variant:'warn'}); } this.refreshRdm(); }
  openReportPrompt(a: UiActor, accusedName: string): boolean {
    if (!this.capture(a) || typeof accusedName !== 'string') return false;
    return this.openReport(a, { kind: 'prompt', accusedName });
  }
  openReportPicker(a: UiActor): boolean {
    if (!this.capture(a)) return false;
    const targets = this.core.getUiReportTargets(a);
    if (!targets || !this.owns(a)) return false;
    return this.openReport(a, { kind: 'pick', targets: targets.map(t => ({ target: { ...t.target }, name: t.name })) });
  }
  private openReport(a: UiActor, mode: ReportMode): boolean {
    const why = this.ui.ensure(); if (why !== null) { this.log(`report HUD unavailable: ${why}`); return false; }
    const sheet = this.claimReport(); if (!sheet || !this.owns(a)) return false;
    this.ui.hideAll(a.slot); this.dropReasonCallout(a.slot);
    this.reportModes.set(a.slot, mode);
    const opened = sheet.tryOpen(a.slot);
    if (!opened.ok) { this.reportModes.delete(a.slot); return false; }
    sheet.select(a.slot, 0);
    return true;
  }
  /**
   * An outcome from Reports. `awaiting` replaces the sheet with a callout for as long as the chat
   * reason is being captured; `result` clears both and says how it ended.
   */
  reportNotice(a: UiActor, notice: UiReportNotice): boolean {
    if (!this.capture(a) || this.ui.ensure() !== null) return false;
    const slot = a.slot;
    // An outcome closes the yes/no it answers, never a picker the player has since opened.
    if (notice.kind === 'awaiting' || this.reportModes.get(slot)?.kind === 'prompt') this.closeReport(slot);
    this.dropReasonCallout(slot);
    if (notice.kind === 'awaiting') {
      const claim = this.ui.forSlot(slot).tryOwnCallout({ title: notice.title, message: notice.message, variant: notice.tone, holdSeconds: REASON_SECONDS });
      if (!claim.ok || !this.owns(a)) { if (claim.ok) claim.value.dispose(); return false; }
      this.reasonCallouts.set(slot, claim.value);
      return true;
    }
    return this.ui.toast(slot, { title: notice.title, message: notice.message, variant: notice.tone, holdSeconds: 5 }) === null;
  }
  private reportRows(slot: number): Row[] {
    const a = this.actor(slot), mode = this.reportModes.get(slot); if (!a || !mode) return [];
    if (mode.kind === 'prompt') return [{ id: 'accused', a: mode.accusedName, b: 'killed you' }];
    return mode.targets.length ? mode.targets.map(t => ({ id: `${t.target.slot}:${t.target.steamId}:${t.target.generation}`, a: t.name })) : [{ a: 'No one to report right now', disabled: true }];
  }
  private reportDetail(slot: number, cursor: number): string[] {
    const a = this.actor(slot), mode = this.reportModes.get(slot); if (!a || !mode) return [];
    if (mode.kind === 'prompt') return [`${mode.accusedName} killed you`, 'Was this RDM?', 'Report, then type what happened in chat.', ''];
    const t = mode.targets[cursor];
    return t ? [t.name, 'Press Report, then type what happened in chat.', '', ''] : [];
  }
  private reportSelected(slot: number): void {
    const a = this.actor(slot), mode = this.reportModes.get(slot); if (!a || !mode || !this.report?.isOpen(slot)) return;
    const target = mode.kind === 'pick' ? mode.targets[this.report.cursor(slot)] : undefined;
    if (mode.kind === 'pick' && !target) return;
    // On success Reports normally answers through reportNotice('awaiting'), which closes this sheet;
    // if that callout could not be shown the instruction went to chat, and the sheet still closes.
    const ok = mode.kind === 'prompt' ? this.core.answerUiReportPrompt(a, true) : this.core.beginUiReport(a, target!.target);
    if (!this.owns(a) || this.reportModes.get(slot) !== mode) return;
    this.closeReport(slot);
    if (ok) return;
    this.ui.toast(slot, { title: 'Cannot report', message: mode.kind === 'prompt' ? 'That question has expired' : 'That player is no longer available', variant: 'warn', holdSeconds: 4 });
  }
  private dismissReport(slot: number): void {
    const a = this.actor(slot), mode = this.reportModes.get(slot); if (!a || !mode) return;
    this.closeReport(slot);
    // "Not RDM" is an answer Reports must hear; closing the picker is not.
    if (mode.kind === 'prompt') this.core.answerUiReportPrompt(a, false);
  }
  private closeReport(slot: number): void { this.reportModes.delete(slot); this.report?.close(slot); }
  private dropReasonCallout(slot: number): void { const claim = this.reasonCallouts.get(slot); this.reasonCallouts.delete(slot); claim?.dispose(); }
  hideAll(a: UiActor): void { if (this.capture(a)) this.ui.hideAll(a.slot); }
  dispose(): void { this.live = false; this.resetAll(); }
  resetAll(): void { for (const slot of [...this.actors.keys()]) this.forgetLocal(slot); }
  forget(a: UiActor): void { if (equal(this.actors.get(a.slot), a)) this.forgetLocal(a.slot); }
  private forgetLocal(slot: number): void {
    this.actors.delete(slot); this.shopPaints.delete(slot); this.shopViews.delete(slot); this.reportViews.delete(slot); this.logPages.delete(slot); this.logAt.delete(slot); this.lastBuyAt.delete(slot); this.lastPick.delete(slot); this.slayOverride.delete(slot); this.banArmed.delete(slot); this.reportModes.delete(slot);
    this.dropReasonCallout(slot);
    this.badge?.hide(slot); this.ui.hideAll(slot); this.shop?.forget(slot); this.rdm?.forget(slot); this.logs?.forget(slot); this.report?.forget(slot); this.ui.forget(slot);
  }
  private claimShop(): Modal | null { if (!this.shop) { this.shop=this.ui.modal(this.shopSpec); if (!this.shop) this.log('modal pool exhausted — shop falls back to the chat menu'); } return this.shop; }
  private claimLogs(): Modal | null { if (!this.logs) { this.logs=this.ui.modal(this.logsSpec); if (!this.logs) this.log('modal pool exhausted — round log falls back to console'); } return this.logs; }
  private claimReport(): Modal | null { if (!this.report) { this.report=this.ui.modal(this.reportSpec); if (!this.report) this.log('modal pool exhausted — RDM prompts fall back to chat'); } return this.report; }
  private claimRdm(): Modal | null { if (!this.rdm) { this.rdm=this.ui.modal(this.rdmSpec); if (!this.rdm) this.log('modal pool exhausted — RDM manager unavailable'); } return this.rdm; }
}
