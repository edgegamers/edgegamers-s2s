/**
 * SteamID text → SteamID64 (decimal string) — pure. Accepts SteamID64, SteamID3 (`[U:1:N]`) and
 * legacy `STEAM_X:Y:Z`. Uses BigInt internally; never returns a number.
 */
const BASE = 76561197960265728n;

export function parseSteamId(s: string): string | null {
  const t = s.trim();
  if (/^7656119\d{10}$/.test(t)) return t;
  const id3 = /^\[?U:1:(\d+)\]?$/.exec(t);
  if (id3) return (BASE + BigInt(id3[1])).toString();
  const legacy = /^STEAM_[0-5]:([01]):(\d+)$/.exec(t);
  if (legacy) return (BASE + BigInt(legacy[2]) * 2n + BigInt(legacy[1])).toString();
  return null;
}
