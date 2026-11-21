/**
 * TTT's kill feed on the GameHud feed (top right).
 *
 * Core decides who sees each death (the killer, and the other Traitors when a Traitor kills) and
 * withholds the stock entry once this has shown it. If the feed cannot be claimed, `push` says so and
 * Core keeps the stock feed for that death.
 */
import { GameHud } from '@s2script/cs2';
import type { GameHudFeed, GameHudTone } from '@s2script/cs2';
import type { UiActor, UiKillEntry, UiRoundRole } from '../api';

const ROLE_TONE: Partial<Record<UiRoundRole, GameHudTone>> = { traitor: 'red', detective: 'darkblue', innocent: 'green' };

export class KillFeed {
  private feed: GameHudFeed | null = null;
  private state: 'unclaimed' | 'held' | 'off' = 'unclaimed';
  private readonly log = (line: string): void => console.log(`[ttt/ui] ${line}`);

  private claim(): GameHudFeed | null {
    if (this.state === 'off') return null;
    // A claim goes stale when the host rebuilds its HUD entity (a map change): claim again.
    if (this.feed !== null && this.feed.isValid()) return this.feed;
    try {
      this.feed = GameHud.feed();
    } catch (error) {
      this.feed = null;
      this.state = 'off';
      this.log(`GameHud feed unavailable; keeping the stock kill feed: ${String(error)}`);
      return null;
    }
    if (this.feed === null) {
      this.state = 'off';
      this.log('GameHud feed is held by another plugin; keeping the stock kill feed');
      return null;
    }
    if (this.state === 'unclaimed') this.log('kill feed claimed');
    this.state = 'held';
    return this.feed;
  }

  push(viewers: readonly UiActor[], entry: UiKillEntry): boolean {
    const feed = this.claim();
    if (feed === null) return false;
    const slots = viewers.map((a) => a.slot);
    if (slots.length === 0) return true;
    const weapon = entry.weapon ?? undefined;
    feed.push({
      attacker: entry.attacker ?? undefined,
      victim: entry.victim,
      weapon,
      icon: weapon !== undefined ? `file://{images}/icons/equipment/${weapon}.svg` : undefined,
      headshot: entry.headshot,
      attackerTone: entry.attackerRole ? ROLE_TONE[entry.attackerRole] : undefined,
      victimTone: entry.victimRole ? ROLE_TONE[entry.victimRole] : undefined,
      tone: entry.attackerRole ? ROLE_TONE[entry.attackerRole] : undefined,
      attackerSlot: entry.attackerSlot >= 0 ? entry.attackerSlot : undefined,
      victimSlot: entry.victimSlot,
    }, slots);
    return true;
  }

  clear(): void { try { if (this.feed?.isValid()) this.feed.clear(); } catch { /* a stale claim */ } }

  dispose(): void {
    try { if (this.feed?.isValid()) this.feed.release(); } catch { /* unloading */ }
    this.feed = null;
    this.state = 'unclaimed';
  }
}
