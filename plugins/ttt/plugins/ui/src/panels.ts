/**
 * TTT's panels on the GameHud: the shop as a centre sheet of item cards (click a card twice to buy), the report picker on the drawer, the round log and the admin RDM queue on the sheet, the
 * victim's "were you RDM'd?" on the prompt, and notices on toasts.
 *
 * Core supplies copied models and owns every action. A viewer is a captured {@link UiActor}: every
 * read and every click re-checks it with Core, so a recycled slot, a later round or a revoked admin
 * can never act on, or be shown, what an earlier connection opened.
 */
import { GameHud } from '@s2script/cs2';
import type {
  GameHudDrawer, GameHudDrawerRow, GameHudPrompt, GameHudSheet, GameHudSheetEvent, GameHudSheetSection, GameHudTone,
} from '@s2script/cs2';
import { Server } from '@s2script/sdk/server';
import { hudPhraseFor } from '../../../packages/contracts/phrases.ts';
import type {
  UiActor, UiLogPage, UiLogRow, UiModelMethods, UiReport, UiReportAction, UiReportNotice, UiReportTarget, UiReportsView, UiShopGroup, UiShopItem, UiShopView, UiTone,
} from '../api';

/** A second click on the selected card within this window buys it. */
const CONFIRM_SECONDS = 4;
const BUY_DEBOUNCE = 0.3;
/** The shop's side tabs: the viewer's role items first, then what every role can buy. */
const SHOP_GROUPS: readonly UiShopGroup[] = ['traitor', 'detective', 'innocent', 'shared'];
const GROUP_KEYS: Record<UiShopGroup, string> = {
  traitor: 'ttt.role.traitor', detective: 'ttt.role.detective', innocent: 'ttt.role.innocent', shared: 'ttt.panel.shop_shared',
};
/** Matches Reports' CONTEXT_SECONDS: the reason notice never outlives the chat capture. */
const REASON_SECONDS = 120;
/** Rounds of log the sheet shows, newest first. */
const LOG_ROUNDS = 12;
const REPORT_SECTIONS = 12;

const equal = (a: UiActor | undefined, b: UiActor): boolean =>
  !!a && a.slot === b.slot && a.steamId === b.steamId && a.generation === b.generation && a.roundEpoch === b.roundEpoch;
const TONE: Record<UiTone, GameHudTone> = { good: 'green', warn: 'orange', bad: 'red' };
const t = hudPhraseFor;
function ago(slot: number, filed: number, now: number): string {
  const s = Math.max(0, Math.floor(now - filed));
  return s < 10 ? t(slot, 'ttt.panel.just_now') : s < 60 ? t(slot, 'ttt.panel.seconds_ago', s) : t(slot, 'ttt.panel.minutes_ago', Math.floor(s / 60));
}

/** The drawer shows 8 rows a tab and 5 tabs: longer lists become numbered page tabs. */
const PAGE_ROWS = 8, MAX_PAGES = 5;
function paged(slot: number, rows: GameHudDrawerRow[]): { rows?: GameHudDrawerRow[]; tabs?: { id: string; label: string; rows: GameHudDrawerRow[] }[] } {
  if (rows.length <= PAGE_ROWS) return { rows, tabs: [] };
  const tabs: { id: string; label: string; rows: GameHudDrawerRow[] }[] = [];
  for (let i = 0; i < rows.length && tabs.length < MAX_PAGES; i += PAGE_ROWS) {
    tabs.push({ id: `p${tabs.length}`, label: t(slot, 'ttt.panel.page', tabs.length + 1), rows: rows.slice(i, i + PAGE_ROWS) });
  }
  return { tabs };
}

type DrawerMode = { kind: 'pick'; targets: UiReportTarget[] };
type SheetMode =
  | { kind: 'shop'; view: UiShopView; picked: { itemId: string; at: number } | null }
  | { kind: 'logs'; pages: UiLogPage[] }
  | { kind: 'rdm'; view: UiReportsView; slays: Map<number, number>; banArmed: { id: number; binding: number } | null };

export class TttPanels {
  private live = true;
  private readonly actors = new Map<number, UiActor>();
  private readonly drawers = new Map<number, { handle: GameHudDrawer; mode: DrawerMode }>();
  private readonly sheets = new Map<number, { handle: GameHudSheet; mode: SheetMode }>();
  private readonly prompts = new Map<number, GameHudPrompt>();
  private readonly reasonShown = new Set<number>();
  private readonly lastBuyAt = new Map<number, number>();
  private readonly log = (line: string): void => console.log(`[ttt/ui] ${line}`);
  private warned = false;

  constructor(private readonly core: UiModelMethods, private readonly onMates: (slot: number, mates: string[] | null) => void) {}

  // ── identity ─────────────────────────────────────────────────────────────────────────────────

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
  private refused(what: string): void { if (!this.warned) { this.warned = true; this.log(`${what} refused by the HUD (another plugin holds it, or GameHud is unavailable)`); } }

  ensure(): string | null {
    if (!this.live) return 'UI provider ended';
    return typeof GameHud?.drawer === 'function' ? null : 'GameHud unavailable';
  }

  // ── traitor partners ────────────────────────────────────────────────────────────────────────

  showTraitor(a: UiActor, mates: string[]): void { if (this.capture(a)) this.onMates(a.slot, mates.slice()); }
  hideTraitor(a: UiActor): void { if (this.owns(a)) this.onMates(a.slot, null); }

  // ── toasts ──────────────────────────────────────────────────────────────────────────────────

  private toast(slot: number, title: string, sub: string, tone: UiTone, seconds = 4): void {
    GameHud.toast(slot, { title, sub, tone: TONE[tone] ?? 'grey', seconds });
  }

  notifyAdmins(title: string, message: string): void {
    if (!this.live) return;
    for (const a of this.core.getUiAdmins()) {
      if (!this.core.matchesUiActor(a) || !this.core.getUiReports(a) || !this.core.matchesUiActor(a)) continue;
      this.toast(a.slot, title, message, 'warn', 6);
    }
    this.refreshRdm();
  }

  // ── sheet: shop ─────────────────────────────────────────────────────────────────────────────

  isShopOpen(a: UiActor): boolean { return this.owns(a) && this.sheetMode(a.slot)?.kind === 'shop'; }

  openShop(a: UiActor): boolean {
    if (!this.capture(a)) return false;
    const view = this.core.getUiShop(a);
    if (!view || !this.owns(a)) return false;
    const mode: SheetMode = { kind: 'shop', view, picked: null };
    return this.openSheet(a, mode, this.shopSpec(a.slot, mode));
  }

  private shopSpec(slot: number, mode: Extract<SheetMode, { kind: 'shop' }>) {
    const view = mode.view;
    const groupOf = (item: UiShopItem): UiShopGroup => item.group ?? 'shared';
    const section = (id: string, label: string, items: readonly UiShopItem[]): GameHudSheetSection => {
      // What you can buy first, then what you can't.
      const sorted = [...items.filter((i) => i.refusal === null), ...items.filter((i) => i.refusal !== null)];
      return {
        id,
        label,
        meta: sorted.length,
        kicker: t(slot, 'ttt.panel.shop_kicker'),
        body: {
          kind: 'grid',
          items: sorted.map((item) => {
            const picked = mode.picked?.itemId === item.itemId;
            return {
              id: item.itemId,
              title: item.name,
              price: t(slot, 'ttt.panel.price', item.price),
              desc: item.refusal ?? (picked ? t(slot, 'ttt.panel.shop_confirm') : item.description),
              selected: picked,
              disabled: item.refusal !== null,
            };
          }),
        },
      };
    };
    const groups = SHOP_GROUPS
      .map((group) => ({ group, items: view.rows.filter((item) => groupOf(item) === group) }))
      .filter((g) => g.items.length > 0);
    // "All" opens first: every item, in the same group order.
    const sections: GameHudSheetSection[] = groups.length === 0 ? [] : [
      section('shop_all', t(slot, 'ttt.panel.shop_all'), groups.flatMap((g) => g.items)),
      ...groups.map((g) => section(`shop_${g.group}`, t(slot, GROUP_KEYS[g.group]), g.items)),
    ];
    if (sections.length === 0) {
      sections.push({ id: 'shop_empty', label: t(slot, 'ttt.panel.shop_title'), body: { kind: 'text', paragraphs: [t(slot, 'ttt.panel.shop_empty')] } });
    }
    return { title: t(slot, 'ttt.panel.shop_title'), right: t(slot, 'ttt.panel.credits', view.balance), footer: t(slot, 'ttt.panel.shop_footer'), sections };
  }

  /** The first click on a card selects it; a second click on the same card buys. A mis-click never spends. */
  private clickItem(a: UiActor, mode: Extract<SheetMode, { kind: 'shop' }>, itemId: string): void {
    const now = Server.gameTime;
    if (mode.picked?.itemId !== itemId || now - mode.picked.at > CONFIRM_SECONDS) {
      mode.picked = { itemId, at: now };
      this.repaintShop(a);
      return;
    }
    mode.picked = null;
    this.buy(a, itemId);
  }

  private buy(a: UiActor, itemId: string): void {
    const slot = a.slot;
    const now = Server.gameTime;
    const last = this.lastBuyAt.get(slot);
    if (last !== undefined && now - last < BUY_DEBOUNCE) return;
    this.lastBuyAt.set(slot, now);
    const result = this.core.buyUiItem(a, itemId);
    if (!this.owns(a)) return;
    this.toast(slot, result.title, result.message, result.tone);
    this.repaintShop(a);
  }

  private repaintShop(a: UiActor): void {
    const s = this.sheets.get(a.slot);
    if (!s || s.mode.kind !== 'shop' || !s.handle.isOpen()) return;
    const view = this.core.getUiShop(a);
    if (!this.owns(a)) return;
    if (!view) { this.closeSheet(a.slot); return; }
    s.mode.view = view;
    // Leaving the section out keeps the tab and page the player is on.
    s.handle.update(this.shopSpec(a.slot, s.mode));
  }

  closeShop(a: UiActor): void { if (this.owns(a) && this.sheetMode(a.slot)?.kind === 'shop') this.closeSheet(a.slot); }

  // ── drawer: report picker ───────────────────────────────────────────────────────────────────

  private drawerMode(slot: number): DrawerMode | null {
    const d = this.drawers.get(slot);
    if (!d) return null;
    if (!d.handle.isOpen()) { this.drawers.delete(slot); return null; }
    return d.mode;
  }

  openReportPicker(a: UiActor): boolean {
    if (!this.capture(a)) return false;
    const targets = this.core.getUiReportTargets(a);
    if (!targets || !this.owns(a)) return false;
    return this.openDrawer(a, { kind: 'pick', targets: targets.map((x) => ({ target: { ...x.target }, name: x.name })) });
  }

  private openDrawer(a: UiActor, mode: DrawerMode): boolean {
    const slot = a.slot;
    this.closeOthers(slot, 'drawer');
    const spec = this.drawerSpec(slot, mode);
    const existing = this.drawers.get(slot);
    if (existing?.handle.isOpen()) { existing.mode = mode; existing.handle.update(spec); return true; }
    const handle = GameHud.drawer(slot, {
      ...spec,
      onSelect: (row) => this.drawerSelect(slot, row),
      onClose: () => { if (this.drawers.get(slot)?.handle === handle) this.drawers.delete(slot); },
    });
    if (handle === null) { this.refused('drawer'); return false; }
    this.drawers.set(slot, { handle, mode });
    return true;
  }

  private drawerSpec(slot: number, mode: DrawerMode) {
    const rows: GameHudDrawerRow[] = mode.targets.length
      ? mode.targets.map((x, i) => ({ title: x.name, sub: t(slot, 'ttt.panel.report_row'), tone: 'lightred' as const, index: i }))
      : [{ title: t(slot, 'ttt.panel.report_none'), disabled: true }];
    return { title: t(slot, 'ttt.panel.report_title'), right: t(slot, 'ttt.panel.players', mode.targets.length), footer: t(slot, 'ttt.panel.report_footer'), ...paged(slot, rows) };
  }

  private drawerSelect(slot: number, row: GameHudDrawerRow): void {
    const a = this.actor(slot), mode = this.drawerMode(slot);
    if (!a || !mode) return;
    const target = typeof row.index === 'number' ? mode.targets[row.index] : undefined;
    if (!target) return;
    const ok = this.core.beginUiReport(a, target.target);
    if (!this.owns(a)) return;
    // On success Reports answers through reportNotice('awaiting').
    this.closeDrawer(slot);
    if (!ok) this.toast(slot, t(slot, 'ttt.panel.report_refused'), t(slot, 'ttt.panel.report_gone'), 'warn');
  }

  private closeDrawer(slot: number): void { const d = this.drawers.get(slot); this.drawers.delete(slot); if (d?.handle.isOpen()) d.handle.close(); }

  // ── sheet: round log ────────────────────────────────────────────────────────────────────────

  isLogsOpen(a: UiActor): boolean { return this.owns(a) && this.sheetMode(a.slot)?.kind === 'logs'; }
  private sheetMode(slot: number): SheetMode | null {
    const s = this.sheets.get(slot);
    if (!s) return null;
    if (!s.handle.isOpen()) { this.sheets.delete(slot); return null; }
    return s.mode;
  }

  /** The round that just ended, pushed by Core, newest first in the sheet. */
  openLogs(a: UiActor, lines: UiLogRow[]): boolean {
    if (!this.capture(a)) return false;
    const page = this.core.getUiLogPage(a, 0);
    if (!page || !this.owns(a)) { if (this.owns(a)) this.closeLogs(a); return false; }
    return this.openLogPages(a, [{ rows: lines.slice(), round: page.round, count: 1 }]);
  }

  openLogBrowser(a: UiActor): boolean {
    if (!this.capture(a)) return false;
    const first = this.core.getUiLogPage(a, 0);
    if (!first || !this.owns(a)) return false;
    const pages = [first];
    for (let at = 1; at < Math.min(first.count, LOG_ROUNDS); at++) {
      const page = this.core.getUiLogPage(a, at);
      if (!this.owns(a)) return false;
      if (page) pages.push(page);
    }
    return this.openLogPages(a, pages);
  }

  private openLogPages(a: UiActor, pages: UiLogPage[]): boolean {
    const slot = a.slot;
    const sections: GameHudSheetSection[] = pages.map((page, i) => ({
      id: `log${i}`,
      label: t(slot, 'ttt.panel.log_round', page.round),
      meta: page.rows.length,
      group: t(slot, 'ttt.panel.log_group'),
      body: { kind: 'list', items: page.rows.length ? page.rows.map((r) => [r.a, r.b, r.c].filter(Boolean).join('  ')) : [t(slot, 'ttt.panel.log_empty')], perPage: 8 },
    }));
    return this.openSheet(a, { kind: 'logs', pages }, { title: t(slot, 'ttt.panel.log_title'), sections, section: 'log0' });
  }

  closeLogs(a: UiActor): void { if (this.owns(a) && this.sheetMode(a.slot)?.kind === 'logs') this.closeSheet(a.slot); }

  // ── sheet: admin RDM queue ──────────────────────────────────────────────────────────────────

  isRdmOpen(a: UiActor): boolean { return this.owns(a) && this.sheetMode(a.slot)?.kind === 'rdm'; }

  openRdm(a: UiActor): void {
    if (!this.capture(a)) return;
    const view = this.core.getUiReports(a);
    if (!view || !this.owns(a)) return;
    const mode: SheetMode = { kind: 'rdm', view, slays: new Map(), banArmed: null };
    this.openSheet(a, mode, this.rdmSpec(a.slot, mode));
  }

  private rdmSpec(slot: number, mode: Extract<SheetMode, { kind: 'rdm' }>, section?: string) {
    const now = Date.now() / 1000;
    const rows = mode.view.rows.slice(0, REPORT_SECTIONS);
    const sections: GameHudSheetSection[] = rows.length ? rows.map((r) => this.reportSection(slot, mode, r, now)) : [{
      id: 'empty', label: t(slot, 'ttt.panel.rdm_none'), body: { kind: 'text', paragraphs: [t(slot, 'ttt.panel.rdm_none_body')] },
    }];
    return { title: t(slot, 'ttt.panel.rdm_title'), right: t(slot, 'ttt.panel.rdm_pending', mode.view.rows.length), sections, ...(section ? { section } : {}) };
  }

  private reportSection(slot: number, mode: Extract<SheetMode, { kind: 'rdm' }>, r: UiReport, now: number): GameHudSheetSection {
    const slays = mode.slays.get(r.id) ?? r.suggestedSlays ?? mode.view.baseSlays;
    const armed = mode.banArmed?.id === r.id && mode.banArmed.binding === r.binding;
    return {
      id: `r${r.id}`,
      label: r.accusedName,
      meta: ago(slot, r.filed, now),
      group: t(slot, 'ttt.panel.rdm_group'),
      heading: t(slot, 'ttt.panel.rdm_heading', r.reporterName, r.accusedName),
      kicker: t(slot, 'ttt.panel.rdm_kicker', r.round, ago(slot, r.filed, now), r.priorGuilty),
      body: {
        kind: 'table',
        columns: ['', ''],
        rows: [
          { id: 'reason', cells: [t(slot, 'ttt.panel.rdm_reason'), r.reason || '-'] },
          { id: 'slays', cells: [t(slot, 'ttt.panel.rdm_slays'), slays], actions: [{ id: 'fewer', label: '-' }, { id: 'more', label: '+' }] },
          { id: 'verdict', cells: [t(slot, 'ttt.panel.rdm_verdict'), ''], actions: [{ id: 'acquit', label: t(slot, 'ttt.panel.rdm_acquit'), tone: 'green' }, { id: 'convict', label: t(slot, 'ttt.panel.rdm_convict'), tone: 'red' }] },
          { id: 'ban', cells: [armed ? t(slot, 'ttt.panel.rdm_ban_armed', r.accusedName) : t(slot, 'ttt.panel.rdm_ban_line'), ''], actions: [{ id: 'ban', label: armed ? t(slot, 'ttt.panel.rdm_ban_confirm') : t(slot, 'ttt.panel.rdm_ban'), tone: 'darkred' }] },
        ],
      },
    };
  }

  private sheetSelect(slot: number, event: GameHudSheetEvent): void {
    const a = this.actor(slot), mode = this.sheetMode(slot);
    if (!a || !mode) return;
    if (mode.kind === 'shop') {
      if (event.kind === 'item' && typeof event.item.id === 'string') this.clickItem(a, mode, event.item.id);
      return;
    }
    if (mode.kind !== 'rdm' || event.kind !== 'action') return;
    const id = Number(event.section.slice(1));
    // Re-read the queue: the report must still be there, under the same binding, for this admin.
    const view = this.core.getUiReports(a);
    if (!this.owns(a)) return;
    if (!view) { this.closeSheet(slot); return; }
    mode.view = view;
    const report = view.rows.find((r) => r.id === id);
    if (!report) { this.repaintRdm(a); return; }
    const current = mode.slays.get(id) ?? report.suggestedSlays ?? view.baseSlays;
    switch (event.action) {
      case 'fewer': mode.slays.set(id, Math.max(0, current - 1)); mode.banArmed = null; break;
      case 'more': mode.slays.set(id, Math.min(view.maxQueued, current + 1)); mode.banArmed = null; break;
      case 'ban':
        if (mode.banArmed?.id !== id || mode.banArmed.binding !== report.binding) {
          mode.banArmed = { id, binding: report.binding };
          break;
        }
        this.verdict(a, mode, report, 'ban', 0);
        return;
      case 'acquit': this.verdict(a, mode, report, 'acquit', current); return;
      case 'convict': this.verdict(a, mode, report, 'convict', current); return;
      default: return;
    }
    this.repaintRdm(a, event.section);
  }

  private verdict(a: UiActor, mode: Extract<SheetMode, { kind: 'rdm' }>, report: UiReport, action: UiReportAction, slays: number): void {
    mode.banArmed = null;
    mode.slays.delete(report.id);
    const result = this.core.ruleUiReport(a, report.id, report.binding, action, slays);
    if (!this.owns(a)) return;
    this.toast(a.slot, result.title, result.message, result.tone, action === 'ban' ? 5 : 4);
    this.refreshRdm();
  }

  private repaintRdm(a: UiActor, section?: string): void {
    const s = this.sheets.get(a.slot);
    if (!s || s.mode.kind !== 'rdm' || !s.handle.isOpen()) return;
    const view = this.core.getUiReports(a);
    if (!this.owns(a)) return;
    if (!view) { this.closeSheet(a.slot); return; }
    s.mode.view = view;
    const spec = this.rdmSpec(a.slot, s.mode);
    // Stay on the report being worked; a ruled one falls back to the first.
    const stay = section !== undefined && spec.sections.some((x) => x.id === section) ? section : undefined;
    s.handle.update(stay ? { ...spec, section: stay } : spec);
  }

  refreshRdm(): void {
    for (const a of [...this.actors.values()]) {
      if (!this.owns(a) || this.sheetMode(a.slot)?.kind !== 'rdm') continue;
      this.repaintRdm(a);
    }
  }

  closeRdm(a: UiActor): void { if (this.owns(a) && this.sheetMode(a.slot)?.kind === 'rdm') this.closeSheet(a.slot); }

  private openSheet(a: UiActor, mode: SheetMode, spec: { title: string; right?: string; footer?: string; sections: GameHudSheetSection[]; section?: string }): boolean {
    const slot = a.slot;
    this.closeOthers(slot, 'sheet');
    const existing = this.sheets.get(slot);
    if (existing?.handle.isOpen()) { existing.mode = mode; existing.handle.update(spec); return true; }
    const handle = GameHud.sheet(slot, {
      ...spec,
      onSelect: (event) => this.sheetSelect(slot, event),
      onClose: () => { if (this.sheets.get(slot)?.handle === handle) this.sheets.delete(slot); },
    });
    if (handle === null) { this.refused('sheet'); return false; }
    this.sheets.set(slot, { handle, mode });
    return true;
  }
  private closeSheet(slot: number): void { const s = this.sheets.get(slot); this.sheets.delete(slot); if (s?.handle.isOpen()) s.handle.close(); }

  // ── prompt: the victim's yes/no ─────────────────────────────────────────────────────────────

  openReportPrompt(a: UiActor, accusedName: string): boolean {
    if (!this.capture(a) || typeof accusedName !== 'string') return false;
    const slot = a.slot;
    this.closeOthers(slot, 'prompt');
    const prompt = GameHud.prompt(slot, {
      title: t(slot, 'ttt.panel.prompt_title'),
      question: t(slot, 'ttt.panel.prompt_question', accusedName),
      why: t(slot, 'ttt.panel.prompt_why'),
      answers: [
        { id: 'yes', label: t(slot, 'ttt.panel.prompt_yes'), tone: 'red' },
        { id: 'no', label: t(slot, 'ttt.panel.prompt_no'), tone: 'grey' },
      ],
      onAnswer: (result) => {
        if (this.prompts.get(slot) === prompt) this.prompts.delete(slot);
        const owner = this.actor(slot);
        if (!owner || !equal(owner, a)) return;
        // Closing the question is a "no" Reports must hear; a timeout or a replacement is not.
        if (result.reason === 'answer' || result.reason === 'closed') {
          const yes = result.reason === 'answer' && result.id === 'yes';
          const ok = this.core.answerUiReportPrompt(a, yes);
          if (!ok && yes && this.owns(a)) this.toast(slot, t(slot, 'ttt.panel.report_refused'), t(slot, 'ttt.panel.prompt_expired'), 'warn');
        }
      },
    });
    if (prompt === null) { this.refused('prompt'); return false; }
    this.prompts.set(slot, prompt);
    return true;
  }

  /**
   * An outcome from Reports. `awaiting` shows how to type the reason for as long as chat is being
   * captured; `result` replaces it and says how it ended.
   */
  reportNotice(a: UiActor, notice: UiReportNotice): boolean {
    if (!this.capture(a) || this.ensure() !== null) return false;
    const slot = a.slot;
    if (notice.kind === 'awaiting') this.closePrompt(slot);
    if (notice.kind === 'awaiting') this.reasonShown.add(slot); else this.reasonShown.delete(slot);
    this.toast(slot, notice.title, notice.message, notice.tone, notice.kind === 'awaiting' ? REASON_SECONDS : 5);
    return true;
  }

  private closePrompt(slot: number): void { const p = this.prompts.get(slot); this.prompts.delete(slot); if (p?.isOpen()) p.close(); }

  // ── teardown ────────────────────────────────────────────────────────────────────────────────

  /** One panel at a time: opening one closes this plugin's others for that player. */
  private closeOthers(slot: number, keep: 'drawer' | 'sheet' | 'prompt'): void {
    if (keep !== 'drawer') this.closeDrawer(slot);
    if (keep !== 'sheet') this.closeSheet(slot);
    if (keep !== 'prompt') this.closePrompt(slot);
  }

  hideAll(a: UiActor): void { if (this.capture(a)) this.closeAll(a.slot); }
  private closeAll(slot: number): void { this.closeDrawer(slot); this.closeSheet(slot); this.closePrompt(slot); }
  dispose(): void { this.resetAll(); this.live = false; }
  resetAll(): void { for (const slot of [...this.actors.keys()]) this.forgetLocal(slot); }
  forget(a: UiActor): void { if (equal(this.actors.get(a.slot), a)) this.forgetLocal(a.slot); }
  private forgetLocal(slot: number): void {
    this.actors.delete(slot);
    this.lastBuyAt.delete(slot);
    this.reasonShown.delete(slot);
    this.closeAll(slot);
    this.onMates(slot, null);
  }
}
