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
import type { UiActor, UiRoundHud, UiRoundHudRow, UiRoundRole, UiRoundSummary } from '../api';

const THEME = 'red' as const;
/** Paints between claim attempts (paints come about every 0.25 s, so about 5 s). */
const CLAIM_RETRY = 20;
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
  /** Paints to skip before claiming again after a failed claim. */
  private retryIn = 0;
  private claimState = '';
  private paints = 0;
  private readonly lastStatus = new Map<number, GameHudStatusSpec>();
  private readonly themed = new Set<number>();
  /** Which connection each slot's painted state belongs to (`steamId:generation`). */
  private readonly connection = new Map<number, string>();
  private readonly timerHidden = new Set<number>();
  /** A Traitor's partners, shown on their status card. */
  private readonly mates = new Map<number, string[]>();
  private readonly log = (line: string): void => console.log(`[ttt/ui] ${line}`);
  private warned = false;
  private announced = false;
  private warnOnce(line: string): void { if (!this.warned) { this.warned = true; this.log(line); } }

  constructor() { loadPhrases(); }

  /**
   * Claim the rail and status card. A region another plugin holds stays theirs. A claim that failed
   * (the host had no HUD entity yet, as at plugin load or mid map change) is tried again a few
   * seconds later instead of leaving the round HUD off for the rest of the session.
   */
  private claim(): void {
    // A claim goes stale when the host rebuilds its HUD entity (a map change or restart). Painting a
    // stale claim draws nothing, so drop it and claim again.
    if ((this.rail !== null && !this.rail.isValid()) || (this.status !== null && !this.status.isValid())) {
      this.log('GameHud claim went stale; claiming again');
      this.railPaint = this.statusPaint = null;
      this.rail = this.status = null;
      this.themed.clear();
      this.retryIn = 0;
    }
    if (this.rail !== null && this.status !== null) return;
    if (this.retryIn > 0) { this.retryIn--; return; }
    this.retryIn = CLAIM_RETRY;
    try {
      this.rail ??= GameHud.rail();
      this.status ??= GameHud.status();
    } catch (error) {
      this.logChange('error', `GameHud unavailable; trying again shortly: ${String(error)}`);
      return;
    }
    if (this.rail === null) this.logChange('rail', 'GameHud rail is held by another plugin; trying again shortly');
    if (this.status === null) this.logChange('status', 'GameHud status card is held by another plugin; trying again shortly');
    if (this.rail !== null && this.railPaint === null) this.railPaint = new RegionPainter(this.rail);
    if (this.status !== null && this.statusPaint === null) this.statusPaint = new RegionPainter(this.status);
    if (this.rail !== null && this.status !== null) this.logChange('ok', 'round HUD claimed (rail and status card)');
  }

  /** Log a claim outcome once, and again only when it changes. */
  private logChange(state: string, line: string): void {
    if (this.claimState === state) return;
    this.claimState = state;
    this.log(line);
  }

  paint(rows: readonly UiRoundHudRow[]): void {
    this.paints++;
    this.claim();
    // Nothing claimed (a host without GameHud, or both regions held elsewhere): already logged once.
    if (this.railPaint === null && this.statusPaint === null) return;
    if (!this.announced && rows.length > 0) {
      this.announced = true;
      this.log(`round HUD painting ${rows.length} viewer(s); rail ${this.railPaint ? "claimed" : "unavailable"}, status card ${this.statusPaint ? "claimed" : "unavailable"}`);
    }
    const seen = new Set<number>();
    for (const row of rows) {
      const slot = row.actor.slot;
      seen.add(slot);
      // A new connection in this slot starts with an empty HUD: drop what we think it shows, or the
      // painter would skip sending anything that has not changed since the last connection.
      const who = `${row.actor.steamId}:${row.actor.generation}`;
      if (this.connection.get(slot) !== who) { this.freshSlot(slot); this.connection.set(slot, who); }
      if (!this.themed.has(slot)) { GameHud.theme(slot, THEME); this.themed.add(slot); }
      try {
        this.paintRail(slot, row.hud);
        this.paintStatus(slot, row.hud);
      } catch (error) {
        this.warnOnce(`paint failed: ${String(error)}`);
      }
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
    // Before the paint, so a failed paint still never leaves two clocks on screen.
    this.hideTimer(slot);
    painter.paint(slot, {
      left: { score: hud.alive, label: hudPhraseFor(slot, 'ttt.hud.rail_alive'), tone: 'green', ...pips(hud.alive, hud.participants) },
      right: { score: hud.bodies, label: hudPhraseFor(slot, 'ttt.hud.rail_bodies'), tone: 'red' },
      clock: clock(hud.clock),
      sub,
    });
  }

  private paintStatus(slot: number, hud: UiRoundHud): void {
    const painter = this.statusPaint;
    if (painter === null) return;
    const dead = hud.phase === 'live' && !hud.living && (hud.role === 'innocent' || hud.role === 'traitor' || hud.role === 'detective');
    const role = dead ? hudPhraseFor(slot, 'ttt.hud.role_dead') : hudPhraseFor(slot, ROLE_KEYS[hud.role]);
    const mates = hud.role === 'traitor' && hud.living ? this.mates.get(slot) : undefined;
    const hint = dead ? hudPhraseFor(slot, 'ttt.hud.hint_dead')
      : hud.phase === 'countdown' && hud.role === 'none' ? hudPhraseFor(slot, 'ttt.hud.hint_countdown')
      : mates !== undefined ? (mates.length ? hudPhraseFor(slot, 'ttt.hud.hint_mates', mates.join(', ')) : hudPhraseFor(slot, 'ttt.hud.hint_alone'))
      : hudPhraseFor(slot, HINT_KEYS[hud.role]);
    // One bar keeps the card short enough to stay clear of chat: health while alive, karma after.
    const bars: GameHudBar[] = hud.living
      ? [{ label: hudPhraseFor(slot, 'ttt.hud.bar_health'), value: percent(hud.health, hud.maxHealth), text: Math.max(0, Math.round(hud.health)), tone: 'green' }]
      : [{ label: hudPhraseFor(slot, 'ttt.hud.bar_karma'), value: percent(hud.karma, hud.maxKarma), text: Math.round(hud.karma), tone: 'yellow' }];
    const spec: GameHudStatusSpec = { role, tone: leadingTone(role) ?? 'grey', hint, bars };
    this.lastStatus.set(slot, spec);
    painter.paint(slot, spec);
  }

  /** A readout for `sm_ttt_hudstate`: what is claimed and what this slot was last sent. */
  describe(slot: number): string[] {
    const region = (r: GameHudRail | GameHudStatus | null): string => r === null ? 'not claimed' : r.isValid() ? 'claimed' : 'claimed but stale';
    const lines = [
      `rail ${region(this.rail)}, role card ${region(this.status)}; claim state "${this.claimState || 'none yet'}"; ${this.paints} round HUD paints so far`,
    ];
    if (slot < 0) return lines;
    lines.push(`you: rail ${this.railPaint?.isShown(slot) ? 'shown' : 'not shown'}, role card ${this.statusPaint?.isShown(slot) ? 'shown' : 'not shown'}`);
    const last = this.lastStatus.get(slot);
    lines.push(last === undefined ? 'role card: nothing sent to you yet' : `role card last sent: ${JSON.stringify(last)}`);
    return lines;
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

  /** A Traitor's partners for their status card, or null to clear. Painted on the next model. */
  setMates(slot: number, mates: string[] | null): void {
    if (mates === null) this.mates.delete(slot); else this.mates.set(slot, mates);
  }

  /** The round-end sheet. It never takes the cursor. */
  summary(actors: readonly UiActor[], s: UiRoundSummary): void {
    for (const actor of actors) {
      const slot = actor.slot;
      const title = s.winner === 'traitor' ? hudPhraseFor(slot, 'ttt.hud.end_traitors')
        : s.winner === 'innocent' ? hudPhraseFor(slot, 'ttt.hud.end_innocents')
        : hudPhraseFor(slot, 'ttt.hud.end_none');
      const count = (role: UiRoundRole): number => s.players.filter((p) => p.role === role).length;
      // Traitors first: who they were is what everyone wants to know.
      const order: UiRoundRole[] = ['traitor', 'detective', 'innocent'];
      const rows = s.players
        .filter((p) => order.includes(p.role))
        .sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role))
        .slice(0, 5)
        .map((p) => [p.name, hudPhraseFor(slot, ROLE_KEYS[p.role]), p.alive ? hudPhraseFor(slot, 'ttt.hud.end_alive') : hudPhraseFor(slot, 'ttt.hud.role_dead')]);
      try {
        GameHud.summary(slot, {
          eyebrow: hudPhraseFor(slot, 'ttt.hud.end_round', s.round),
          title,
          tone: leadingTone(title) ?? 'accent',
          sub: s.reason ?? undefined,
          stats: [
            { key: hudPhraseFor(slot, 'ttt.role.traitor'), value: count('traitor') },
            { key: hudPhraseFor(slot, 'ttt.role.detective'), value: count('detective') },
            { key: hudPhraseFor(slot, 'ttt.role.innocent'), value: count('innocent') },
            { key: hudPhraseFor(slot, 'ttt.hud.end_survivors'), value: s.players.filter((p) => p.alive && order.includes(p.role)).length },
          ],
          table: { columns: [hudPhraseFor(slot, 'ttt.hud.end_player'), hudPhraseFor(slot, 'ttt.hud.end_role'), ''], rows },
          seconds: 8,
        });
      } catch (error) {
        this.warnOnce(`summary failed: ${String(error)}`);
      }
    }
  }

  /** The stock round timer duplicates the rail clock while the rail is up. */
  private hideTimer(slot: number): void {
    // Ask the host every paint instead of trusting a cache: it drops a slot's bits on disconnect
    // and a map change, and a stale cache left the stock timer up for the rest of the session.
    if ((Hud.hidden(slot) & HideHud.RoundTimer) === 0) Hud.hide(slot, HideHud.RoundTimer);
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

  /** Forget what a slot shows (keeping its Traitor partners, which Core sends separately). */
  private freshSlot(slot: number): void {
    this.railPaint?.forget(slot);
    this.statusPaint?.forget(slot);
    this.themed.delete(slot);
    this.timerHidden.delete(slot);
  }

  forget(actor: UiActor): void {
    const slot = actor.slot;
    this.connection.delete(slot);
    this.railPaint?.forget(slot);
    this.statusPaint?.forget(slot);
    this.themed.delete(slot);
    this.timerHidden.delete(slot);
    this.mates.delete(slot);
  }

  hideAll(): void {
    this.railPaint?.reset();
    this.statusPaint?.reset();
    for (const slot of this.timerHidden) Hud.show(slot, HideHud.RoundTimer);
    this.timerHidden.clear();
  }

  dispose(): void {
    this.hideAll();
    if (this.rail?.isValid()) this.rail.release();
    if (this.status?.isValid()) this.status.release();
    this.rail = this.status = null;
    this.railPaint = this.statusPaint = null;
    this.retryIn = 0;
    this.claimState = '';
    this.announced = false;
    this.themed.clear();
    this.connection.clear();
  }
}
