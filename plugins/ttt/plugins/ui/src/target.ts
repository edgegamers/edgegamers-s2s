/**
 * The crosshair name: who each living player is aiming at, on the GameHud target label just under
 * the crosshair. Core finds the target (line of sight, camouflage) and sends a row per viewer; this
 * paints it. The label only sends changes, so a name that stays put costs nothing per pass.
 *
 * If the label is unavailable (an older runtime, or another plugin holds it), `paint` says so and
 * Core keeps its centre-screen text.
 */
import { GameHud } from '@s2script/cs2';
import type { GameHudTarget } from '@s2script/cs2';
import type { UiTargetRow } from '../api';
import { hudPhraseFor } from '../../../packages/contracts/phrases.ts';

export class TargetLabel {
  private label: GameHudTarget | null = null;
  private state: 'unclaimed' | 'held' | 'off' = 'unclaimed';
  /** Who each viewer was last shown (`""` = hidden). */
  private readonly shown = new Map<number, string>();
  private readonly log = (line: string): void => console.log(`[ttt/ui] ${line}`);

  private claim(): GameHudTarget | null {
    if (this.state === 'off') return null;
    // A claim goes stale when the host rebuilds its HUD entity (a map change): claim again.
    if (this.label !== null && this.label.isValid()) return this.label;
    try {
      this.label = typeof GameHud.target === 'function' ? GameHud.target() : null;
    } catch (error) {
      this.label = null;
      this.log(`GameHud target label unavailable; keeping the centre text: ${String(error)}`);
      return null;
    }
    if (this.label === null) {
      this.state = 'off';
      this.log('GameHud target label is unavailable or held by another plugin; keeping the centre text');
      return null;
    }
    this.shown.clear();
    if (this.state === 'unclaimed') this.log('target label claimed');
    this.state = 'held';
    return this.label;
  }

  paint(rows: readonly UiTargetRow[]): boolean {
    const label = this.claim();
    if (label === null) return false;
    const seen = new Set<number>();
    for (const row of rows) {
      const slot = row.actor.slot;
      seen.add(slot);
      const key = row.name === null ? '' : `${row.detective ? 'd' : ''}:${row.name}`;
      if (this.shown.get(slot) === key) continue;
      this.shown.set(slot, key);
      if (row.name === null) { label.hide(slot); continue; }
      label.set(slot, row.detective
        ? { name: row.name, tone: 'darkblue', sub: hudPhraseFor(slot, 'ttt.role.detective') }
        : { name: row.name, sub: '' });
    }
    for (const [slot, key] of this.shown) {
      if (seen.has(slot)) continue;
      this.shown.delete(slot);
      if (key !== '') label.hide(slot);
    }
    return true;
  }

  forget(slot: number): void { this.shown.delete(slot); }

  dispose(): void {
    try { if (this.label?.isValid()) this.label.release(); } catch { /* unloading */ }
    this.label = null;
    this.shown.clear();
    this.state = 'unclaimed';
  }
}
