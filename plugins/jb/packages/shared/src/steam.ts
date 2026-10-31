/** True for a canonical, nonzero decimal SteamID64 string (what contracts carry). */
export function isSteamId64(s: string): boolean {
  return /^[1-9][0-9]{0,19}$/.test(s) && s.length <= 20;
}
