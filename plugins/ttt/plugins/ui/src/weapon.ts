/**
 * The GameHud weapon card in place of the stock weapons HUD.
 *
 * The card sits bottom right and s2script fills it from each pawn (name, clip / reserve, grenade
 * count, slot list), so this only claims it, starts `auto`, and hides the stock weapons HUD for the
 * players the round HUD paints. If another plugin holds the card, or the runtime has no card, the
 * stock weapons HUD stays, so nobody loses their ammo count.
 */
import { GameHud, HideHud } from '@s2script/cs2';
import { Hud } from '@s2script/sdk/hud';
import type { UiActor } from '../api';

/** m_iHideHUD bit 6. Older SDKs only name it `Chat`. */
const WEAPONS_BIT = HideHud.Weapons ?? 1 << 6;

export class WeaponCard {
  private state: 'unclaimed' | 'held' | 'off' = 'unclaimed';
  private readonly hidden = new Set<number>();
  /** Paints to skip before trying again after the host had no card (plugin load, map change). */
  private retryIn = 0;
  private warned = false;
  private readonly log = (line: string): void => console.log(`[ttt/ui] ${line}`);

  private claim(): boolean {
    if (this.state === 'off') return false;
    if (this.retryIn > 0) { this.retryIn--; return false; }
    // A held card can be lost to a host rebuild; claiming again is safe and cheap.
    if (this.state === 'held' && GameHud.weapon.isClaimed()) return true;
    try {
      if (!GameHud.weapon.claim()) {
        this.state = 'off';
        this.log('GameHud weapon card is held by another plugin; keeping the stock weapons HUD');
        return false;
      }
      GameHud.weapon.auto('all');
      if (this.state === 'unclaimed') this.log('weapon card claimed');
      this.state = 'held';
      return true;
    } catch (error) {
      // Often the host has no HUD entity yet: keep the stock HUD and try again in a few seconds.
      this.state = 'unclaimed';
      this.retryIn = 20;
      if (!this.warned) { this.warned = true; this.log(`GameHud weapon card unavailable; keeping the stock weapons HUD and trying again: ${String(error)}`); }
      return false;
    }
  }

  private disabled = false;

  /** Switch the card off (back to the stock weapons HUD) or on again, for an A/B frame-time test. */
  setEnabled(on: boolean): void {
    this.disabled = !on;
    if (!on) this.dispose();
  }

  isEnabled(): boolean { return !this.disabled; }

  /** Swap the stock weapons HUD for the card for these players. */
  paint(slots: Iterable<number>): void {
    if (this.disabled || !this.claim()) return;
    for (const slot of slots) {
      if (this.hidden.has(slot)) continue;
      this.hidden.add(slot);
      Hud.hide(slot, WEAPONS_BIT);
    }
  }

  forget(actor: UiActor): void {
    if (this.hidden.delete(actor.slot)) Hud.show(actor.slot, WEAPONS_BIT);
  }

  dispose(): void {
    for (const slot of this.hidden) Hud.show(slot, WEAPONS_BIT);
    this.hidden.clear();
    if (this.state === 'held') { try { GameHud.weapon.release(); } catch { /* unloading */ } }
    this.state = 'unclaimed';
  }
}
