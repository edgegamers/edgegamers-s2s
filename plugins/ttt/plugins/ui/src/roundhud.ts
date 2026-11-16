/**
 * The in-round TTT HUD on the hudkit GameHud: the top rail (alive, bodies, clock, round line), the
 * status card (role, hint, health and karma) and the role toast.
 *
 * Core decides what each viewer may know and sends it as a finished model; this only formats and
 * paints it, sending each player just what changed. Everything a viewer sees here they could
 * already work out in game: a living player's alive count drops only when a body is identified.
 */
import { GameHud, HideHud } from '@s2script/cs2';
import type { GameHudBar, GameHudRail, GameHudRailSpec, GameHudStatus, GameHudStatusSpec } from '@s2script/cs2';
import { Hud } from '@s2script/sdk/hud';
import { RegionPainter, clock, leadingTone, percent, pips } from '@edgegamers/gamehud';
import { hudPhraseFor, loadPhrases } from '../../../packages/contracts/phrases.ts';
import type { UiActor, UiRoundHud, UiRoundHudRow, UiRoundRole } from '../api';

const THEME = 'red' as const;
const ROLE_KEYS: Record<UiRoundRole, string> = {
  none: 'ttt.hud.role_waiting', innocent: 'ttt.role.innocent', traitor: 'ttt.role.traitor',
  detective: 'ttt.role.detective', spectator: 'ttt.role.spectator',
};
const HINT_KEYS: Record<UiRoundRole, string> = {
  none: 'ttt.hud.hint_waiting', innocent: 'ttt.hud.hint_innocent', traitor: 'ttt.hud.hint_traitor',
  detective: 'ttt.hud.hint_detective', spectator: 'ttt.hud.hint_spectator',
};

export class RoundHud {
  private rail: GameHudRail | null = null;
  private status: GameHudStatus | null = null;
  private railPaint: RegionPainter<GameHudRailSpec> | null = null;
  private statusPaint: RegionPainter<GameHudStatusSpec> | null = null;
  private claimed = false;
  private readonly themed = new Set<number>();
  private readonly timerHidden = new Set<number>();
  private readonly log = (line: string): void => console.log(`[ttt/ui] ${line}`);

  constructor() { loadPhrases(); }

  /** Claim the rail and status card once. A region another plugin holds stays theirs. */
  private claim(): void {
    if (this.claimed) return;
    this.claimed = true;
    try {
      this.rail = GameHud.rail();
      this.status = GameHud.status();
    } catch (error) {
      this.log(`GameHud unavailable (does the s2script runtime ship it?): ${String(error)}`);
      this.rail = this.status = null;
      return;
    }
    if (this.rail === null) this.log('GameHud rail is held by another plugin; the round rail is off');
    if (this.status === null) this.log('GameHud status card is held by another plugin; the status card is off');
    this.railPaint = this.rail ? new RegionPainter(this.rail) : null;
    this.statusPaint = this.status ? new RegionPainter(this.status) : null;
  }

  paint(rows: readonly UiRoundHudRow[]): void {
    this.claim();
    // Nothing claimed (a host without GameHud, or both regions held elsewhere): already logged once.
    if (this.railPaint === null && this.statusPaint === null) return;
    const seen = new Set<number>();
    for (const row of rows) {
      const slot = row.actor.slot;
      seen.add(slot);
      if (!this.themed.has(slot)) { GameHud.theme(slot, THEME); this.themed.add(slot); }
      this.paintRail(slot, row.hud);
      this.paintStatus(slot, row.hud);
    }
    for (const painter of [this.railPaint, this.statusPaint]) {
      for (const slot of painter?.shownSlots() ?? []) if (!seen.has(slot)) this.hideSlot(slot);
    }
  }

  private paintRail(slot: number, hud: UiRoundHud): void {
    const painter = this.railPaint;
    if (painter === null) return;
    if (hud.phase === 'waiting') { painter.hide(slot); this.showTimer(slot); return; }
    const sub = hud.phase === 'countdown' ? hudPhraseFor(slot, 'ttt.hud.sub_countdown', hud.round)
      : hud.phase === 'live' ? hudPhraseFor(slot, 'ttt.hud.sub_live', hud.round)
      : hudPhraseFor(slot, 'ttt.hud.sub_finished');
    painter.paint(slot, {
      left: { score: hud.alive, label: hudPhraseFor(slot, 'ttt.hud.rail_alive'), tone: 'green', ...pips(hud.alive, hud.participants) },
      right: { score: hud.bodies, label: hudPhraseFor(slot, 'ttt.hud.rail_bodies'), tone: 'red' },
      clock: clock(hud.clock),
      sub,
    });
    this.hideTimer(slot);
  }

  private paintStatus(slot: number, hud: UiRoundHud): void {
    const painter = this.statusPaint;
    if (painter === null) return;
    const dead = hud.phase === 'live' && !hud.living && (hud.role === 'innocent' || hud.role === 'traitor' || hud.role === 'detective');
    const role = dead ? hudPhraseFor(slot, 'ttt.hud.role_dead') : hudPhraseFor(slot, ROLE_KEYS[hud.role]);
    const hint = dead ? hudPhraseFor(slot, 'ttt.hud.hint_dead')
      : hud.phase === 'countdown' && hud.role === 'none' ? hudPhraseFor(slot, 'ttt.hud.hint_countdown')
      : hudPhraseFor(slot, HINT_KEYS[hud.role]);
    const bars: GameHudBar[] = [];
    if (hud.living) {
      bars.push({ label: hudPhraseFor(slot, 'ttt.hud.bar_health'), value: percent(hud.health, hud.maxHealth), text: Math.max(0, Math.round(hud.health)), tone: 'green' });
    }
    bars.push({ label: hudPhraseFor(slot, 'ttt.hud.bar_karma'), value: percent(hud.karma, hud.maxKarma), text: Math.round(hud.karma), tone: 'yellow' });
    painter.paint(slot, { role, tone: leadingTone(role) ?? 'grey', hint, bars });
  }

  /** "You are a Traitor" as the round goes live. */
  roleToast(actor: UiActor, role: UiRoundRole): void {
    if (role === 'none' || role === 'spectator') return;
    this.claim();
    if (this.railPaint === null && this.statusPaint === null) return;
    const slot = actor.slot;
    const title = hudPhraseFor(slot, ROLE_KEYS[role]);
    GameHud.toast(slot, { title, sub: hudPhraseFor(slot, HINT_KEYS[role]), tone: leadingTone(title) ?? 'accent', seconds: 4 });
  }

  /** The stock round timer duplicates the rail clock while the rail is up. */
  private hideTimer(slot: number): void {
    if (this.timerHidden.has(slot)) return;
    Hud.hide(slot, HideHud.RoundTimer);
    this.timerHidden.add(slot);
  }

  private showTimer(slot: number): void {
    if (!this.timerHidden.delete(slot)) return;
    Hud.show(slot, HideHud.RoundTimer);
  }

  private hideSlot(slot: number): void {
    this.railPaint?.hide(slot);
    this.statusPaint?.hide(slot);
    this.showTimer(slot);
  }

  hide(actor: UiActor): void { this.hideSlot(actor.slot); }

  forget(actor: UiActor): void {
    const slot = actor.slot;
    this.railPaint?.forget(slot);
    this.statusPaint?.forget(slot);
    this.themed.delete(slot);
    this.timerHidden.delete(slot);
  }

  hideAll(): void {
    this.railPaint?.reset();
    this.statusPaint?.reset();
    for (const slot of this.timerHidden) Hud.show(slot, HideHud.RoundTimer);
    this.timerHidden.clear();
  }

  dispose(): void {
    this.hideAll();
    this.rail?.release();
    this.status?.release();
    this.rail = this.status = null;
    this.railPaint = this.statusPaint = null;
    this.claimed = false;
    this.themed.clear();
  }
}
