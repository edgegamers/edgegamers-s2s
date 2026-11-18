/**
 * The in-round TTT HUD on the GameHud: the status card (role, the round line with the alive and
 * body counts, health and karma) and the role toast.
 *
 * The stock top bar stays: no HUD flag hides it, and TTT already drives its clock through the
 * game rules, so the round clock lives there and nothing is drawn over it.
 *
 * Core decides what each viewer may know and sends it as a finished model; this only formats and
 * paints it, sending each player just what changed. Everything a viewer sees here they could
 * already work out in game: a living player's alive count drops only when a body is identified.
 */
import { GameHud } from '@s2script/cs2';
import type { GameHudBar, GameHudStatus, GameHudStatusSpec } from '@s2script/cs2';
import { RegionPainter, leadingTone, percent } from '@edgegamers/gamehud';
import { hudPhraseFor, loadPhrases } from '../../../packages/contracts/phrases.ts';
import type { UiActor, UiRoundHud, UiRoundHudRow, UiRoundRole, UiRoundSummary } from '../api';

const THEME = 'red' as const;
const ROLE_KEYS: Record<UiRoundRole, string> = {
  none: 'ttt.hud.role_waiting', innocent: 'ttt.role.innocent', traitor: 'ttt.role.traitor',
  detective: 'ttt.role.detective', spectator: 'ttt.role.spectator',
};

export class RoundHud {
  private status: GameHudStatus | null = null;
  private statusPaint: RegionPainter<GameHudStatusSpec> | null = null;
  private claimed = false;
  private readonly themed = new Set<number>();
  /** A Traitor's partners, shown on their status card. */
  private readonly mates = new Map<number, string[]>();
  private readonly log = (line: string): void => console.log(`[ttt/ui] ${line}`);
  private warned = false;
  private announced = false;
  private warnOnce(line: string): void { if (!this.warned) { this.warned = true; this.log(line); } }

  constructor() { loadPhrases(); }

  /** Claim the status card once. A card another plugin holds stays theirs. */
  private claim(): void {
    // A claim goes stale when the host rebuilds its HUD entity (a map change or restart). Painting a
    // stale claim draws nothing, so drop it and claim again.
    if (this.claimed && this.status !== null && !this.status.isValid()) {
      this.log('GameHud claim went stale; claiming again');
      this.statusPaint = null;
      this.status = null;
      this.themed.clear();
      this.claimed = false;
    }
    if (this.claimed) return;
    this.claimed = true;
    try {
      this.status = GameHud.status();
    } catch (error) {
      this.log(`GameHud unavailable (does the s2script runtime ship it?): ${String(error)}`);
      this.status = null;
      return;
    }
    if (this.status === null) this.log('GameHud status card is held by another plugin; the status card is off');
    this.statusPaint = this.status ? new RegionPainter(this.status) : null;
  }

  paint(rows: readonly UiRoundHudRow[]): void {
    this.claim();
    if (this.statusPaint === null) return;
    if (!this.announced && rows.length > 0) {
      this.announced = true;
      this.log(`round HUD painting ${rows.length} viewer(s); status card claimed`);
    }
    const seen = new Set<number>();
    for (const row of rows) {
      const slot = row.actor.slot;
      seen.add(slot);
      if (!this.themed.has(slot)) { GameHud.theme(slot, THEME); this.themed.add(slot); }
      try {
        this.paintStatus(slot, row.hud);
      } catch (error) {
        this.warnOnce(`paint failed: ${String(error)}`);
      }
    }
    for (const slot of this.statusPaint.shownSlots()) if (!seen.has(slot)) this.statusPaint.hide(slot);
  }

  /** The line under the role: the round, then the counts once there is a round to count. */
  private roundLine(slot: number, hud: UiRoundHud): string {
    if (hud.phase === 'waiting') return hudPhraseFor(slot, 'ttt.hud.hint_waiting');
    const round = hud.phase === 'countdown' ? hudPhraseFor(slot, 'ttt.hud.sub_countdown', hud.round)
      : hud.phase === 'live' ? hudPhraseFor(slot, 'ttt.hud.sub_live', hud.round)
      : hudPhraseFor(slot, 'ttt.hud.sub_finished');
    if (hud.phase === 'countdown') return round;
    // Concatenated: a coloured phrase passed as an argument loses its colours.
    return round + hudPhraseFor(slot, 'ttt.hud.line_counts', hud.alive, hud.bodies);
  }

  private paintStatus(slot: number, hud: UiRoundHud): void {
    const painter = this.statusPaint;
    if (painter === null) return;
    const dead = hud.phase === 'live' && !hud.living && (hud.role === 'innocent' || hud.role === 'traitor' || hud.role === 'detective');
    const role = dead ? hudPhraseFor(slot, 'ttt.hud.role_dead') : hudPhraseFor(slot, ROLE_KEYS[hud.role]);
    const mates = hud.role === 'traitor' && hud.living ? this.mates.get(slot) : undefined;
    const line = this.roundLine(slot, hud);
    const hint = mates === undefined ? line
      : line + hudPhraseFor(slot, 'ttt.hud.line_mates', mates.length ? mates.join(', ') : hudPhraseFor(slot, 'ttt.hud.mates_none'));
    // One bar keeps the card short enough to clear chat: health while alive, karma otherwise.
    const bars: GameHudBar[] = hud.living
      ? [{ label: hudPhraseFor(slot, 'ttt.hud.bar_health'), value: percent(hud.health, hud.maxHealth), text: Math.max(0, Math.round(hud.health)), tone: 'green' }]
      : [{ label: hudPhraseFor(slot, 'ttt.hud.bar_karma'), value: percent(hud.karma, hud.maxKarma), text: Math.round(hud.karma), tone: 'yellow' }];
    painter.paint(slot, { role, tone: leadingTone(role) ?? 'grey', hint, bars });
  }

  /** "You are a Traitor" as the round goes live. */
  roleToast(actor: UiActor, role: UiRoundRole): void {
    if (role === 'none' || role === 'spectator') return;
    this.claim();
    if (this.statusPaint === null) return;
    const slot = actor.slot;
    const title = hudPhraseFor(slot, ROLE_KEYS[role]);
    GameHud.toast(slot, { title, sub: hudPhraseFor(slot, `ttt.hud.hint_${role}`), tone: leadingTone(title) ?? 'accent', seconds: 4 });
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

  hide(actor: UiActor): void { this.statusPaint?.hide(actor.slot); }

  forget(actor: UiActor): void {
    const slot = actor.slot;
    this.statusPaint?.forget(slot);
    this.themed.delete(slot);
    this.mates.delete(slot);
  }

  hideAll(): void {
    this.statusPaint?.reset();
  }

  dispose(): void {
    this.hideAll();
    if (this.status?.isValid()) this.status.release();
    this.status = null;
    this.statusPaint = null;
    this.claimed = false;
    this.announced = false;
    this.themed.clear();
  }
}
