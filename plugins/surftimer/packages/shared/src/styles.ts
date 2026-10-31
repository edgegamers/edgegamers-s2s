// Run styles (SurfTimer parity). Each style has its own leaderboard; enforcement lives in the core
// plugin (input filtering only while a restricted style is in use).

export interface StyleDef {
  readonly id: number;
  readonly name: string;
  /** Short tag for chat/HUD/bot names. */
  readonly tag: string;
  /** Allowed movement inputs: which usercmd axes survive. */
  readonly forward: boolean;
  readonly back: boolean;
  readonly left: boolean;
  readonly right: boolean;
  /** Gravity multiplier applied while the style is active (1 = normal). */
  readonly gravity: number;
  /** Half-Sideways: a strafe only counts while a forward/back axis is held with it (and vice versa). */
  readonly requireForwardWithSide: boolean;
}

export const STYLES: readonly StyleDef[] = Object.freeze([
  { id: 0, name: "Normal", tag: "N", forward: true, back: true, left: true, right: true, gravity: 1, requireForwardWithSide: false },
  { id: 1, name: "Sideways", tag: "SW", forward: true, back: true, left: false, right: false, gravity: 1, requireForwardWithSide: false },
  { id: 2, name: "Half-Sideways", tag: "HSW", forward: true, back: true, left: true, right: true, gravity: 1, requireForwardWithSide: true },
  { id: 3, name: "Backwards", tag: "BW", forward: true, back: true, left: true, right: true, gravity: 1, requireForwardWithSide: false },
  { id: 4, name: "Low-Gravity", tag: "LG", forward: true, back: true, left: true, right: true, gravity: 0.5, requireForwardWithSide: false },
  { id: 5, name: "W-Only", tag: "W", forward: true, back: false, left: false, right: false, gravity: 1, requireForwardWithSide: false },
  { id: 6, name: "A/D-Only", tag: "AD", forward: false, back: false, left: true, right: true, gravity: 1, requireForwardWithSide: false },
]);

export const STYLE_NORMAL = 0;
export const STYLE_BACKWARDS = 3;

export function styleById(id: number): StyleDef {
  return STYLES[id] ?? STYLES[0];
}

/** Resolve a user-typed style (`sw`, `sideways`, `2`) to an id, or -1. */
export function parseStyle(input: string): number {
  const s = input.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  if (s === "") return -1;
  const n = Number(s);
  if (Number.isInteger(n) && n >= 0 && n < STYLES.length) return n;
  for (const st of STYLES) {
    if (st.tag.toLowerCase() === s || st.name.toLowerCase().replace(/[^a-z0-9]/g, "") === s) return st.id;
  }
  return -1;
}

/** Display name for a track: 0 = main map, N = bonus N. */
export function trackName(track: number): string {
  return track === 0 ? "Map" : "Bonus " + track;
}
