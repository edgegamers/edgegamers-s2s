/**
 * Who killed whom, recently — the gate on RDM reports.
 *
 * The C# RDM manager (`CaseManager.FileReport`) only lets a player report a death they were the
 * VICTIM of, and only within `ReportWindowSeconds` (60) of it. Without that, `!report` was a free
 * accusation channel: anyone could report anyone at any time, alive or dead, killed by them or not.
 *
 * Kills are keyed by connection (SteamID + generation) on both sides, so a slot taken over by
 * someone else never inherits an old victim's right to report, nor makes the newcomer reportable.
 * Game time restarts at a map change, which retires every older entry without an explicit clear.
 *
 * Import-free on purpose: Core binds the clock, the identity lookup and the window at startup.
 */

interface Identity {
  steamId: string;
  gen: number;
}

interface Kill {
  victim: Identity;
  killerSlot: number;
  killer: Identity;
  at: number;
}

interface LedgerBinding {
  /** Game time, seconds. */
  now(): number;
  /** The connection currently in `slot` (empty SteamID = nobody). */
  identity(slot: number): Identity;
  /** Seconds after a death during which the victim may report it (`sm_ttt_rdm_report_window`). */
  windowSeconds(): number;
}

let binding: LedgerBinding | null = null;
let kills: Kill[] = [];

export function bindKillLedger(b: LedgerBinding): void {
  binding = b;
  kills = [];
}

/** Record that `killer` killed `victim` just now. A suicide or a world death records nothing. */
export function noteKill(victim: number, killer: number): void {
  const b = binding;
  if (b === null || killer < 0 || killer === victim) return;
  const v = b.identity(victim), k = b.identity(killer);
  if (v.steamId === "" || k.steamId === "") return;
  const now = b.now();
  // Drop anything already outside the window so the list stays a handful of entries.
  const window = b.windowSeconds();
  kills = kills.filter((e) => e.at <= now && now - e.at <= window);
  kills.push({ victim: v, killerSlot: killer, killer: k, at: now });
}

function same(a: Identity, b: Identity): boolean {
  return a.steamId === b.steamId && a.gen === b.gen;
}

/**
 * The slots `victim` may report right now: everyone who killed them within the window and is still
 * the same connection. Most recent first, without duplicates.
 */
export function reportableKillers(victim: number): number[] {
  const b = binding;
  if (b === null) return [];
  const v = b.identity(victim);
  if (v.steamId === "") return [];
  const now = b.now(), window = b.windowSeconds();
  const out: number[] = [];
  for (let i = kills.length - 1; i >= 0; i--) {
    const e = kills[i]!;
    if (e.at > now || now - e.at > window) continue;
    if (!same(e.victim, v)) continue;
    if (!same(e.killer, b.identity(e.killerSlot))) continue;
    if (!out.includes(e.killerSlot)) out.push(e.killerSlot);
  }
  return out;
}

/** May `reporter` report `accused`? Only if `accused` killed them within the window. */
export function mayReport(reporter: number, accused: number): boolean {
  return reportableKillers(reporter).includes(accused);
}

/** The configured window, for messages. */
export function reportWindowSeconds(): number {
  return binding?.windowSeconds() ?? 0;
}
