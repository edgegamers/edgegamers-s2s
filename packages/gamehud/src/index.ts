/**
 * Shared GameHud helpers for every gamemode in this repo.
 *
 * `@s2script/cs2`'s GameHud owns the panels (rail, status card, kill feed, toast). Each paint is a
 * network write per player, and fields left out of a paint keep their last value, so a gamemode
 * that rebuilds its whole view several times a second should only send what changed. That is what
 * {@link RegionPainter} does. The rest is formatting every mode needs the same way: the chat tags a
 * label may lead with, the round clock and the bar percentages.
 *
 * Nothing here touches the engine. The GameHud region is passed in, so this package stays pure and
 * testable, and each plugin keeps its own claim.
 */
import type { GameHudAudience, GameHudTone } from "@s2script/cs2";

/**
 * The chat tags from docs/translations/STYLE.md, plus the TTT role colours (darkblue for the
 * Detective). A label that leads with one of these takes that colour on the HUD.
 */
export const STYLE_TONES = [
  "grey", "white", "yellow", "green", "blue", "orange", "red", "lightred", "lightblue", "darkred", "darkblue",
] as const satisfies readonly GameHudTone[];
export type StyleTone = (typeof STYLE_TONES)[number];

const TONES: ReadonlySet<string> = new Set<string>(STYLE_TONES);
const LEADING = /^\s*\{([a-z]+)\}/i;

/** The tone a label's leading chat tag names, or `undefined` when it leads with none we know. */
export function leadingTone(text: string): StyleTone | undefined {
  const match = LEADING.exec(text);
  const name = match?.[1]?.toLowerCase();
  return name !== undefined && TONES.has(name) ? (name as StyleTone) : undefined;
}

/** Remove every `{tag}`, for comparisons and for surfaces that take no colour. */
export function stripTags(text: string): string {
  return text.replace(/\{[a-z]+\}/gi, "");
}

/** `m:ss` for a round clock. Negative or non-finite input reads as `0:00`. */
export function clock(seconds: number): string {
  const s = Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : 0;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r < 10 ? "0" : ""}${r}`;
}

/** `value` out of `max` as a 0-100 bar value. A zero or negative `max` reads as an empty bar. */
export function percent(value: number, max: number): number {
  if (!(max > 0) || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round((value / max) * 100)));
}

/**
 * Rail pips draw at most ten. Scale `alive` of `total` down to ten pips, keeping at least one lit
 * pip while anyone is alive, so the rail never reads as a wipe that has not happened.
 */
export function pips(alive: number, total: number): { alive: number; total: number } {
  const t = Math.max(0, Math.floor(total));
  const a = Math.max(0, Math.min(t, Math.floor(alive)));
  if (t <= 10) return { alive: a, total: t };
  const lit = Math.round((a / t) * 10);
  return { alive: a > 0 ? Math.max(1, lit) : 0, total: 10 };
}

/** The part of a GameHud region a painter needs: `GameHudRail` and `GameHudStatus` both fit. */
export interface PaintableRegion<Spec> {
  set(audience: GameHudAudience, spec: Spec): void;
  hide(audience?: GameHudAudience): void;
}

/**
 * Sends each player only the fields of a spec that changed since their last paint.
 *
 * Fields compare by value (objects and arrays through JSON), so rebuilding a fresh spec every tick
 * is fine. A field that disappears from the spec is left as it was, which matches GameHud's own
 * "fields you leave out keep their last value"; send an explicit value to clear one.
 */
export class RegionPainter<Spec extends object> {
  private readonly last = new Map<number, Map<string, string>>();
  private readonly hidden = new Set<number>();
  private readonly region: PaintableRegion<Spec>;

  constructor(region: PaintableRegion<Spec>) {
    this.region = region;
  }

  /** Paint `spec` for `slot`. Returns true when anything was sent. */
  paint(slot: number, spec: Spec): boolean {
    let seen = this.last.get(slot);
    const fresh = seen === undefined || this.hidden.has(slot);
    if (seen === undefined) {
      seen = new Map();
      this.last.set(slot, seen);
    }
    const delta: Record<string, unknown> = {};
    let changed = false;
    for (const [key, value] of Object.entries(spec)) {
      if (value === undefined) continue;
      const encoded = typeof value === "object" ? JSON.stringify(value) : `${typeof value}:${String(value)}`;
      if (!fresh && seen.get(key) === encoded) continue;
      seen.set(key, encoded);
      delta[key] = value;
      changed = true;
    }
    if (fresh) {
      this.hidden.delete(slot);
      // A first paint (or the first after a hide) must show the region even when nothing changed.
      changed = true;
    }
    if (changed) this.region.set(slot, delta as Spec);
    return changed;
  }

  /** Hide the region for `slot`. The next paint resends everything. */
  hide(slot: number): void {
    if (this.hidden.has(slot) || !this.last.has(slot)) return;
    this.hidden.add(slot);
    this.region.hide(slot);
  }

  /** Whether `slot` currently has a painted, visible region. */
  isShown(slot: number): boolean {
    return this.last.has(slot) && !this.hidden.has(slot);
  }

  /** Drop what we know about `slot` (a disconnect). Sends nothing. */
  forget(slot: number): void {
    this.last.delete(slot);
    this.hidden.delete(slot);
  }

  /** Slots with a visible region. */
  shownSlots(): number[] {
    return [...this.last.keys()].filter((slot) => !this.hidden.has(slot));
  }

  /** Hide the region for every painted slot and forget them all. */
  reset(): void {
    const shown = this.shownSlots();
    this.last.clear();
    this.hidden.clear();
    if (shown.length > 0) this.region.hide(shown);
  }
}
