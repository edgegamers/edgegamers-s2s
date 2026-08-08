export function normalizeSteamId(steamId: string): string {
  return steamId.trim().toUpperCase();
}

export function hasPermission(steamId: string, permission: string): boolean {
  return normalizeSteamId(steamId).length > 0 && permission.trim().length > 0;
}
